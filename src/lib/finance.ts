import { addMonths, monthStart, parseISO, toISO } from "./format";

export type TxType = "receita" | "despesa" | "transferencia";

export interface Tx {
  id: string;
  type: string;
  amount: number;
  date: string;
  status: string;
  description: string;
  account_id: string | null;
  credit_card_id: string | null;
  category_id: string | null;
  family_member_id: string | null;
  invoice_month: string | null;
  transfer_group_id: string | null;
  installment_id: string | null;
  installment_number: number | null;
  is_recurring: boolean;
  payment_method: string | null;
  tags: string[] | null;
  notes: string | null;
}

export interface AccountRow {
  id: string;
  name: string;
  initial_balance: number;
  family_member_id: string | null;
  is_active: boolean;
  type: string;
  color: string;
  institution: string | null;
}

export interface CardRow {
  id: string;
  name: string;
  credit_limit: number;
  closing_day: number;
  due_day: number;
  family_member_id: string | null;
  is_active: boolean;
  color: string;
  institution: string | null;
  brand: string | null;
}

/**
 * Business rule 2: a card purchase belongs to the invoice whose closing day
 * comes after the purchase date. Returns the first day of the reference month.
 */
export function invoiceMonthFor(dateISO: string, closingDay: number): string {
  const d = parseISO(dateISO);
  const day = d.getDate();
  const base = new Date(d.getFullYear(), d.getMonth(), 1);
  if (day > closingDay) base.setMonth(base.getMonth() + 1);
  return toISO(base);
}

export function invoiceClosingDate(referenceMonth: string, closingDay: number): string {
  const d = parseISO(referenceMonth);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return toISO(new Date(d.getFullYear(), d.getMonth(), Math.min(closingDay, last)));
}

export function invoiceDueDate(
  referenceMonth: string,
  closingDay: number,
  dueDay: number,
): string {
  const d = parseISO(referenceMonth);
  const monthOffset = dueDay <= closingDay ? 1 : 0;
  const target = new Date(d.getFullYear(), d.getMonth() + monthOffset, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toISO(new Date(target.getFullYear(), target.getMonth(), Math.min(dueDay, last)));
}

/** Rule: transfer legs are stored signed (negative = out, positive = in). */
export function accountBalance(account: AccountRow, txs: Tx[]): number {
  let balance = Number(account.initial_balance ?? 0);
  for (const t of txs) {
    if (t.account_id !== account.id) continue;
    if (t.status !== "pago") continue;
    if (t.type === "receita") balance += Number(t.amount);
    else if (t.type === "despesa") {
      if (!t.credit_card_id) balance -= Number(t.amount);
    } else if (t.type === "transferencia") {
      balance += Number(t.amount);
    }
  }
  return balance;
}

/** Open invoice total for a card: purchases not yet covered by payments. */
export function cardInvoiceTotal(cardId: string, referenceMonth: string, txs: Tx[]): number {
  let total = 0;
  for (const t of txs) {
    if (t.credit_card_id !== cardId) continue;
    if (t.invoice_month !== referenceMonth) continue;
    if (t.type === "despesa") total += Number(t.amount);
    if (t.type === "transferencia") total -= Math.abs(Number(t.amount));
  }
  return Math.max(total, 0);
}

/** Total unpaid card debt across all months (used for net worth). */
export function cardOutstanding(cardId: string, txs: Tx[]): number {
  let total = 0;
  for (const t of txs) {
    if (t.credit_card_id !== cardId) continue;
    if (t.type === "despesa") total += Number(t.amount);
    if (t.type === "transferencia") total -= Math.abs(Number(t.amount));
  }
  return Math.max(total, 0);
}

export function cardInvoiceMonths(cardId: string, txs: Tx[]): string[] {
  const set = new Set<string>();
  for (const t of txs) {
    if (t.credit_card_id === cardId && t.invoice_month) set.add(t.invoice_month);
  }
  return [...set].sort();
}

export type PeriodKey =
  | "this-month"
  | "last-month"
  | "last-3"
  | "last-6"
  | "this-year"
  | "custom";

export interface Period {
  from: string;
  to: string;
  label: string;
}

export const PERIOD_LABELS: Record<Exclude<PeriodKey, "custom">, string> = {
  "this-month": "Este mês",
  "last-month": "Mês anterior",
  "last-3": "Últimos 3 meses",
  "last-6": "Últimos 6 meses",
  "this-year": "Este ano",
};

export function resolvePeriod(key: PeriodKey, custom?: { from: string; to: string }): Period {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const endOf = (year: number, month: number) => toISO(new Date(year, month + 1, 0));
  switch (key) {
    case "last-month":
      return {
        from: toISO(new Date(y, m - 1, 1)),
        to: endOf(y, m - 1),
        label: PERIOD_LABELS["last-month"],
      };
    case "last-3":
      return {
        from: toISO(new Date(y, m - 2, 1)),
        to: endOf(y, m),
        label: PERIOD_LABELS["last-3"],
      };
    case "last-6":
      return {
        from: toISO(new Date(y, m - 5, 1)),
        to: endOf(y, m),
        label: PERIOD_LABELS["last-6"],
      };
    case "this-year":
      return { from: toISO(new Date(y, 0, 1)), to: endOf(y, 11), label: PERIOD_LABELS["this-year"] };
    case "custom":
      return {
        from: custom?.from ?? monthStart(now),
        to: custom?.to ?? endOf(y, m),
        label: "Personalizado",
      };
    default:
      return {
        from: toISO(new Date(y, m, 1)),
        to: endOf(y, m),
        label: PERIOD_LABELS["this-month"],
      };
  }
}

export function monthsInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = monthStart(from);
  const end = monthStart(to);
  let guard = 0;
  while (cursor <= end && guard < 240) {
    out.push(cursor);
    cursor = monthStart(addMonths(cursor, 1));
    guard += 1;
  }
  return out;
}

export function inPeriod(dateISO: string, period: Period): boolean {
  return dateISO >= period.from && dateISO <= period.to;
}

/** Rule 1 & 5: transfers never count as income/expense. */
export function isIncome(t: Tx): boolean {
  return t.type === "receita";
}
export function isExpense(t: Tx): boolean {
  return t.type === "despesa";
}

export const ACCOUNT_TYPES = [
  "corrente",
  "poupança",
  "carteira",
  "digital",
  "investimento",
  "outros",
] as const;

export const INVESTMENT_TYPES = [
  "renda fixa",
  "CDB",
  "Tesouro Direto",
  "LCI/LCA",
  "fundos",
  "ações",
  "ETFs",
  "FIIs",
  "cripto",
  "previdência",
  "outros",
] as const;

export const INVESTMENT_TX_TYPES = [
  "aplicação",
  "resgate",
  "rendimento",
  "dividendo",
  "jcp",
] as const;

export const IR_TYPES = ["isento", "15%", "tabela regressiva"] as const;

export const RECURRENCE_FREQUENCIES = [
  "semanal",
  "quinzenal",
  "mensal",
  "bimestral",
  "trimestral",
  "semestral",
  "anual",
] as const;

export const PAYMENT_METHODS = [
  "pix",
  "dinheiro",
  "débito",
  "crédito",
  "boleto",
  "transferência",
  "outros",
] as const;

export const ASSET_TYPES = [
  "imóvel",
  "veículo",
  "equipamento",
  "participação",
  "outros",
] as const;

export const LIABILITY_TYPES = [
  "financiamento",
  "empréstimo",
  "consórcio",
  "cartão",
  "outros",
] as const;

export function addFrequency(iso: string, frequency: string): string {
  const d = parseISO(iso);
  switch (frequency) {
    case "semanal":
      d.setDate(d.getDate() + 7);
      break;
    case "quinzenal":
      d.setDate(d.getDate() + 15);
      break;
    case "bimestral":
      d.setMonth(d.getMonth() + 2);
      break;
    case "trimestral":
      d.setMonth(d.getMonth() + 3);
      break;
    case "semestral":
      d.setMonth(d.getMonth() + 6);
      break;
    case "anual":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }
  return toISO(d);
}
