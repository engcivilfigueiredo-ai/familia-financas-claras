import { describe, expect, it } from "vitest";
import { planInstallmentPurchase, type CardMeta, type InstallmentInput } from "./installment-plan";

const card: CardMeta = { id: "card-1", closing_day: 10, due_day: 17 };

function input(partial: Partial<InstallmentInput> = {}): InstallmentInput {
  return {
    purchase_description: "TV",
    total_amount: 100,
    installment_count: 3,
    credit_card_id: "card-1",
    category_id: null,
    family_member_id: null,
    purchase_date: "2026-10-05",
    notes: null,
    tags: [],
    ...partial,
  };
}

const cents = (n: number) => Math.round(n * 100);

describe("planInstallmentPurchase", () => {
  it("divide em centavos e coloca o resto na primeira parcela", () => {
    const plan = planInstallmentPurchase(input(), card);
    expect(plan.rows.map((r) => r.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(plan.parent.total_amount).toBe(100);
  });

  it("a soma das parcelas é sempre exatamente o total (vários valores e quantidades)", () => {
    const totals = [0.01, 0.99, 10.1, 19.99, 99.99, 100, 1234.56, 3999.9, 12345.67];
    for (const total of totals) {
      for (const n of [1, 2, 3, 6, 7, 10, 12, 18, 24]) {
        if (cents(total) < n && n > 1) continue; // menos de 1 centavo por parcela
        const plan = planInstallmentPurchase(
          input({ total_amount: total, installment_count: n }),
          card,
        );
        const sum = plan.rows.reduce((s, r) => s + cents(r.amount), 0);
        expect(sum).toBe(cents(total));
        expect(plan.rows).toHaveLength(n);
      }
    }
  });

  it("compra até o fechamento cai na fatura do mês; depois, na seguinte", () => {
    const antes = planInstallmentPurchase(input({ purchase_date: "2026-10-10" }), card);
    expect(antes.rows.map((r) => r.invoice_month)).toEqual([
      "2026-10-01",
      "2026-11-01",
      "2026-12-01",
    ]);
    const depois = planInstallmentPurchase(input({ purchase_date: "2026-10-11" }), card);
    expect(depois.rows.map((r) => r.invoice_month)).toEqual([
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
    ]);
  });

  it("vira o ano e gera uma fatura por parcela com fechamento e vencimento", () => {
    const plan = planInstallmentPurchase(
      input({ purchase_date: "2026-11-20", installment_count: 3 }),
      card,
    );
    expect(plan.invoices).toEqual([
      { reference_month: "2026-12-01", closing_date: "2026-12-10", due_date: "2026-12-17" },
      { reference_month: "2027-01-01", closing_date: "2027-01-10", due_date: "2027-01-17" },
      { reference_month: "2027-02-01", closing_date: "2027-02-10", due_date: "2027-02-17" },
    ]);
  });

  it("vencimento antes do fechamento cai no mês seguinte", () => {
    const plan = planInstallmentPurchase(
      input({ installment_count: 1, purchase_date: "2026-10-05" }),
      {
        id: "card-1",
        closing_day: 28,
        due_day: 5,
      },
    );
    expect(plan.invoices).toEqual([
      { reference_month: "2026-10-01", closing_date: "2026-10-28", due_date: "2026-11-05" },
    ]);
  });

  it("1ª parcela mantém a data da compra; as demais ficam no mês da fatura", () => {
    const plan = planInstallmentPurchase(input({ purchase_date: "2026-10-05" }), card);
    expect(plan.rows.map((r) => r.date)).toEqual(["2026-10-05", "2026-11-01", "2026-12-01"]);
  });

  it("descrição numerada, status pendente, cartão e numeração das parcelas", () => {
    const plan = planInstallmentPurchase(input({ tags: ["casa"], notes: "obs" }), card);
    expect(plan.rows.map((r) => r.description)).toEqual(["TV (1/3)", "TV (2/3)", "TV (3/3)"]);
    expect(plan.rows.map((r) => r.installment_number)).toEqual([1, 2, 3]);
    for (const r of plan.rows) {
      expect(r).toMatchObject({
        status: "pendente",
        payment_method: "crédito",
        credit_card_id: "card-1",
        tags: ["casa"],
        notes: "obs",
      });
    }
  });

  it("parcela única funciona", () => {
    const plan = planInstallmentPurchase(input({ installment_count: 1, total_amount: 59.9 }), card);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]!.amount).toBe(59.9);
    expect(plan.rows[0]!.description).toBe("TV (1/1)");
  });

  it("rejeita quantidade de parcelas e valores inválidos", () => {
    expect(() => planInstallmentPurchase(input({ installment_count: 0 }), card)).toThrow();
    expect(() => planInstallmentPurchase(input({ installment_count: 2.5 }), card)).toThrow();
    expect(() => planInstallmentPurchase(input({ total_amount: 0 }), card)).toThrow();
    expect(() => planInstallmentPurchase(input({ total_amount: -10 }), card)).toThrow();
    expect(() => planInstallmentPurchase(input({ total_amount: Number.NaN }), card)).toThrow();
  });
});
