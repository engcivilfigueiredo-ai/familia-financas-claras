export function formatBRL(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return `${Number(value ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

/** Accepts "2024-01-31" or Date, returns "31/01/2024". */
export function formatDateBR(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const iso = typeof value === "string" ? value : value.toISOString().slice(0, 10);
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return "-";
  return `${d}/${m}/${y}`;
}

export function formatMonthBR(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const iso = typeof value === "string" ? value : value.toISOString().slice(0, 10);
  const [y, m] = iso.slice(0, 10).split("-");
  const months = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  const idx = Number(m) - 1;
  return `${months[idx] ?? "?"}/${y}`;
}

export function todayISO(): string {
  const d = new Date();
  return toISO(d);
}

export function toISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses an ISO date string as a local date (avoids timezone shifts). */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** "1.234,56" | "1234.56" -> 1234.56 */
export function parseCurrencyInput(input: string): number {
  if (!input) return 0;
  const cleaned = input
    .replace(/[^\d.,-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Número digitado em pt-BR para quantidades e preços unitários.
 * - Com vírgula: a vírgula é o decimal e os pontos são milhar ("1.234,56" -> 1234.56).
 * - Só com ponto: "1.000" e "12.345.678" são milhar; "0.001" e "25.5" são decimal.
 */
export function parseDecimalInput(input: string): number {
  const s = (input ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  let normalized: string;
  if (s.includes(",")) normalized = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, "");
  else normalized = s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function monthStart(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Soma meses mantendo o dia, ou o último dia do mês quando ele não existe (31/jan + 1 = 28/fev). */
export function addMonths(iso: string, months: number): string {
  const d = parseISO(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toISO(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay)));
}

export function daysBetween(fromISO: string, toISODate: string): number {
  const a = parseISO(fromISO).getTime();
  const b = parseISO(toISODate).getTime();
  return Math.round((b - a) / 86400000);
}
