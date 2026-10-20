/** Tamanho de cada requisição. O Supabase devolve no máximo 1.000 linhas por chamada. */
export const PAGE_SIZE = 1000;
/** Trava de segurança contra laço infinito (200 páginas = 200 mil linhas). */
const MAX_PAGES = 200;

export interface Page<T> {
  rows: T[];
  /** Total de linhas da consulta inteira (count exato), quando o servidor informa. */
  total: number | null;
}

/**
 * Lê TODAS as linhas de uma consulta paginada.
 *
 * Sem isso, um `select("*")` simples corta silenciosamente em 1.000 linhas, e saldos e
 * relatórios somados no navegador ficam errados sem nenhum aviso.
 *
 * - A primeira página traz o total; as demais são pedidas em paralelo.
 * - Se o servidor tiver um limite menor que `pageSize`, usa o tamanho que ele devolveu.
 * - Sem total, segue pedindo até vir uma página incompleta.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => Promise<Page<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const first = await fetchPage(0, pageSize - 1);
  const step = first.rows.length;
  if (step === 0) return [];

  if (first.total !== null) {
    if (step >= first.total) return first.rows;
    const pages = Math.ceil(first.total / step);
    if (pages > MAX_PAGES) {
      throw new Error("Volume de dados acima do limite de segurança da paginação.");
    }
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) => fetchPage((i + 1) * step, (i + 2) * step - 1)),
    );
    return [...first.rows, ...rest.flatMap((page) => page.rows)];
  }

  const all = [...first.rows];
  for (let page = 1; page < MAX_PAGES; page += 1) {
    const next = await fetchPage(page * step, (page + 1) * step - 1);
    all.push(...next.rows);
    if (next.rows.length < step) return all;
  }
  throw new Error("Volume de dados acima do limite de segurança da paginação.");
}
