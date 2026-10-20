import { describe, expect, it } from "vitest";
import { addMonths } from "./format";
import {
  accountBalance,
  cardInvoiceTotal,
  invoiceDueDate,
  invoiceMonthFor,
  recurrenceDate,
  type AccountRow,
  type Tx,
} from "./finance";

const account: AccountRow = {
  id: "a1",
  name: "Conta",
  initial_balance: 1000,
  family_member_id: null,
  is_active: true,
  type: "corrente",
  color: "#000",
  institution: null,
};

let seq = 0;
function tx(partial: Partial<Tx>): Tx {
  seq += 1;
  return {
    id: `t${seq}`,
    type: "despesa",
    amount: 0,
    date: "2026-10-01",
    status: "pago",
    description: "x",
    account_id: "a1",
    credit_card_id: null,
    category_id: null,
    family_member_id: null,
    invoice_month: null,
    transfer_group_id: null,
    installment_id: null,
    installment_number: null,
    recurring_id: null,
    is_recurring: false,
    payment_method: null,
    tags: [],
    notes: null,
    ...partial,
  };
}

describe("addMonths", () => {
  it("usa o último dia do mês quando o dia não existe", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29"); // ano bissexto
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("mantém o dia quando ele existe e vira o ano", () => {
    expect(addMonths("2026-10-15", 3)).toBe("2027-01-15");
    expect(addMonths("2026-01-01", 12)).toBe("2027-01-01");
  });
});

describe("recurrenceDate", () => {
  const monthly = (start: string, n: number) =>
    Array.from({ length: n }, (_, i) => recurrenceDate(start, "mensal", i));

  it("mensal no dia 31 não acumula deslocamento", () => {
    expect(monthly("2026-01-31", 5)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  it("mensal no dia 29 volta ao dia 29 depois de fevereiro", () => {
    expect(monthly("2027-01-29", 4)).toEqual([
      "2027-01-29",
      "2027-02-28",
      "2027-03-29",
      "2027-04-29",
    ]);
  });

  it("semanal e quinzenal somam dias corridos", () => {
    expect(recurrenceDate("2026-10-01", "semanal", 2)).toBe("2026-10-15");
    expect(recurrenceDate("2026-10-01", "quinzenal", 3)).toBe("2026-11-15");
  });

  it("bimestral, trimestral, semestral e anual", () => {
    expect(recurrenceDate("2026-01-31", "bimestral", 1)).toBe("2026-03-31");
    expect(recurrenceDate("2026-01-31", "trimestral", 1)).toBe("2026-04-30");
    expect(recurrenceDate("2026-08-31", "semestral", 1)).toBe("2027-02-28");
    expect(recurrenceDate("2028-02-29", "anual", 1)).toBe("2029-02-28");
  });

  it("frequência desconhecida cai em mensal", () => {
    expect(recurrenceDate("2026-10-10", "qualquer", 1)).toBe("2026-11-10");
  });
});

describe("accountBalance", () => {
  const today = "2026-10-18";

  it("soma receitas, desconta despesas e aplica transferências assinadas", () => {
    const txs = [
      tx({ type: "receita", amount: 500 }),
      tx({ type: "despesa", amount: 200 }),
      tx({ type: "transferencia", amount: -100 }),
      tx({ type: "transferencia", amount: 50 }),
    ];
    expect(accountBalance(account, txs, today)).toBe(1000 + 500 - 200 - 100 + 50);
  });

  it("ignora lançamentos pendentes", () => {
    const txs = [tx({ type: "despesa", amount: 300, status: "pendente" })];
    expect(accountBalance(account, txs, today)).toBe(1000);
  });

  it("ignora lançamentos pagos com data futura", () => {
    const txs = [
      tx({ type: "transferencia", amount: -400, date: "2026-11-01" }), // aporte futuro
      tx({ type: "despesa", amount: 100, date: today }),
    ];
    expect(accountBalance(account, txs, today)).toBe(900);
    expect(accountBalance(account, txs, "2026-11-01")).toBe(500);
  });

  it("despesa no cartão não mexe no saldo da conta", () => {
    const txs = [tx({ type: "despesa", amount: 250, credit_card_id: "c1" })];
    expect(accountBalance(account, txs, today)).toBe(1000);
  });

  it("ignora lançamentos de outras contas", () => {
    const txs = [tx({ type: "despesa", amount: 999, account_id: "outra" })];
    expect(accountBalance(account, txs, today)).toBe(1000);
  });
});

describe("faturas de cartão", () => {
  it("compra até o dia de fechamento entra na fatura do mês; depois, na seguinte", () => {
    expect(invoiceMonthFor("2026-10-10", 10)).toBe("2026-10-01");
    expect(invoiceMonthFor("2026-10-11", 10)).toBe("2026-11-01");
    expect(invoiceMonthFor("2026-12-20", 10)).toBe("2027-01-01");
  });

  it("vencimento antes do fechamento cai no mês seguinte", () => {
    expect(invoiceDueDate("2026-10-01", 10, 17)).toBe("2026-10-17");
    expect(invoiceDueDate("2026-10-01", 28, 5)).toBe("2026-11-05");
    expect(invoiceDueDate("2027-01-01", 10, 31)).toBe("2027-01-31");
    expect(invoiceDueDate("2027-01-01", 20, 28)).toBe("2027-01-28");
  });

  it("pagamento de fatura (transferência) abate o total", () => {
    const txs = [
      tx({ credit_card_id: "c1", invoice_month: "2026-10-01", amount: 300, account_id: null }),
      tx({ credit_card_id: "c1", invoice_month: "2026-10-01", amount: 200, account_id: null }),
      tx({
        type: "transferencia",
        credit_card_id: "c1",
        invoice_month: "2026-10-01",
        amount: 500,
        account_id: null,
      }),
    ];
    expect(cardInvoiceTotal("c1", "2026-10-01", txs)).toBe(0);
    expect(cardInvoiceTotal("c1", "2026-11-01", txs)).toBe(0);
  });

  it("pagamento parcial deixa o restante em aberto", () => {
    const txs = [
      tx({ credit_card_id: "c1", invoice_month: "2026-10-01", amount: 800, account_id: null }),
      tx({
        type: "transferencia",
        credit_card_id: "c1",
        invoice_month: "2026-10-01",
        amount: 300,
        account_id: null,
      }),
    ];
    expect(cardInvoiceTotal("c1", "2026-10-01", txs)).toBe(500);
  });
});
