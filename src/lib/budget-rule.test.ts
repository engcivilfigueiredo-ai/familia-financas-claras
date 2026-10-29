import { describe, expect, it } from "vitest";
import {
  DEBT_LINE,
  INVEST_LINE,
  computeBudgetRule,
  defaultGroupForName,
  normalizeName,
  resolveGroup,
  type CategoryLike,
  type RuleTx,
} from "./budget-rule";

const cat = (id: string, name: string, over: Partial<CategoryLike> = {}): CategoryLike => ({
  id,
  name,
  parent_id: null,
  budget_group: null,
  ...over,
});

const categories: CategoryLike[] = [
  cat("alim", "Alimentação"),
  cat("mor", "Moradia"),
  cat("laz", "Lazer"),
  cat("comp", "Compras"),
  cat("outros", "Outros"),
  cat("reserva", "Reserva de emergência"),
  cat("custom", "Academia"), // nome desconhecido
  cat("super", "Supermercado X", { parent_id: "alim" }), // subcategoria de Alimentação
];

const des = (category_id: string | null, amount: number, extra: Partial<RuleTx> = {}): RuleTx => ({
  type: "despesa",
  amount,
  category_id,
  ...extra,
});

describe("normalizeName / defaultGroupForName", () => {
  it("ignora acento e maiúsculas", () => {
    expect(normalizeName("  Alimentação ")).toBe("alimentacao");
    expect(defaultGroupForName("ALIMENTAÇÃO")).toBe("necessidades");
    expect(defaultGroupForName("Saúde")).toBe("necessidades");
    expect(defaultGroupForName("Lazer")).toBe("desejos");
    expect(defaultGroupForName("Reserva de emergência")).toBe("poupanca");
  });
  it("nome desconhecido ou 'Outros' fica sem grupo", () => {
    expect(defaultGroupForName("Outros")).toBeNull();
    expect(defaultGroupForName("Academia")).toBeNull();
  });
});

describe("resolveGroup", () => {
  const byId = new Map(categories.map((c) => [c.id, c]));
  it("usa o grupo escolhido na categoria, acima do nome", () => {
    const c = cat("a", "Lazer", { budget_group: "necessidades" });
    expect(resolveGroup(c, new Map([[c.id, c]]))).toBe("necessidades");
  });
  it("subcategoria herda o grupo da mãe (escolhido ou pelo nome)", () => {
    expect(resolveGroup(byId.get("super"), byId)).toBe("necessidades"); // mãe = Alimentação
    const mae = cat("m", "Academia", { budget_group: "desejos" });
    const filha = cat("f", "Mensalidade", { parent_id: "m" });
    expect(
      resolveGroup(
        filha,
        new Map([
          [mae.id, mae],
          [filha.id, filha],
        ]),
      ),
    ).toBe("desejos");
  });
  it("escolha explícita da mãe vence o nome da filha", () => {
    const mae = cat("m", "Casa", { budget_group: "necessidades" });
    const filha = cat("f", "Lazer", { parent_id: "m" });
    expect(
      resolveGroup(
        filha,
        new Map([
          [mae.id, mae],
          [filha.id, filha],
        ]),
      ),
    ).toBe("necessidades");
  });
  it("sem escolha e sem nome conhecido devolve null; categoria inexistente também", () => {
    expect(resolveGroup(byId.get("custom"), byId)).toBeNull();
    expect(resolveGroup(undefined, byId)).toBeNull();
  });
  it("ciclo de categorias-mãe não trava", () => {
    const a = cat("a", "X", { parent_id: "b" });
    const b = cat("b", "Y", { parent_id: "a" });
    expect(
      resolveGroup(
        a,
        new Map([
          [a.id, a],
          [b.id, b],
        ]),
      ),
    ).toBeNull();
  });
});

describe("computeBudgetRule", () => {
  const txs: RuleTx[] = [
    des("mor", 2500), // necessidades
    des("alim", 1000), // necessidades
    des("super", 500), // necessidades (herdada)
    des("laz", 900), // desejos
    des("comp", 600), // desejos
    des("reserva", 400), // poupança
    des("outros", 300), // sem grupo
    des("custom", 200), // sem grupo
    des(null, 100), // sem categoria
    { type: "receita", amount: 99999, category_id: null }, // não é despesa
    { type: "transferencia", amount: 5000, category_id: null }, // não é despesa
  ];

  it("organiza as categorias nos três grupos e soma cada um", () => {
    const r = computeBudgetRule({ txs, categories, investmentContributions: 0, income: 10000 });
    const [nec, des_, poup] = r.groups;
    expect(nec!.amount).toBe(4000);
    expect(nec!.lines.map((l) => [l.name, l.amount])).toEqual([
      ["Moradia", 2500],
      ["Alimentação", 1000],
      ["Supermercado X", 500],
    ]);
    expect(des_!.amount).toBe(1500);
    expect(poup!.amount).toBe(400);
    expect(r.unclassified.amount).toBe(600);
    expect(r.unclassified.lines.map((l) => l.name).sort()).toEqual([
      "Academia",
      "Outros",
      "Sem categoria",
    ]);
  });

  it("percentuais sobre a renda e comparação com 50-30-20", () => {
    const r = computeBudgetRule({ txs, categories, investmentContributions: 0, income: 10000 });
    const [nec, des_, poup] = r.groups;
    expect(r.basis).toBe("renda");
    expect(nec!.pct).toBe(40);
    expect(nec!.ideal).toBe(5000);
    expect(nec!.diff).toBe(-1000);
    expect(nec!.status).toBe("ok"); // gastou 40% (≤ 50%)
    expect(des_!.pct).toBe(15);
    expect(des_!.status).toBe("ok");
    expect(poup!.pct).toBe(4);
    expect(poup!.ideal).toBe(2000);
    expect(poup!.status).toBe("abaixo"); // guardou 4% (< 20%)
  });

  it("acima do ideal em necessidades e desejos; poupança no ideal", () => {
    const grande = [des("mor", 6000), des("laz", 3500), des("reserva", 2000)];
    const r = computeBudgetRule({
      txs: grande,
      categories,
      investmentContributions: 0,
      income: 10000,
    });
    expect(r.groups.map((g) => g.status)).toEqual(["acima", "acima", "ok"]);
  });

  it("aportes em investimentos e parcelas de dívidas entram em Poupança e dívidas", () => {
    const r = computeBudgetRule({
      txs: [des(null, 800, { liability_id: "l1" }), des("alim", 100)],
      categories,
      investmentContributions: 1200.5,
      income: 10000,
    });
    const poup = r.groups[2]!;
    expect(poup.lines.map((l) => [l.name, l.amount])).toEqual([
      [INVEST_LINE, 1200.5],
      [DEBT_LINE, 800],
    ]);
    expect(poup.amount).toBe(2000.5);
    expect(poup.status).toBe("ok");
  });

  it("parcela de dívida com categoria que tem grupo segue o grupo da categoria", () => {
    const r = computeBudgetRule({
      txs: [des("mor", 1500, { liability_id: "financiamento-casa" })],
      categories,
      investmentContributions: 0,
      income: 5000,
    });
    expect(r.groups[0]!.amount).toBe(1500); // Moradia = necessidades
    expect(r.groups[2]!.amount).toBe(0);
  });

  it("sem renda no período usa o total gasto como base", () => {
    const r = computeBudgetRule({
      txs: [des("mor", 500), des("laz", 300), des("reserva", 200)],
      categories,
      investmentContributions: 0,
      income: 0,
    });
    expect(r.basis).toBe("gastos");
    expect(r.base).toBe(1000);
    expect(r.groups.map((g) => g.pct)).toEqual([50, 30, 20]);
  });

  it("sem nenhum dado devolve zeros sem dividir por zero", () => {
    const r = computeBudgetRule({ txs: [], categories, investmentContributions: 0, income: 0 });
    expect(r.total).toBe(0);
    expect(r.groups.every((g) => g.amount === 0 && g.pct === 0)).toBe(true);
  });

  it("tudo que foi gasto aparece em algum lugar: grupos + sem grupo = total", () => {
    const r = computeBudgetRule({ txs, categories, investmentContributions: 700, income: 10000 });
    const soma = r.groups.reduce((s, g) => s + g.amount, 0) + r.unclassified.amount;
    expect(soma).toBe(r.total);
    expect(r.total).toBe(6500 + 700); // despesas (6.500) + aportes
  });

  it("soma centavos sem erro de ponto flutuante", () => {
    const muitas = Array.from({ length: 10 }, () => des("alim", 0.1));
    const r = computeBudgetRule({
      txs: muitas,
      categories,
      investmentContributions: 0,
      income: 10,
    });
    expect(r.groups[0]!.amount).toBe(1);
    expect(r.groups[0]!.pct).toBe(10);
  });
});
