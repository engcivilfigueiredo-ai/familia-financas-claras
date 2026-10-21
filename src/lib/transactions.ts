import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toISO, parseISO } from "./format";
import { invoiceMonthFor, invoiceClosingDate, invoiceDueDate } from "./finance";
import { planInstallmentPurchase, type CardMeta, type InstallmentInput } from "./installment-plan";

export type { CardMeta, InstallmentInput } from "./installment-plan";

async function uid(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sessão expirada. Faça login novamente.");
  return data.user.id;
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** Erro de chamada RPC; se a função não existe, o banco ainda não recebeu a atualização. */
function failRpc(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) {
    throw new Error(
      "O banco ainda não recebeu a atualização mais recente. Rode o SQL pendente da pasta " +
        "supabase/migrations (a mais nova) e tente de novo.",
    );
  }
  throw new Error(error.message);
}

async function ensureInvoice(user_id: string, card: CardMeta, referenceMonth: string) {
  const closing = invoiceClosingDate(referenceMonth, card.closing_day);
  const due = invoiceDueDate(referenceMonth, card.closing_day, card.due_day);
  const { error } = await supabase.from("invoices").upsert(
    {
      user_id,
      credit_card_id: card.id,
      reference_month: referenceMonth,
      closing_date: closing,
      due_date: due,
    },
    { onConflict: "credit_card_id,reference_month" },
  );
  fail(error);
}

export interface SimpleTxInput {
  id?: string;
  type: "receita" | "despesa";
  description: string;
  amount: number;
  date: string;
  category_id: string | null;
  account_id: string | null;
  credit_card_id: string | null;
  family_member_id: string | null;
  payment_method: string | null;
  status: string;
  notes: string | null;
  tags: string[];
  project_id?: string | null;
  bf_expense_type?: string | null;
}

/** Rule 2: card expenses are attached to the matching invoice month. */
export async function saveSimpleTransaction(input: SimpleTxInput, card?: CardMeta | null) {
  const user_id = await uid();
  const invoice_month =
    input.credit_card_id && card ? invoiceMonthFor(input.date, card.closing_day) : null;
  if (invoice_month && card) await ensureInvoice(user_id, card, invoice_month);

  const row = {
    user_id,
    type: input.type,
    description: input.description,
    amount: Math.abs(input.amount),
    date: input.date,
    category_id: input.category_id,
    account_id: input.credit_card_id ? null : input.account_id,
    credit_card_id: input.credit_card_id,
    family_member_id: input.family_member_id,
    payment_method: input.payment_method,
    status: input.status,
    notes: input.notes,
    tags: input.tags,
    invoice_month,
    project_id: input.project_id ?? null,
    bf_expense_type: input.bf_expense_type ?? null,
  };

  if (input.id) {
    const { error } = await supabase.from("transactions").update(row).eq("id", input.id);
    fail(error);
    return input.id;
  }
  const { data, error } = await supabase.from("transactions").insert(row).select("id").single();
  fail(error);
  return data?.id as string;
}

/**
 * Rule 3: cada parcela vira um lançamento. O plano é calculado aqui (testado em
 * installment-plan.ts) e o banco grava cabeçalho, faturas e parcelas numa única transação:
 * ou entra tudo, ou nada.
 */
export async function createInstallmentPurchase(input: InstallmentInput, card: CardMeta) {
  const plan = planInstallmentPurchase(input, card);
  const { data, error } = await supabase.rpc("create_installment_purchase", {
    p_parent: plan.parent,
    p_invoices: plan.invoices,
    p_rows: plan.rows,
  });
  failRpc(error);
  return data as string;
}

export interface TransferInput {
  description: string;
  amount: number;
  date: string;
  from_account_id: string;
  to_account_id: string | null;
  to_credit_card_id: string | null;
  family_member_id: string | null;
  notes: string | null;
  invoice_month?: string | null;
}

/**
 * Rules 1 & 4: transfers (including invoice payments) are two linked legs and
 * never appear as income or expense. Legs are signed: negative = out.
 */
export async function createTransfer(input: TransferInput) {
  const user_id = await uid();
  const transfer_group_id = crypto.randomUUID();
  const amount = Math.abs(input.amount);
  const common = {
    user_id,
    type: "transferencia",
    date: input.date,
    family_member_id: input.family_member_id,
    status: "pago",
    payment_method: "transferência",
    notes: input.notes,
    transfer_group_id,
    tags: [] as string[],
  };
  const legs = [
    {
      ...common,
      description: `${input.description} (saída)`,
      amount: -amount,
      account_id: input.from_account_id,
      credit_card_id: null,
    },
    {
      ...common,
      description: `${input.description} (entrada)`,
      amount,
      account_id: input.to_credit_card_id ? null : input.to_account_id,
      credit_card_id: input.to_credit_card_id,
      invoice_month: input.to_credit_card_id ? (input.invoice_month ?? null) : null,
    },
  ];
  const { error } = await supabase.from("transactions").insert(legs);
  fail(error);
  return transfer_group_id;
}

export async function deleteTransferGroup(transfer_group_id: string) {
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("transfer_group_id", transfer_group_id);
  fail(error);
}

export interface InvestmentMoveInput {
  investment_id: string;
  account_id: string | null;
  amount: number;
  date: string;
  type: "aplicação" | "resgate" | "rendimento" | "dividendo" | "jcp";
  ir_type: string | null;
  family_member_id: string | null;
  investment_name: string;
  /** Quando o aporte vem de uma recorrência, liga a transferência a ela (evita duplicar). */
  recurring_id?: string | null;
  /** Ações, FIIs, ETFs e cripto: cotas e preço por cota da compra/venda. */
  quantity?: number | null;
  unit_price?: number | null;
}

/**
 * Rules 5 & 6, executadas no banco (register_investment_move): grava o movimento, o lançamento
 * de caixa e os novos valores do investimento numa transação só, travando a linha do
 * investimento para que dois aportes simultâneos não sobrescrevam um ao outro.
 */
async function executeInvestmentMove(input: InvestmentMoveInput) {
  type Args = Database["public"]["Functions"]["register_investment_move"]["Args"];
  const args: Args = {
    p_investment_id: input.investment_id,
    p_type: input.type,
    p_amount: Math.abs(input.amount),
    p_date: input.date,
    p_investment_name: input.investment_name,
    ...(input.account_id ? { p_account_id: input.account_id } : {}),
    ...(input.ir_type ? { p_ir_type: input.ir_type } : {}),
    ...(input.family_member_id ? { p_family_member_id: input.family_member_id } : {}),
    ...(input.recurring_id ? { p_recurring_id: input.recurring_id } : {}),
    ...(input.quantity ? { p_quantity: input.quantity } : {}),
    ...(input.unit_price ? { p_unit_price: input.unit_price } : {}),
  };
  const { error } = await supabase.rpc("register_investment_move", args);
  failRpc(error);
}

/**
 * Rules 5 & 6: contributions/redemptions move money between account and
 * investment (transfer legs). Yields, dividends and JCP are income.
 */
export async function createInvestmentMove(input: InvestmentMoveInput) {
  return executeInvestmentMove(input);
}

export interface RecurringForMaterialize {
  id: string;
  description: string;
  amount: number;
  type: string;
  frequency: string;
  start_date: string;
  end_date: string | null;
  category_id: string | null;
  account_id: string | null;
  credit_card_id: string | null;
  family_member_id: string | null;
  investment_id?: string | null;
  is_investment_contribution?: boolean;
  investment_name?: string | null;
}

/** Rule 7 helper: generates recurring transactions up to a horizon. */
export async function materializeRecurring(recurring: RecurringForMaterialize, dates: string[]) {
  if (recurring.is_investment_contribution && recurring.investment_id) {
    // Aporte mexe no saldo da conta e no valor investido na hora. Por isso só registramos
    // os vencidos (data <= hoje); os futuros são gerados quando chegar a data.
    const today = toISO(new Date());
    const due = dates.filter((date) => date <= today);
    for (const date of due) {
      await executeInvestmentMove({
        investment_id: recurring.investment_id,
        account_id: recurring.account_id,
        amount: recurring.amount,
        date,
        type: "aplicação",
        ir_type: null,
        family_member_id: recurring.family_member_id,
        investment_name: recurring.investment_name ?? recurring.description,
        recurring_id: recurring.id,
      });
    }
    return due.length;
  }

  const user_id = await uid();
  const rows = dates.map((date) => ({
    user_id,
    type: recurring.type,
    description: recurring.description,
    amount: Math.abs(recurring.amount),
    date,
    category_id: recurring.category_id,
    account_id: recurring.credit_card_id ? null : recurring.account_id,
    credit_card_id: recurring.credit_card_id,
    family_member_id: recurring.family_member_id,
    status: date <= toISO(new Date()) ? "pago" : "pendente",
    is_recurring: true,
    recurring_id: recurring.id,
    tags: [] as string[],
  }));
  if (!rows.length) return 0;
  const { error } = await supabase.from("transactions").insert(rows);
  fail(error);
  return rows.length;
}

/**
 * Removes pending future occurrences of a recurring transaction so they can
 * be regenerated with the updated recurrence data. Past/paid history is kept.
 */
export async function deleteFutureRecurringOccurrences(recurringId: string, fromDate: string) {
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("recurring_id", recurringId)
    .eq("status", "pendente")
    .gte("date", fromDate);
  fail(error);
}

export function nextInvoiceMonthFromToday(closing_day: number): string {
  return invoiceMonthFor(toISO(new Date()), closing_day);
}

export function monthLabelDate(iso: string): Date {
  return parseISO(iso);
}
