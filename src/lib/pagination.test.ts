import { describe, expect, it, vi } from "vitest";
import { fetchAllRows, type Page } from "./pagination";

/** Simula o servidor: dados 0..n-1, com limite máximo opcional de linhas por resposta. */
function fakeServer(n: number, opts: { cap?: number; withTotal?: boolean } = {}) {
  const data = Array.from({ length: n }, (_, i) => i);
  const calls: [number, number][] = [];
  const fetchPage = vi.fn(async (from: number, to: number): Promise<Page<number>> => {
    calls.push([from, to]);
    const wanted = data.slice(from, to + 1);
    const rows = opts.cap ? wanted.slice(0, opts.cap) : wanted;
    return { rows, total: opts.withTotal === false ? null : n };
  });
  return { data, fetchPage, calls };
}

describe("fetchAllRows", () => {
  it("devolve tudo quando cabe numa página", async () => {
    const s = fakeServer(250);
    expect(await fetchAllRows(s.fetchPage, 1000)).toEqual(s.data);
    expect(s.fetchPage).toHaveBeenCalledTimes(1);
  });

  it("tabela vazia devolve lista vazia", async () => {
    const s = fakeServer(0);
    expect(await fetchAllRows(s.fetchPage, 1000)).toEqual([]);
  });

  it("passa de 1.000 linhas sem perder nenhuma e na ordem certa", async () => {
    const s = fakeServer(2750);
    const rows = await fetchAllRows(s.fetchPage, 1000);
    expect(rows).toHaveLength(2750);
    expect(rows).toEqual(s.data);
    expect(s.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("número exato de linhas igual ao tamanho da página não pede página extra", async () => {
    const s = fakeServer(2000);
    expect(await fetchAllRows(s.fetchPage, 1000)).toEqual(s.data);
    expect(s.fetchPage).toHaveBeenCalledTimes(2);
  });

  it("respeita um limite do servidor menor que o tamanho pedido", async () => {
    const s = fakeServer(1300, { cap: 500 });
    const rows = await fetchAllRows(s.fetchPage, 1000);
    expect(rows).toEqual(s.data);
  });

  it("sem total informado, segue até vir uma página incompleta", async () => {
    const s = fakeServer(2300, { withTotal: false });
    const rows = await fetchAllRows(s.fetchPage, 1000);
    expect(rows).toEqual(s.data);
  });

  it("propaga erro de qualquer página", async () => {
    const fetchPage = vi.fn(async (from: number): Promise<Page<number>> => {
      if (from > 0) throw new Error("falhou");
      return { rows: Array.from({ length: 1000 }, (_, i) => i), total: 3000 };
    });
    await expect(fetchAllRows(fetchPage, 1000)).rejects.toThrow("falhou");
  });
});
