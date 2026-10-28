import { formatBRL } from "./format";
import { contractTotal } from "./projects";

/**
 * Metas: tipos e cálculo do valor atual. É a ÚNICA fonte desse cálculo: a página Metas e o
 * dashboard usam estas funções, então os números nunca divergem.
 *
 * Metas automáticas (BF) não usam o valor gravado na meta: são calculadas ao vivo a partir
 * dos projetos e das receitas ligadas a projetos.
 */
export const GOAL_KINDS = [
  { value: "financeiro", label: "Valor financeiro", auto: false, money: true },
  { value: "bf_orcados", label: "BF · Projetos orçados", auto: true, money: false },
  { value: "bf_fechados", label: "BF · Projetos fechados", auto: true, money: false },
  { value: "bf_faturamento", label: "BF · Faturamento recebido", auto: true, money: true },
  { value: "quantidade", label: "Quantidade (manual)", auto: false, money: false },
] as const;

export function kindInfo(kind: string) {
  return GOAL_KINDS.find((g) => g.value === kind) ?? GOAL_KINDS[0];
}

export interface GoalLike {
  target_amount: number;
  current_amount: number;
  goal_kind: string;
  goal_year?: number | null;
  unit?: string | null;
}

export interface GoalProject {
  budget_date: string | null;
  closing_date: string | null;
  /** Campos usados só no saldo em contrato da meta de faturamento. */
  status?: string | null;
  contract_amount?: number | null;
  addenda_amount?: number | null;
  received_amount?: number | null;
}

export interface GoalTx {
  type: string;
  amount: number;
  date: string;
  status?: string;
  project_id?: string | null;
}

/** Ano da meta automática (padrão: o ano atual). */
export function goalYear(goal: Pick<GoalLike, "goal_year">, nowYear = new Date().getFullYear()) {
  return String(goal.goal_year ?? nowYear);
}

/** Valor atual da meta: calculado ao vivo nas metas BF; o valor gravado nas demais. */
export function goalCurrent(
  goal: GoalLike,
  projects: GoalProject[],
  txs: GoalTx[],
  nowYear = new Date().getFullYear(),
): number {
  const year = goalYear(goal, nowYear);
  if (goal.goal_kind === "bf_orcados") {
    return projects.filter((p) => p.budget_date?.startsWith(year)).length;
  }
  if (goal.goal_kind === "bf_fechados") {
    return projects.filter((p) => p.closing_date?.startsWith(year)).length;
  }
  if (goal.goal_kind === "bf_faturamento") {
    // só o que já foi RECEBIDO (status pago); o que ainda está pendente não conta
    const cents = txs
      .filter(
        (t) =>
          t.project_id && t.type === "receita" && t.status === "pago" && t.date.startsWith(year),
      )
      .reduce((s, t) => s + Math.round(Math.abs(Number(t.amount)) * 100), 0);
    return cents / 100;
  }
  return Number(goal.current_amount);
}

/** Status de projeto com contrato assinado (entram no saldo em contrato). */
const SIGNED_STATUSES = ["contratado", "em_execucao", "concluido"];

/**
 * Saldo em contrato da meta de faturamento: o que ainda falta receber dos contratos
 * assinados (contrato original + aditivos - já recebido), projeto a projeto, sem deixar um
 * projeto com adiantamento abater o saldo de outro. Outras metas devolvem 0.
 */
export function goalContractBalance(goal: Pick<GoalLike, "goal_kind">, projects: GoalProject[]) {
  if (goal.goal_kind !== "bf_faturamento") return 0;
  const cents = projects
    .filter((p) => p.status && SIGNED_STATUSES.includes(p.status))
    .reduce((sum, p) => {
      const open =
        contractTotal({
          contract_amount: p.contract_amount ?? 0,
          addenda_amount: p.addenda_amount ?? 0,
          received_amount: p.received_amount ?? 0,
        }) - Number(p.received_amount ?? 0);
      return sum + Math.max(Math.round(open * 100), 0);
    }, 0);
  return cents / 100;
}

/** Progresso em % (0 a 100 ou mais; a barra limita a 100 na hora de desenhar). */
export function goalPct(current: number, target: number): number {
  return target > 0 ? (current / target) * 100 : 0;
}

/** Texto do valor: R$ nas metas financeiras; número (com a unidade) nas de quantidade. */
export function formatGoalAmount(
  value: number,
  goal: Pick<GoalLike, "goal_kind" | "unit">,
): string {
  const info = kindInfo(goal.goal_kind);
  if (info.money) return formatBRL(value);
  const unit = goal.unit ? ` ${goal.unit}` : info.auto ? " projetos" : "";
  return `${value.toLocaleString("pt-BR")}${unit}`;
}
