import { describe, expect, it } from "vitest";
import { parseDecimalInput } from "./format";
import { applyBuy, applySell, positionOf, tradeTotal } from "./position";

const pos = { quantity: 100, average_price: 19.59, invested: 1959 };

describe("tradeTotal", () => {
  it("cotas × preço, em centavos", () => {
    expect(tradeTotal(10, 25)).toBe(250);
    expect(tradeTotal(3, 33.333)).toBe(100);
    expect(tradeTotal(0.005, 100000)).toBe(500);
  });
});

describe("applyBuy", () => {
  it("recalcula quantidade, investido e preço médio ponderado", () => {
    // 100 cotas a 19,59 + 50 cotas a 24,20 = 150 cotas
    const r = applyBuy(pos, 50, 24.2);
    expect(r.total).toBe(1210);
    expect(r.quantity).toBe(150);
    expect(r.invested).toBe(3169);
    expect(r.average_price).toBe(21.1267); // (1959 + 1210) / 150
  });

  it("primeira compra define o preço médio", () => {
    const r = applyBuy({ quantity: 0, average_price: 0, invested: 0 }, 10, 12.5);
    expect(r).toMatchObject({ quantity: 10, average_price: 12.5, invested: 125, total: 125 });
  });

  it("comprar mais barato derruba o preço médio, mais caro sobe", () => {
    expect(applyBuy(pos, 100, 10).average_price).toBeLessThan(19.59);
    expect(applyBuy(pos, 100, 30).average_price).toBeGreaterThan(19.59);
  });

  it("aceita fração (cripto)", () => {
    const r = applyBuy({ quantity: 0.5, average_price: 200000, invested: 100000 }, 0.25, 240000);
    expect(r.quantity).toBe(0.75);
    expect(r.invested).toBe(160000);
    expect(r.average_price).toBe(213333.3333);
  });

  it("rejeita quantidade ou preço inválidos", () => {
    expect(() => applyBuy(pos, 0, 10)).toThrow();
    expect(() => applyBuy(pos, 10, 0)).toThrow();
    expect(() => applyBuy(pos, -1, 10)).toThrow();
  });
});

describe("applySell", () => {
  it("preço médio não muda; baixa o custo e calcula o resultado", () => {
    const r = applySell(pos, 40, 24.2); // vende 40 a 24,20
    expect(r.total).toBe(968);
    expect(r.cost_basis).toBe(783.6); // 40 × 19,59
    expect(r.realized).toBe(184.4);
    expect(r.realized_pct).toBeCloseTo(23.53, 2);
    expect(r.quantity).toBe(60);
    expect(r.average_price).toBe(19.59);
    expect(r.invested).toBe(1175.4);
  });

  it("venda com prejuízo", () => {
    const r = applySell(pos, 10, 15);
    expect(r.realized).toBe(-45.9);
    expect(r.realized_pct).toBeLessThan(0);
  });

  it("vender tudo zera a posição", () => {
    const r = applySell(pos, 100, 22);
    expect(r.quantity).toBe(0);
    expect(r.invested).toBe(0);
  });

  it("não deixa vender mais do que tem", () => {
    expect(() => applySell(pos, 101, 20)).toThrow(/não é possível vender/);
  });
});

describe("positionOf", () => {
  it("usa o custo por cota quando falta preço médio", () => {
    expect(positionOf({ quantity: 50, average_price: null, invested_amount: 1000 })).toEqual({
      quantity: 50,
      average_price: 20,
      invested: 1000,
    });
  });
  it("campos nulos viram zero", () => {
    expect(positionOf({ quantity: null, average_price: null, invested_amount: 0 })).toEqual({
      quantity: 0,
      average_price: 0,
      invested: 0,
    });
  });
});

describe("parseDecimalInput", () => {
  it("vírgula é decimal, ponto é milhar", () => {
    expect(parseDecimalInput("1.234,56")).toBe(1234.56);
    expect(parseDecimalInput("24,20")).toBe(24.2);
    expect(parseDecimalInput("0,005")).toBe(0.005);
  });
  it("só ponto: milhar quando agrupa de 3, decimal nos demais casos", () => {
    expect(parseDecimalInput("1.000")).toBe(1000);
    expect(parseDecimalInput("12.345.678")).toBe(12345678);
    expect(parseDecimalInput("0.001")).toBe(0.001);
    expect(parseDecimalInput("25.5")).toBe(25.5);
    expect(parseDecimalInput("100")).toBe(100);
  });
  it("vazio ou lixo vira zero", () => {
    expect(parseDecimalInput("")).toBe(0);
    expect(parseDecimalInput("abc")).toBe(0);
  });
});
