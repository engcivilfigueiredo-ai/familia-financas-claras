import { addMonths, monthStart } from "./format";
import { invoiceClosingDate, invoiceDueDate, invoiceMonthFor } from "./finance";

export interface CardMeta {
  id: string;
  closing_day: number;
  due_day: number;
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

// `type` (e não `interface`) para ser aceito como JSON pelo cliente do Supabase.
export type InstallmentPlan = {
  parent: {
    purchase_description: string;
    total_amount: number;
    installment_count: number;
    credit_card_id: string;
    category_id: string | null;
    family_member_id: string | null;
    purchase_date: string;
  };
  invoices: { reference_month: string; closing_date: string; due_date: string }[];
  rows: {
    description: string;
    amount: number;
    date: string;
    category_id: string | null;
    credit_card_id: string;
    family_member_id: string | null;
    payment_method: string;
    status: string;
    installment_number: number;
    invoice_month: string;
    notes: string | null;
    tags: string[];
  }[];
};

/**
 * Rule 3: calcula tudo de uma compra parcelada (cabeçalho, faturas e cada parcela) sem tocar
 * no banco. O banco só grava o resultado, de uma vez (create_installment_purchase).
 *
 * Os valores são divididos em centavos inteiros; o resto da divisão vai para a 1ª parcela,
 * então a soma das parcelas é sempre exatamente o total.
 */
export function planInstallmentPurchase(input: InstallmentInput, card: CardMeta): InstallmentPlan {
  const count = input.installment_count;
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Informe um número de parcelas válido.");
  }
  const totalCents = Math.round(input.total_amount * 100);
  if (!Number.isFinite(totalCents) || totalCents <= 0) {
    throw new Error("Informe um valor total maior que zero.");
  }

  const baseCents = Math.floor(totalCents / count);
  const firstCents = baseCents + (totalCents - baseCents * count);
  const firstInvoice = invoiceMonthFor(input.purchase_date, card.closing_day);

  const invoices: InstallmentPlan["invoices"] = [];
  const rows: InstallmentPlan["rows"] = [];
  for (let i = 0; i < count; i += 1) {
    const invoice_month = monthStart(addMonths(firstInvoice, i));
    invoices.push({
      reference_month: invoice_month,
      closing_date: invoiceClosingDate(invoice_month, card.closing_day),
      due_date: invoiceDueDate(invoice_month, card.closing_day, card.due_day),
    });
    rows.push({
      description: `${input.purchase_description} (${i + 1}/${count})`,
      amount: (i === 0 ? firstCents : baseCents) / 100,
      date: i === 0 ? input.purchase_date : invoice_month,
      category_id: input.category_id,
      credit_card_id: input.credit_card_id,
      family_member_id: input.family_member_id,
      payment_method: "crédito",
      status: "pendente",
      installment_number: i + 1,
      invoice_month,
      notes: input.notes,
      tags: input.tags,
    });
  }

  return {
    parent: {
      purchase_description: input.purchase_description,
      total_amount: totalCents / 100,
      installment_count: count,
      credit_card_id: input.credit_card_id,
      category_id: input.category_id,
      family_member_id: input.family_member_id,
      purchase_date: input.purchase_date,
    },
    invoices,
    rows,
  };
}
