/**
 * Regra 50-30-20 sobre a renda do período:
 *   50% Necessidades · 30% Desejos · 20% Poupança e dívidas.
 *
 * Cada categoria de despesa entra em um grupo: o escolhido na tela (categories.budget_group),
 * herdado da categoria-mãe, ou sugerido pelo nome (Alimentação, Moradia...).
 * Em "Poupança e dívidas" entram também os aportes em investimentos e as parcelas de dívidas
 * (Patrimônio) que não tenham categoria com grupo.
 * Transferências entre contas e pagamento de fatura não são despesa e ficam de fora.
 */
export type BudgetGroup = "necessidades" | "desejos" | "poupanca";

export const BUDGET_GROUPS: readonly {
  key: BudgetGroup;
  label: string;
  target: number;
  /** "max": o ideal é gastar até esse percentual; "min": o ideal é guardar pelo menos isso. */
  goal: "max" | "min";
  hint: string;
}[] = [
  {
    key: "necessidades",
    label: "Necessidades",
    target: 50,
    goal: "max",
    hint: "Moradia, alimentação, transporte, saúde, educação",
  },
  {
    key: "desejos",
    label: "Desejos",
    target: 30,
    goal: "max",
    hint: "Lazer, compras, assinaturas, viagens",
  },
  {
    key: "poupanca",
    label: "Poupança e dívidas",
    target: 20,
    goal: "min",
    hint: "Investimentos, reserva e pagamento de dívidas",
  },
];

export function isBudgetGroup(value: unknown): value is BudgetGroup {
  return value === "necessidades" || value === "desejos" || value === "poupanca";
}

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const DEFAULTS: Record<BudgetGroup, string[]> = {
  necessidades: [
    "alimentacao",
    "moradia",
    "transporte",
    "saude",
    "educacao",
    "impostos",
    "seguros",
    "aluguel",
    "condominio",
    "supermercado",
    "mercado",
    "energia",
    "luz",
    "agua",
    "gas",
    "combustivel",
    "farmacia",
    "escola",
    "plano de saude",
  ],
  desejos: [
    "lazer",
    "compras",
    "assinaturas",
    "viagens",
    "pets",
    "restaurantes",
    "entretenimento",
    "streaming",
    "presentes",
    "hobbies",
    "beleza",
  ],
  poupanca: [
    "investimentos",
    "poupanca",
    "reserva",
    "reserva de emergencia",
    "previdencia",
    "dividas",
    "divida",
    "emprestimo",
    "consorcio",
  ],
};

const DEFAULT_BY_NAME = new Map<string, BudgetGroup>(
  (Object.keys(DEFAULTS) as BudgetGroup[]).flatMap((group) =>
    DEFAULTS[group].map((name) => [name, group] as const),
  ),
);

/** Grupo sugerido pelo nome da categoria (ou null quando não reconhece). */
export function defaultGroupForName(name: string): BudgetGroup | null {
  return DEFAULT_BY_NAME.get(normalizeName(name)) ?? null;
}

export interface CategoryLike {
  id: string;
  name: string;
  parent_id?: string | null;
  budget_group?: string | null;
}

function chain(category: CategoryLike | undefined, byId: Map<string, CategoryLike>) {
  const list: CategoryLike[] = [];
  const seen = new Set<string>();
  let cursor = category;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    list.push(cursor);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }
  return list;
}

/**
 * Grupo de uma categoria: 1) escolhido por você nela ou numa categoria-mãe; 2) sugerido pelo
 * nome dela ou da mãe; 3) null (sem grupo).
 */
export function resolveGroup(
  category: CategoryLike | undefined,
  byId: Map<string, CategoryLike>,
): BudgetGroup | null {
  const path = chain(category, byId);
  for (const c of path) if (isBudgetGroup(c.budget_group)) return c.budget_group;
  for (const c of path) {
    const guess = defaultGroupForName(c.name);
    if (guess) return guess;
  }
  return null;
}

export interface RuleTx {
  type: string;
  amount: number;
  category_id: string | null;
  liability_id?: string | null;
}

export interface RuleLine {
  key: string;
  name: string;
  amount: number;
  /** % da renda (ou do total gasto, se não houver renda). */
  pct: number;
}

export interface RuleGroup {
  key: BudgetGroup;
  label: string;
  hint: string;
  target: number;
  goal: "max" | "min";
  amount: number;
  pct: number;
  /** Valor ideal em R$ (target% da renda). */
  ideal: number;
  /** amount - ideal: positivo = gastou/guardou acima do ideal. */
  diff: number;
  status: "ok" | "acima" | "abaixo";
  lines: RuleLine[];
}

export interface BudgetRuleResult {
  income: number;
  /** Base dos percentuais: a renda do período ou, sem renda, o total gasto. */
  base: number;
  basis: "renda" | "gastos";
  groups: RuleGroup[];
  unclassified: { amount: number; pct: number; lines: RuleLine[] };
  /** Despesas + aportes considerados. */
  total: number;
}

export const DEBT_LINE = "Parcelas de dívidas";
export const INVEST_LINE = "Aportes em investimentos";

const toCents = (n: number) => Math.round(Number(n) * 100);
const fromCents = (c: number) => c / 100;

export function computeBudgetRule(input: {
  txs: RuleTx[];
  categories: CategoryLike[];
  /** Soma dos aportes em investimentos do período (já filtrada por período e pessoa). */
  investmentContributions: number;
  /** Receitas do período (mesma definição do relatório). */
  income: number;
}): BudgetRuleResult {
  const byId = new Map(input.categories.map((c) => [c.id, c]));
  const buckets = new Map<string, Map<string, { name: string; cents: number }>>();
  const add = (bucket: string, key: string, name: string, cents: number) => {
    if (cents === 0) return;
    const lines = buckets.get(bucket) ?? new Map();
    const line = lines.get(key) ?? { name, cents: 0 };
    line.cents += cents;
    lines.set(key, line);
    buckets.set(bucket, lines);
  };

  for (const t of input.txs) {
    if (t.type !== "despesa") continue;
    const cents = toCents(Math.abs(Number(t.amount)));
    const category = t.category_id ? byId.get(t.category_id) : undefined;
    const group = category ? resolveGroup(category, byId) : null;
    if (group) add(group, category!.id, category!.name, cents);
    else if (t.liability_id) add("poupanca", "__debt__", DEBT_LINE, cents);
    else add("none", category?.id ?? "__none__", category?.name ?? "Sem categoria", cents);
  }
  add("poupanca", "__invest__", INVEST_LINE, toCents(input.investmentContributions));

  const sumCents = (bucket: string) =>
    [...(buckets.get(bucket)?.values() ?? [])].reduce((s, l) => s + l.cents, 0);
  const totalCents = BUDGET_GROUPS.reduce((s, g) => s + sumCents(g.key), 0) + sumCents("none");

  const incomeCents = toCents(input.income);
  const basis: "renda" | "gastos" = incomeCents > 0 ? "renda" : "gastos";
  const baseCents = incomeCents > 0 ? incomeCents : totalCents;
  const pctOf = (cents: number) => (baseCents > 0 ? (cents / baseCents) * 100 : 0);
  const linesOf = (bucket: string): RuleLine[] =>
    [...(buckets.get(bucket)?.entries() ?? [])]
      .map(([key, l]) => ({ key, name: l.name, amount: fromCents(l.cents), pct: pctOf(l.cents) }))
      .sort((a, b) => b.amount - a.amount);

  const groups: RuleGroup[] = BUDGET_GROUPS.map((g) => {
    const cents = sumCents(g.key);
    const pct = pctOf(cents);
    const idealCents = Math.round((baseCents * g.target) / 100);
    const ok = g.goal === "max" ? cents <= idealCents : cents >= idealCents;
    return {
      key: g.key,
      label: g.label,
      hint: g.hint,
      target: g.target,
      goal: g.goal,
      amount: fromCents(cents),
      pct,
      ideal: fromCents(idealCents),
      diff: fromCents(cents - idealCents),
      status: ok ? "ok" : g.goal === "max" ? "acima" : "abaixo",
      lines: linesOf(g.key),
    };
  });

  const noneCents = sumCents("none");
  return {
    income: fromCents(incomeCents),
    base: fromCents(baseCents),
    basis,
    groups,
    unclassified: { amount: fromCents(noneCents), pct: pctOf(noneCents), lines: linesOf("none") },
    total: fromCents(totalCents),
  };
}
