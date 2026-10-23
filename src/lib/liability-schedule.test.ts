import { describe, expect, it } from "vitest";
import {
  installmentDueDate,
  installmentsLeft,
  nextDueDate,
  suggestInstallments,
} from "./liability-schedule";

describe("nextDueDate", () => {
  it("dia que ainda não passou neste mês vence neste mês", () => {
    expect(nextDueDate(25, "2026-10-22")).toBe("2026-10-25");
  });
  it("hoje conta como vencimento", () => {
    expect(nextDueDate(22, "2026-10-22")).toBe("2026-10-22");
  });
  it("dia que já passou vence no mês seguinte", () => {
    expect(nextDueDate(10, "2026-10-22")).toBe("2026-11-10");
  });
  it("vira o ano", () => {
    expect(nextDueDate(5, "2026-12-20")).toBe("2027-01-05");
  });
  it("dia 31 usa o último dia do mês quando ele não existe", () => {
    expect(nextDueDate(31, "2026-11-01")).toBe("2026-11-30");
    expect(nextDueDate(31, "2027-02-10")).toBe("2027-02-28");
    expect(nextDueDate(30, "2028-02-10")).toBe("2028-02-29"); // ano bissexto
  });
  it("dia 31 passado cai no mês seguinte, também ajustado", () => {
    expect(nextDueDate(31, "2026-11-30")).toBe("2026-11-30");
    expect(nextDueDate(30, "2027-01-31")).toBe("2027-02-28");
  });
});

describe("installmentDueDate", () => {
  it("avança um mês por parcela mantendo o dia", () => {
    expect(installmentDueDate("2026-11-10", 0, 10)).toBe("2026-11-10");
    expect(installmentDueDate("2026-11-10", 1, 10)).toBe("2026-12-10");
    expect(installmentDueDate("2026-11-10", 2, 10)).toBe("2027-01-10");
    expect(installmentDueDate("2026-11-10", 14, 10)).toBe("2028-01-10");
  });
  it("dia 31 não acumula deslocamento (28, 31, 30, 31...)", () => {
    const dates = Array.from({ length: 6 }, (_, k) => installmentDueDate("2027-01-31", k, 31));
    expect(dates).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
      "2027-06-30",
    ]);
  });
  it("fevereiro bissexto", () => {
    expect(installmentDueDate("2028-01-30", 1, 30)).toBe("2028-02-29");
  });
});

describe("suggestInstallments e installmentsLeft", () => {
  it("saldo dividido pela parcela, arredondado para cima", () => {
    expect(suggestInstallments(60000, 800)).toBe(75);
    expect(suggestInstallments(1000, 300)).toBe(4);
    expect(suggestInstallments(900, 300)).toBe(3);
  });
  it("sem saldo ou sem parcela não sugere nada", () => {
    expect(suggestInstallments(0, 300)).toBe(0);
    expect(suggestInstallments(1000, 0)).toBe(0);
  });
  it("parcelas restantes nunca ficam negativas", () => {
    expect(installmentsLeft(80, 3)).toBe(77);
    expect(installmentsLeft(10, 12)).toBe(0);
    expect(installmentsLeft(null, 0)).toBe(0);
  });
});
