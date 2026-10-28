import { describe, expect, it } from "vitest";
import {
  formatGoalAmount,
  goalContractBalance,
  goalCurrent,
  goalPct,
  goalYear,
  kindInfo,
  type GoalLike,
  type GoalProject,
  type GoalTx,
} from "./goals";

const goal = (over: Partial<GoalLike>): GoalLike => ({
  target_amount: 100,
  current_amount: 0,
  goal_kind: "financeiro",
  goal_year: null,
  unit: null,
  ...over,
});

const projects: GoalProject[] = [
  { budget_date: "2026-01-10", closing_date: "2026-02-01" },
  { budget_date: "2026-05-20", closing_date: null },
  { budget_date: "2026-11-02", closing_date: "2026-12-15" },
  { budget_date: "2025-03-01", closing_date: "2025-04-01" },
  { budget_date: null, closing_date: null },
];

const txs: GoalTx[] = [
  { type: "receita", amount: 10000, date: "2026-03-01", status: "pago", project_id: "p1" },
  { type: "receita", amount: 2500.5, date: "2026-07-15", status: "pago", project_id: "p2" },
  { type: "receita", amount: 999, date: "2026-07-15", status: "pago", project_id: null }, // sem projeto
  { type: "despesa", amount: 700, date: "2026-07-15", status: "pago", project_id: "p1" }, // não é receita
  { type: "receita", amount: 4000, date: "2025-12-31", status: "pago", project_id: "p1" }, // outro ano
  { type: "receita", amount: 8000, date: "2026-09-01", status: "pendente", project_id: "p1" }, // ainda não recebido
];

describe("goalCurrent", () => {
  it("meta manual usa o valor gravado", () => {
    expect(goalCurrent(goal({ current_amount: 320.5 }), projects, txs, 2026)).toBe(320.5);
    expect(
      goalCurrent(goal({ goal_kind: "quantidade", current_amount: 7 }), projects, txs, 2026),
    ).toBe(7);
  });

  it("projetos orçados no ano da meta", () => {
    expect(goalCurrent(goal({ goal_kind: "bf_orcados", goal_year: 2026 }), projects, txs)).toBe(3);
    expect(goalCurrent(goal({ goal_kind: "bf_orcados", goal_year: 2025 }), projects, txs)).toBe(1);
  });

  it("projetos fechados no ano da meta", () => {
    expect(goalCurrent(goal({ goal_kind: "bf_fechados", goal_year: 2026 }), projects, txs)).toBe(2);
  });

  it("faturamento: soma só o que já foi RECEBIDO (pago); pendente não conta", () => {
    const g = goal({ goal_kind: "bf_faturamento", goal_year: 2026 });
    expect(goalCurrent(g, projects, txs)).toBe(12500.5); // os 8.000 pendentes ficam de fora
    const tudoPago = txs.map((t) => ({ ...t, status: "pago" }));
    expect(goalCurrent(g, projects, tudoPago)).toBe(20500.5);
  });

  it("faturamento: só receitas de projeto no ano, em valor absoluto", () => {
    expect(goalCurrent(goal({ goal_kind: "bf_faturamento", goal_year: 2026 }), projects, txs)).toBe(
      12500.5,
    );
    expect(goalCurrent(goal({ goal_kind: "bf_faturamento", goal_year: 2025 }), projects, txs)).toBe(
      4000,
    );
  });

  it("meta automática ignora o valor gravado (que é 0)", () => {
    const g = goal({ goal_kind: "bf_orcados", goal_year: 2026, current_amount: 0 });
    expect(goalCurrent(g, projects, txs)).toBe(3);
  });

  it("sem ano na meta usa o ano atual informado", () => {
    expect(goalYear({ goal_year: null }, 2026)).toBe("2026");
    expect(goalCurrent(goal({ goal_kind: "bf_orcados" }), projects, txs, 2026)).toBe(3);
  });

  it("soma centavos sem erro de ponto flutuante", () => {
    const many: GoalTx[] = Array.from({ length: 10 }, () => ({
      type: "receita",
      amount: 0.1,
      date: "2026-01-01",
      status: "pago",
      project_id: "p",
    }));
    expect(goalCurrent(goal({ goal_kind: "bf_faturamento", goal_year: 2026 }), [], many)).toBe(1);
  });
});

describe("goalContractBalance (faixa cinza)", () => {
  const fat = goal({ goal_kind: "bf_faturamento", goal_year: 2026 });
  const proj = (over: Partial<GoalProject>): GoalProject => ({
    budget_date: null,
    closing_date: null,
    status: "contratado",
    contract_amount: 0,
    addenda_amount: 0,
    received_amount: 0,
    ...over,
  });

  it("saldo = contrato + aditivos - recebido, dos contratos assinados", () => {
    const list = [
      proj({ contract_amount: 40000, addenda_amount: 8000, received_amount: 10000 }), // 38.000
      proj({ status: "em_execucao", contract_amount: 20000, received_amount: 5000.5 }), // 14.999,50
      proj({ status: "concluido", contract_amount: 3000, received_amount: 3000 }), // 0
    ];
    expect(goalContractBalance(fat, list)).toBe(52999.5);
  });

  it("não conta orçamento, negociação nem projeto perdido", () => {
    const list = [
      proj({ status: "orcamento", contract_amount: 9000 }),
      proj({ status: "negociacao", contract_amount: 9000 }),
      proj({ status: "perdido", contract_amount: 9000 }),
      proj({ status: null, contract_amount: 9000 }),
    ];
    expect(goalContractBalance(fat, list)).toBe(0);
  });

  it("projeto com adiantamento não abate o saldo de outro", () => {
    const list = [
      proj({ contract_amount: 1000, received_amount: 1500 }), // recebeu a mais: saldo 0, não -500
      proj({ contract_amount: 2000, received_amount: 0 }), // 2.000
    ];
    expect(goalContractBalance(fat, list)).toBe(2000);
  });

  it("só a meta de faturamento tem saldo em contrato", () => {
    const list = [proj({ contract_amount: 5000 })];
    expect(goalContractBalance(goal({ goal_kind: "financeiro" }), list)).toBe(0);
    expect(goalContractBalance(goal({ goal_kind: "bf_orcados" }), list)).toBe(0);
  });

  it("faixa cinza = até onde a meta chega recebendo o saldo", () => {
    const list = [proj({ contract_amount: 40000, received_amount: 10000 })]; // saldo 30.000
    const current = 12500.5;
    const balance = goalContractBalance(fat, list);
    expect(goalPct(current, 100000)).toBeCloseTo(12.5005, 4);
    expect(goalPct(current + balance, 100000)).toBeCloseTo(42.5005, 4);
  });
});

describe("goalPct", () => {
  it("é percentual de 0 a 100 (e passa de 100 quando supera a meta)", () => {
    expect(goalPct(45, 100)).toBe(45);
    expect(goalPct(3, 12)).toBe(25);
    expect(goalPct(120, 100)).toBe(120);
  });
  it("sem alvo devolve 0", () => {
    expect(goalPct(10, 0)).toBe(0);
  });
});

describe("formatGoalAmount", () => {
  it("financeira em reais", () => {
    expect(formatGoalAmount(1500, goal({}))).toMatch(/R\$\s?1\.500,00/);
  });
  it("faturamento BF em reais", () => {
    expect(formatGoalAmount(12500.5, goal({ goal_kind: "bf_faturamento" }))).toMatch(/12\.500,50/);
  });
  it("contagem automática vira 'projetos'; manual usa a unidade", () => {
    expect(formatGoalAmount(3, goal({ goal_kind: "bf_orcados" }))).toBe("3 projetos");
    expect(formatGoalAmount(5, goal({ goal_kind: "quantidade", unit: "livros" }))).toBe("5 livros");
    expect(formatGoalAmount(5, goal({ goal_kind: "quantidade" }))).toBe("5");
  });
});

describe("kindInfo", () => {
  it("tipo desconhecido cai em financeiro", () => {
    expect(kindInfo("qualquer").value).toBe("financeiro");
    expect(kindInfo("bf_orcados").auto).toBe(true);
  });
});
