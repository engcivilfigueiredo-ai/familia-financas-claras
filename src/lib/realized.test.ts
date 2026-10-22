import { describe, expect, it } from "vitest";
import { saleResultPct, summarizeSales, type SaleMove } from "./realized";

function move(partial: Partial<SaleMove>): SaleMove {
  return {
    id: "m",
    investment_id: "petr",
    type: "resgate",
    date: "2026-10-21",
    amount: 0,
    quantity: null,
    rate_per_share: null,
    cost_basis: null,
    realized_result: null,
    ...partial,
  };
}

const moves: SaleMove[] = [
  move({ id: "1", date: "2026-03-10", realized_result: 154.93, cost_basis: 845.07 }),
  move({ id: "2", date: "2026-10-21", realized_result: -61.27, cost_basis: 211.27 }),
  move({
    id: "3",
    date: "2025-12-30",
    investment_id: "vale",
    realized_result: 500,
    cost_basis: 1000,
  }),
  move({ id: "4", type: "aplicação", realized_result: null }), // compra
  move({ id: "5", realized_result: null }), // venda antiga, sem custo registrado
  move({ id: "6", type: "dividendo", realized_result: 30 }), // não é venda
];

describe("summarizeSales", () => {
  it("soma só vendas com resultado registrado (ignora compra, provento e venda sem custo)", () => {
    const s = summarizeSales(moves, { year: "2026" });
    expect(s.count).toBe(3);
    expect(s.total).toBe(593.66); // 154,93 - 61,27 + 500
  });

  it("separa o resultado do ano", () => {
    const s = summarizeSales(moves, { year: "2026" });
    expect(s.yearTotal).toBe(93.66);
    expect(summarizeSales(moves, { year: "2025" }).yearTotal).toBe(500);
    expect(summarizeSales(moves, { year: "2024" }).yearTotal).toBe(0);
  });

  it("filtra por ativo, mas lista todos os ativos para o seletor", () => {
    const s = summarizeSales(moves, { year: "2026", assetId: "vale" });
    expect(s.count).toBe(1);
    expect(s.total).toBe(500);
    expect(s.assets.sort()).toEqual(["petr", "vale"]);
  });

  it("ordena da venda mais recente para a mais antiga e respeita o limite", () => {
    const s = summarizeSales(moves, { year: "2026", limit: 2 });
    expect(s.list.map((m) => m.id)).toEqual(["2", "1"]);
  });

  it("ignora ativos que não existem mais", () => {
    const s = summarizeSales(moves, { year: "2026", knownAssets: new Set(["petr"]) });
    expect(s.count).toBe(2);
    expect(s.total).toBe(93.66);
  });

  it("sem vendas devolve zeros", () => {
    expect(summarizeSales([], { year: "2026" })).toEqual({
      list: [],
      total: 0,
      yearTotal: 0,
      count: 0,
      assets: [],
    });
  });

  it("soma sem erro de ponto flutuante", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      move({ id: String(i), realized_result: 0.1 }),
    );
    expect(summarizeSales(many, { year: "2026" }).total).toBe(1);
  });
});

describe("saleResultPct", () => {
  it("lucro e prejuízo em % do custo", () => {
    expect(saleResultPct({ cost_basis: 845.07, realized_result: 154.93 })).toBeCloseTo(18.33, 2);
    expect(saleResultPct({ cost_basis: 211.27, realized_result: -61.27 })).toBeCloseTo(-29.0, 1);
  });
  it("sem custo devolve 0", () => {
    expect(saleResultPct({ cost_basis: null, realized_result: 10 })).toBe(0);
  });
});
