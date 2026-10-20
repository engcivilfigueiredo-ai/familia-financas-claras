import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

const QUOTED = ["ações", "FIIs", "ETFs", "cripto"];
const MAX_TICKERS = 200;

async function fetchPrice(ticker: string, token?: string): Promise<number | null> {
  const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}${token ? `?token=${token}` : ""}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: Array<{ regularMarketPrice?: number }> };
  const price = json.results?.[0]?.regularMarketPrice;
  return typeof price === "number" && price > 0 ? price : null;
}

export const Route = createFileRoute("/api/public/hooks/update-quotes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        const { data: cfg } = await supabaseAdmin
          .from("cron_config" as never)
          .select("token")
          .eq("name", "update-quotes")
          .maybeSingle();
        const expected = (cfg as { token?: string } | null)?.token ?? "";
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { data: rows, error } = await supabaseAdmin
          .from("investments")
          .select("id, ticker, quantity, type, status")
          .in("type", QUOTED)
          .eq("status", "ativo")
          .not("ticker", "is", null)
          .gt("quantity", 0);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const tickers = [...new Set((rows ?? []).map((r) => String(r.ticker).trim().toUpperCase()))]
          .filter((t) => /^[A-Z0-9.-]{3,12}$/.test(t))
          .slice(0, MAX_TICKERS);
        const token = process.env["BRAPI_TOKEN"];
        const prices = new Map<string, number>();
        const failed: string[] = [];
        for (const t of tickers) {
          try {
            const p = await fetchPrice(t, token);
            if (p) prices.set(t, p);
            else failed.push(t);
          } catch {
            failed.push(t);
          }
        }

        const now = new Date().toISOString();
        let updated = 0;
        for (const r of rows ?? []) {
          const price = prices.get(String(r.ticker).trim().toUpperCase());
          if (!price) continue;
          const current = Math.round(Number(r.quantity) * price * 100) / 100;
          const { error: upErr } = await supabaseAdmin
            .from("investments")
            .update({ last_quote: price, quote_updated_at: now, current_amount: current })
            .eq("id", r.id);
          if (!upErr) updated++;
        }
        if (failed.length) console.warn("update-quotes: sem cotação para", failed.join(","));
        return Response.json({ ok: true, tickers: tickers.length, updated, failed });
      },
    },
  },
});
