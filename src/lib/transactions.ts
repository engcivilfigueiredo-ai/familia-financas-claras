import { supabase } from "@/integrations/supabase/client";
import { addMonths, monthStart, toISO, parseISO } from "./format";
import { invoiceMonthFor, invoiceClosingDate, invoiceDueDate } from "./finance";

async function uid(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sessão expirada. Faça login novamente.");
  return data.user.id;
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export interface CardMeta {
  id: string;
  closing_day: number;
  due_day: number;
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

export interface InstallmentInput {
  purchase_description: string;
  total_amount: number;
  installment_count: number;
  credit_card_id: string;
  category_id: string | null;
  family_member_id: string | null;
  purchase_date: string;
  notes: string | null;
  tags: string[];
}

/** Rule 3: generate every installment as an individual transaction. */
export async function createInstallmentPurchase(input: InstallmentInput, card: CardMeta) {
  const user_id = await uid();
  const { data: parent, error } = await supabase
    .from("installments")
    .insert({
      user_id,
      purchase_description: input.purchase_description,
      total_amount: input.total_amount,
      installment_count: input.installment_count,
      credit_card_id: input.credit_card_id,
      category_id: input.category_id,
      family_member_id: input.family_member_id,
      purchase_date: input.purchase_date,
    })
    .select("id")
    .single();
  fail(error);

  const base = Math.floor((input.total_amount * 100) / input.installment_count) / 100;
  const remainder = Number((input.total_amount - base * input.installment_count).toFixed(2));
  const firstInvoice = invoiceMonthFor(input.purchase_date, card.closing_day);

  const rows = [];
  for (let i = 0; i < input.installment_count; i += 1) {
    const invoice_month = monthStart(addMonths(firstInvoice, i));
    await ensureInvoice(user_id, card, invoice_month);
    const amount = i === 0 ? Number((base + remainder).toFixed(2)) : base;
    rows.push({
      user_id,
      type: "despesa",
      description: `${input.purchase_description} (${i + 1}/${input.installment_count})`,
      amount,
      date: i === 0 ? input.purchase_date : invoice_month,
      category_id: input.category_id,
      credit_card_id: input.credit_card_id,
      family_member_id: input.family_member_id,
      payment_method: "crédito",
      status: "pendente",
      installment_id: parent?.id,
      installment_number: i + 1,
      invoice_month,
      notes: input.notes,
      tags: input.tags,
    });
  }
  const { error: txError } = await supabase.from("transactions").insert(rows);
  fail(txError);
  return parent?.id as string;
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
}

/**
 * Rules 5 & 6: contributions/redemptions move money between account and
 * investment (transfer legs). Yields, dividends and JCP are income.
 */
export async function createInvestmentMove(input: InvestmentMoveInput) {
  const user_id = await uid();
  const amount = Math.abs(input.amount);

  const { error: itError } = await supabase.from("investment_transactions").insert({
    user_id,
    investment_id: input.investment_id,
    account_id: input.account_id,
    type: input.type,
    amount,
    date: input.date,
    ir_type: input.ir_type,
  });
  fail(itError);

  const { data: inv, error: invError } = await supabase
    .from("investments")
    .select("invested_amount, current_amount")
    .eq("id", input.investment_id)
    .single();
  fail(invError);

  let invested = Number(inv?.invested_amount ?? 0);
  let current = Number(inv?.current_amount ?? 0);

  if (input.type === "aplicação") {
    invested += amount;
    current += amount;
    if (input.account_id) {
      const { error } = await supabase.from("transactions").insert({
        user_id,
        type: "transferencia",
        description: `Aporte em ${input.investment_name}`,
        amount: -amount,
        date: input.date,
        account_id: input.account_id,
        family_member_id: input.family_member_id,
        status: "pago",
        payment_method: "transferência",
        transfer_group_id: crypto.randomUUID(),
        tags: [],
      });
      fail(error);
    }
  } else if (input.type === "resgate") {
    invested = Math.max(invested - amount, 0);
    current = Math.max(current - amount, 0);
    if (input.account_id) {
      const { error } = await supabase.from("transactions").insert({
        user_id,
        type: "transferencia",
        description: `Resgate de ${input.investment_name}`,
        amount,
        date: input.date,
        account_id: input.account_id,
        family_member_id: input.family_member_id,
        status: "pago",
        payment_method: "transferência",
        transfer_group_id: crypto.randomUUID(),
        tags: [],
      });
      fail(error);
    }
  } else {
    // rendimento / dividendo / jcp -> receita no fluxo de caixa
    current += amount;
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("type", "receita")
      .in("name", input.type === "dividendo" ? ["Dividendos"] : ["Rendimentos"])
      .limit(1);
    const { error } = await supabase.from("transactions").insert({
      user_id,
      type: "receita",
      description: `${input.type === "jcp" ? "JCP" : input.type === "dividendo" ? "Dividendo" : "Rendimento"} - ${input.investment_name}`,
      amount,
      date: input.date,
      account_id: input.account_id,
      category_id: cat?.[0]?.id ?? null,
      family_member_id: input.family_member_id,
      status: "pago",
      notes: input.ir_type ? `IR: ${input.ir_type}` : null,
      tags: [],
    });
    fail(error);
  }

  const { error: updError } = await supabase
    .from("investments")
    .update({ invested_amount: invested, current_amount: current })
    .eq("id", input.investment_id);
  fail(updError);
}

/** Rule 7 helper: generates recurring transactions up to a horizon. */
export async function materializeRecurring(
  recurring: {
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
  },
  dates: string[],
) {
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

export function nextInvoiceMonthFromToday(closing_day: number): string {
  return invoiceMonthFor(toISO(new Date()), closing_day);
}

export function monthLabelDate(iso: string): Date {
  return parseISO(iso);
}
