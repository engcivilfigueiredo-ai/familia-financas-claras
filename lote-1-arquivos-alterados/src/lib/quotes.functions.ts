import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface Quote {
  symbol: string;
  price: number;
  changePercent: number;
  currency: string;
  updatedAt: string;
}

/** Ativos de renda variável cujo valor é acompanhado por cotação. */
export const QUOTED_TYPES = ["ações", "FIIs", "ETFs", "cripto"] as const;

export function isQuoted(type: string): boolean {
  return (QUOTED_TYPES as readonly string[]).includes(type);
}

export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Busca cotações atuais (B3 / cripto) para uma lista de tickers.
 * Exige usuário logado: sem isso qualquer pessoa consumiria a cota do BRAPI_TOKEN.
 */
export const getQuotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tickers: string[] }) => ({
    tickers: (data?.tickers ?? [])
      .map((t) => String(t).trim().toUpperCase())
      .filter((t) => /^[A-Z0-9.-]{3,12}$/.test(t))
      .slice(0, 25),
  }))
  .handler(async ({ data }): Promise<Quote[]> => {
    if (!data.tickers.length) return [];
    const token = process.env["BRAPI_TOKEN"];
    const url = `https://brapi.dev/api/quote/${data.tickers.join(",")}${token ? `?token=${token}` : ""}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error("Não foi possível consultar as cotações agora.");
    const json = (await res.json()) as {
      results?: Array<{
        symbol?: string;
        regularMarketPrice?: number;
        regularMarketChangePercent?: number;
        currency?: string;
        regularMarketTime?: string;
      }>;
    };
    return (json.results ?? [])
      .filter((r) => r.symbol && typeof r.regularMarketPrice === "number")
      .map((r) => ({
        symbol: String(r.symbol).toUpperCase(),
        price: Number(r.regularMarketPrice),
        changePercent: Number(r.regularMarketChangePercent ?? 0),
        currency: r.currency ?? "BRL",
        updatedAt: r.regularMarketTime ?? new Date().toISOString(),
      }));
  });
