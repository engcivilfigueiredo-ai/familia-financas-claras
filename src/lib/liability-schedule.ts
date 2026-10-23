import { parseISO, toISO } from "./format";

/**
 * Regras do cronograma de parcelas de uma dívida. O banco (sync_liability_schedule) é quem
 * grava as parcelas; estas funções espelham a mesma conta de datas para a tela (sugestões,
 * prévias) e são conferidas contra o banco nos testes.
 */

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Próximo vencimento: a primeira data com esse dia do mês que não esteja no passado. */
export function nextDueDate(dueDay: number, todayIso: string): string {
  const today = parseISO(todayIso);
  const day = Math.min(Math.max(Math.trunc(dueDay) || 1, 1), 31);
  const thisMonth = new Date(
    today.getFullYear(),
    today.getMonth(),
    Math.min(day, lastDayOfMonth(today.getFullYear(), today.getMonth())),
  );
  if (toISO(thisMonth) >= todayIso) return toISO(thisMonth);
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  return toISO(new Date(y, m, Math.min(day, lastDayOfMonth(y, m))));
}

/**
 * Vencimento da parcela de índice k (0 = a primeira): o mês avança k vezes a partir do 1º
 * vencimento e o dia é o dia combinado, limitado ao fim do mês (dia 31 vira 28/29/30).
 */
export function installmentDueDate(firstDueDate: string, k: number, dueDay: number): string {
  const first = parseISO(firstDueDate);
  const y = first.getFullYear();
  const m = first.getMonth() + k;
  return toISO(new Date(y, m, Math.min(Math.max(dueDay, 1), lastDayOfMonth(y, m))));
}

/** Sugestão de parcelas restantes: saldo devedor dividido pela parcela, arredondado para cima. */
export function suggestInstallments(remaining: number, payment: number): number {
  if (!(payment > 0) || !(remaining > 0)) return 0;
  return Math.ceil(remaining / payment - 1e-9);
}

/** Parcelas que faltam pagar: total do cronograma menos as já pagas. */
export function installmentsLeft(total: number | null, paid: number): number {
  return Math.max((total ?? 0) - paid, 0);
}
