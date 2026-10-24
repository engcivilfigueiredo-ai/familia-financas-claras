import { describe, expect, it } from "vitest";
import { contractTotal, projectBalance } from "./projects";

describe("contractTotal", () => {
  it("soma o contrato original e os aditivos", () => {
    expect(contractTotal({ contract_amount: 40000, addenda_amount: 8000 })).toBe(48000);
  });
  it("sem aditivos é o próprio contrato", () => {
    expect(contractTotal({ contract_amount: 40000, addenda_amount: 0 })).toBe(40000);
    expect(contractTotal({ contract_amount: 40000 })).toBe(40000);
    expect(contractTotal({ contract_amount: 40000, addenda_amount: null })).toBe(40000);
  });
  it("campos nulos viram zero", () => {
    expect(contractTotal({ contract_amount: null })).toBe(0);
  });
  it("soma centavos sem erro de ponto flutuante", () => {
    expect(contractTotal({ contract_amount: 0.1, addenda_amount: 0.2 })).toBe(0.3);
    expect(contractTotal({ contract_amount: 1000.1, addenda_amount: 2500.2 })).toBe(3500.3);
  });
});

describe("projectBalance", () => {
  it("saldo = contrato + aditivos - recebido", () => {
    expect(
      projectBalance({ contract_amount: 40000, addenda_amount: 8000, received_amount: 10000 }),
    ).toBe(38000);
  });
  it("o aditivo aumenta o saldo a receber", () => {
    const antes = projectBalance({
      contract_amount: 40000,
      addenda_amount: 0,
      received_amount: 40000,
    });
    const depois = projectBalance({
      contract_amount: 40000,
      addenda_amount: 5000,
      received_amount: 40000,
    });
    expect(antes).toBe(0);
    expect(depois).toBe(5000);
  });
  it("recebido a mais fica negativo (adiantamento)", () => {
    expect(projectBalance({ contract_amount: 1000, received_amount: 1200 })).toBe(-200);
  });
});
