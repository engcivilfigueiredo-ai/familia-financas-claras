/**
 * Lucro realizado: resultado das vendas de ações, FIIs, ETFs e cripto.
 * O banco guarda, em cada venda, o custo das cotas vendidas e o resultado
 * (valor recebido - custo). Aqui só se somam e se organizam esses valores.
 */
export interface SaleMove {
  id: string;
  investment_id: string;
  type: string;
  date: string;
  amount: number;
  quantity: number | null;
  rate_per_share: number | null;
  cost_basis: number | null;
  realized_result: number | null;
}

export interface SalesSummary<T extends SaleMove> {
  /** Vendas mais recentes primeiro (até `limit`). */
  list: T[];
  /** Resultado somado das vendas selecionadas (todas as datas). */
  total: number;
  /** Resultado somado das vendas selecionadas no ano informado. */
  yearTotal: number;
  /** Quantidade de vendas selecionadas. */
  count: number;
  /** Ativos que têm alguma venda com resultado registrado. */
  assets: string[];
}

function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Só entram vendas (resgate) que têm resultado registrado, de ativos que ainda existem. */
export function summarizeSales<T extends SaleMove>(
  moves: T[],
  opts: { year: string; assetId?: string | null; knownAssets?: Set<string>; limit?: number },
): SalesSummary<T> {
  const all = moves.filter(
    (m) =>
      m.type === "resgate" &&
      m.realized_result !== null &&
      m.realized_result !== undefined &&
      (!opts.knownAssets || opts.knownAssets.has(m.investment_id)),
  );
  const selected = opts.assetId ? all.filter((m) => m.investment_id === opts.assetId) : all;
  const sum = (items: T[]) => cents(items.reduce((s, m) => s + Number(m.realized_result ?? 0), 0));
  return {
    list: [...selected]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, opts.limit ?? 30),
    total: sum(selected),
    yearTotal: sum(selected.filter((m) => m.date.startsWith(opts.year))),
    count: selected.length,
    assets: Array.from(new Set(all.map((m) => m.investment_id))),
  };
}

/** Resultado em % sobre o custo daquela venda. */
export function saleResultPct(move: Pick<SaleMove, "cost_basis" | "realized_result">): number {
  const cost = Number(move.cost_basis ?? 0);
  return cost > 0 ? (Number(move.realized_result ?? 0) / cost) * 100 : 0;
}
