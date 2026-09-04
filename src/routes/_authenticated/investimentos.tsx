import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, Pencil, Plus, RefreshCw, Trash2, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getQuotes, isQuoted, normalizeTicker } from "@/lib/quotes.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/shared/states";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { useInvalidateFinance, useRemove, useTable, useUpsert } from "@/hooks/useFinance";
import { useScope } from "@/hooks/useScope";
import { createInvestmentMove } from "@/lib/transactions";
import { INVESTMENT_TX_TYPES, INVESTMENT_TYPES, IR_TYPES } from "@/lib/finance";
import { formatBRL, formatDateBR, formatPercent, parseCurrencyInput, todayISO } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/investimentos")({
  head: () => ({
    meta: [
      { title: "Investimentos | Controle Financeiro Família" },
      { name: "description", content: "Carteira de investimentos, aportes, resgates e rendimentos." },
      { property: "og:title", content: "Investimentos | Controle Financeiro Família" },
      { property: "og:description", content: "Carteira de investimentos, aportes, resgates e rendimentos." },
    ],
  }),
  component: InvestimentosPage,
});

interface Named {
  id: string;
  name: string;
}

interface InvestmentRow {
  id: string;
  name: string;
  institution: string | null;
  type: string;
  application_date: string;
  invested_amount: number;
  current_amount: number;
  maturity_date: string | null;
  liquidity: string | null;
  status: string;
  family_member_id: string | null;
  ticker: string | null;
  quantity: number | null;
  average_price: number | null;
  last_quote: number | null;
  quote_updated_at: string | null;
}

interface InvestmentTx {
  id: string;
  investment_id: string;
  account_id: string | null;
  type: string;
  amount: number;
  date: string;
  ir_type: string | null;
}

const NONE = "__none__";

const emptyForm = {
  id: "",
  name: "",
  institution: "",
  type: "CDB",
  application_date: todayISO(),
  invested_amount: "",
  current_amount: "",
  maturity_date: "",
  liquidity: "diária",
  status: "ativo",
  family_member_id: NONE,
  ticker: "",
  quantity: "",
  average_price: "",
};

const emptyMove = {
  investment_id: "",
  account_id: NONE,
  type: "aplicação" as (typeof INVESTMENT_TX_TYPES)[number],
  amount: "",
  date: todayISO(),
  ir_type: NONE,
};

function InvestimentosPage() {
  const scope = useScope();
  const invalidate = useInvalidateFinance();
  const investments = useTable<InvestmentRow>("investments");
  const moves = useTable<InvestmentTx>("investment_transactions");
  const accounts = useTable<Named>("accounts");
  const members = useTable<Named>("family_members");
  const upsert = useUpsert("investments", "Investimento salvo");
  const remove = useRemove("investments", "Investimento excluído");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [moveOpen, setMoveOpen] = useState(false);
  const [move, setMove] = useState(emptyMove);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(
    () => (investments.data ?? []).filter((i) => scope.matches(i.family_member_id)),
    [investments.data, scope],
  );

  const tickers = useMemo(() => {
    const set = new Set<string>();
    for (const r of investments.data ?? []) {
      if (r.ticker) set.add(normalizeTicker(r.ticker));
    }
    const formTicker = normalizeTicker(form.ticker);
    if (open && isQuoted(form.type) && formTicker.length >= 4) set.add(formTicker);
    return [...set].sort();
  }, [investments.data, form.ticker, form.type, open]);

  const quotes = useQuery({
    queryKey: ["quotes", tickers.join(",")],
    queryFn: () => getQuotes({ data: { tickers } }),
    enabled: tickers.length > 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const quoteMap = useMemo(
    () => new Map((quotes.data ?? []).map((q) => [q.symbol, q])),
    [quotes.data],
  );

  const formLiveQuote = quoteMap.get(normalizeTicker(form.ticker));

  // Mantém o saldo atual dos ativos de renda variável sincronizado com a cotação.
  useEffect(() => {
    if (!quotes.data?.length) return;
    for (const row of investments.data ?? []) {
      if (!row.ticker) continue;
      const quote = quoteMap.get(normalizeTicker(row.ticker));
      const qty = Number(row.quantity ?? 0);
      if (!quote || qty <= 0) continue;
      const nextValue = Number((qty * quote.price).toFixed(2));
      if (
        Math.abs(nextValue - Number(row.current_amount ?? 0)) < 0.01 &&
        Math.abs(quote.price - Number(row.last_quote ?? 0)) < 0.0001
      ) {
        continue;
      }
      void supabase
        .from("investments")
        .update({
          current_amount: nextValue,
          last_quote: quote.price,
          quote_updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ["investments"] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes.data]);

  const totals = useMemo(() => {
    const invested = rows.reduce((s, r) => s + Number(r.invested_amount), 0);
    const current = rows.reduce((s, r) => {
      const quote = r.ticker ? quoteMap.get(normalizeTicker(r.ticker)) : undefined;
      const qty = Number(r.quantity ?? 0);
      if (quote && qty > 0) return s + qty * quote.price;
      return s + Number(r.current_amount);
    }, 0);
    return {
      invested,
      current,
      profit: current - invested,
      pct: invested > 0 ? ((current - invested) / invested) * 100 : 0,
    };
  }, [rows, quoteMap]);

  const invName = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);
  const accName = useMemo(
    () => new Map((accounts.data ?? []).map((a) => [a.id, a.name])),
    [accounts.data],
  );

  const recentMoves = useMemo(
    () => (moves.data ?? []).filter((m) => invName.has(m.investment_id)).slice(0, 15),
    [moves.data, invName],
  );

  const dividends = useMemo(() => {
    const list = (moves.data ?? []).filter(
      (m) =>
        invName.has(m.investment_id) &&
        ["dividendo", "jcp", "rendimento"].includes(m.type),
    );
    const year = String(new Date().getFullYear());
    return {
      list: list.slice(0, 20),
      total: list.reduce((s, m) => s + Number(m.amount), 0),
      year: list
        .filter((m) => m.date.startsWith(year))
        .reduce((s, m) => s + Number(m.amount), 0),
    };
  }, [moves.data, invName]);

  const dividendByInvestment = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of moves.data ?? []) {
      if (!["dividendo", "jcp", "rendimento"].includes(m.type)) continue;
      map.set(m.investment_id, (map.get(m.investment_id) ?? 0) + Number(m.amount));
    }
    return map;
  }, [moves.data]);

  function openNew() {
    setForm({ ...emptyForm, family_member_id: scope.memberId ?? NONE });
    setOpen(true);
  }

  function openEdit(row: InvestmentRow) {
    setForm({
      id: row.id,
      name: row.name,
      institution: row.institution ?? "",
      type: row.type,
      application_date: row.application_date,
      invested_amount: String(row.invested_amount ?? ""),
      current_amount: String(row.current_amount ?? ""),
      maturity_date: row.maturity_date ?? "",
      liquidity: row.liquidity ?? "diária",
      status: row.status,
      family_member_id: row.family_member_id ?? NONE,
      ticker: row.ticker ?? "",
      quantity: row.quantity != null ? String(row.quantity) : "",
      average_price: row.average_price != null ? String(row.average_price) : "",
    });
    setOpen(true);
  }

  function save() {
    if (!form.name.trim()) return;
    const quoted = isQuoted(form.type);
    const ticker = quoted ? normalizeTicker(form.ticker) : "";
    const quantity = quoted ? parseCurrencyInput(form.quantity || "0") : 0;
    const averagePrice = quoted ? parseCurrencyInput(form.average_price || "0") : 0;

    if (quoted && (!ticker || quantity <= 0 || averagePrice <= 0)) {
      toast.error("Informe código do ativo, quantidade de cotas e preço médio.");
      return;
    }

    const liveQuote = quoted ? quoteMap.get(ticker)?.price : undefined;
    const invested = quoted
      ? Number((quantity * averagePrice).toFixed(2))
      : parseCurrencyInput(form.invested_amount || "0");
    const current = quoted
      ? Number((quantity * (liveQuote ?? averagePrice)).toFixed(2))
      : parseCurrencyInput(form.current_amount || String(invested));

    upsert.mutate(
      {
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        institution: form.institution.trim() || null,
        type: form.type,
        application_date: form.application_date,
        invested_amount: invested,
        current_amount: current,
        maturity_date: form.maturity_date || null,
        liquidity: form.liquidity || null,
        status: form.status,
        family_member_id: form.family_member_id === NONE ? null : form.family_member_id,
        ticker: quoted ? ticker : null,
        quantity: quoted ? quantity : null,
        average_price: quoted ? averagePrice : null,
        last_quote: quoted ? (liveQuote ?? averagePrice) : null,
        quote_updated_at: quoted && liveQuote ? new Date().toISOString() : null,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  function openMove(row: InvestmentRow) {
    setMove({ ...emptyMove, investment_id: row.id });
    setMoveOpen(true);
  }

  async function saveMove() {
    const amount = parseCurrencyInput(move.amount);
    if (!move.investment_id || amount <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    setSaving(true);
    try {
      await createInvestmentMove({
        investment_id: move.investment_id,
        account_id: move.account_id === NONE ? null : move.account_id,
        amount,
        date: move.date,
        type: move.type,
        ir_type: move.ir_type === NONE ? null : move.ir_type,
        family_member_id:
          rows.find((r) => r.id === move.investment_id)?.family_member_id ?? null,
        investment_name: invName.get(move.investment_id) ?? "Investimento",
      });
      invalidate();
      toast.success("Movimentação registrada");
      setMoveOpen(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investimentos"
        description="Carteira, aportes, resgates e rendimentos integrados ao fluxo de caixa."
        actions={
          <div className="flex gap-2">
            {tickers.length > 0 ? (
              <Button
                variant="outline"
                onClick={() => quotes.refetch()}
                disabled={quotes.isFetching}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${quotes.isFetching ? "animate-spin" : ""}`}
                />
                Atualizar cotações
              </Button>
            ) : null}
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Novo investimento
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Investido</p>
            <p className="text-xl font-semibold">{formatBRL(totals.invested)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Saldo atual</p>
            <p className="text-xl font-semibold">{formatBRL(totals.current)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Rentabilidade</p>
            <p
              className={`text-xl font-semibold ${totals.profit >= 0 ? "text-chart-2" : "text-destructive"}`}
            >
              {formatBRL(totals.profit)} ({formatPercent(totals.pct)})
            </p>
          </CardContent>
        </Card>
      </div>

      {investments.isLoading ? (
        <LoadingState rows={4} />
      ) : investments.isError ? (
        <ErrorState
          message={(investments.error as Error)?.message}
          onRetry={() => investments.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhum investimento"
          description="Cadastre CDBs, fundos, ações e acompanhe a rentabilidade."
          icon={<TrendingUp className="h-6 w-6" />}
          action={
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Novo investimento
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const quote = row.ticker ? quoteMap.get(normalizeTicker(row.ticker)) : undefined;
            const qty = Number(row.quantity ?? 0);
            const unit = quote?.price ?? Number(row.last_quote ?? 0);
            const current =
              row.ticker && qty > 0 && unit > 0 ? qty * unit : Number(row.current_amount);
            const profit = current - Number(row.invested_amount);
            const pct =
              Number(row.invested_amount) > 0 ? (profit / Number(row.invested_amount)) * 100 : 0;
            const dividendTotal = dividendByInvestment.get(row.id) ?? 0;
            return (
              <Card key={row.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div>
                    <CardTitle className="text-base">
                      {row.ticker ? `${row.ticker} · ` : ""}
                      {row.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {row.institution || "Sem instituição"} · {row.type}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openMove(row)}>
                      <ArrowDownUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <ConfirmDelete
                      trigger={
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      }
                      onConfirm={() => remove.mutate(row.id)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-2xl font-semibold">{formatBRL(current)}</p>
                  <p className="text-xs text-muted-foreground">
                    Investido {formatBRL(Number(row.invested_amount))}
                  </p>
                  {row.ticker && qty > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {qty.toLocaleString("pt-BR")} cotas · preço médio{" "}
                      {formatBRL(Number(row.average_price ?? 0))} · cotação {formatBRL(unit)}
                      {quote ? ` (${formatPercent(quote.changePercent)} hoje)` : ""}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={profit >= 0 ? "secondary" : "destructive"}>
                      {formatBRL(profit)} · {formatPercent(pct)}
                    </Badge>
                    {dividendTotal > 0 ? (
                      <Badge variant="outline">Proventos {formatBRL(dividendTotal)}</Badge>
                    ) : null}
                    {row.maturity_date ? (
                      <Badge variant="outline">Vence {formatDateBR(row.maturity_date)}</Badge>
                    ) : null}
                    {row.status !== "ativo" ? <Badge variant="outline">{row.status}</Badge> : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {recentMoves.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Movimentações recentes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Investimento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentMoves.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{formatDateBR(m.date)}</TableCell>
                    <TableCell>{invName.get(m.investment_id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.type}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.account_id ? accName.get(m.account_id) ?? "-" : "-"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatBRL(Number(m.amount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar investimento" : "Novo investimento"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="inv-name">Nome</Label>
              <Input
                id="inv-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="CDB Banco X 110% CDI"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv-inst">Instituição</Label>
              <Input
                id="inv-inst"
                value={form.institution}
                onChange={(e) => setForm({ ...form, institution: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVESTMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isQuoted(form.type) ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="inv-ticker">Código do ativo</Label>
                  <Input
                    id="inv-ticker"
                    value={form.ticker}
                    onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
                    placeholder="PETR4 / HGLG11"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="inv-qty">Quantidade de cotas</Label>
                  <Input
                    id="inv-qty"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    inputMode="decimal"
                    placeholder="100"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="inv-avg">Preço médio da cota</Label>
                  <Input
                    id="inv-avg"
                    value={form.average_price}
                    onChange={(e) => setForm({ ...form, average_price: e.target.value })}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Cotação atual</Label>
                  <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
                    {formLiveQuote
                      ? `${formatBRL(formLiveQuote.price)} (${formatPercent(formLiveQuote.changePercent)})`
                      : "Informe o código para buscar"}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Valor investido = cotas × preço médio. O saldo atual é calculado com a cotação de
                  mercado e atualizado automaticamente.
                </p>
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="inv-invested">Valor investido</Label>
                  <Input
                    id="inv-invested"
                    value={form.invested_amount}
                    onChange={(e) => setForm({ ...form, invested_amount: e.target.value })}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="inv-current">Saldo atual</Label>
                  <Input
                    id="inv-current"
                    value={form.current_amount}
                    onChange={(e) => setForm({ ...form, current_amount: e.target.value })}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>
              </>
            )}
            <div className="grid gap-2">
              <Label htmlFor="inv-date">Aplicação</Label>
              <Input
                id="inv-date"
                type="date"
                value={form.application_date}
                onChange={(e) => setForm({ ...form, application_date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv-maturity">Vencimento</Label>
              <Input
                id="inv-maturity"
                type="date"
                value={form.maturity_date}
                onChange={(e) => setForm({ ...form, maturity_date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Liquidez</Label>
              <Select
                value={form.liquidity}
                onValueChange={(v) => setForm({ ...form, liquidity: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="diária">Diária</SelectItem>
                  <SelectItem value="no vencimento">No vencimento</SelectItem>
                  <SelectItem value="D+30">D+30</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="resgatado">Resgatado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Pessoa</Label>
              <Select
                value={form.family_member_id}
                onValueChange={(v) => setForm({ ...form, family_member_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Família" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Família (compartilhada)</SelectItem>
                  {(members.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={upsert.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Dividendos e proventos</CardTitle>
            <p className="text-xs text-muted-foreground">
              Recebido no total {formatBRL(dividends.total)} · {formatBRL(dividends.year)} em{" "}
              {new Date().getFullYear()}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {dividends.list.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Nenhum provento registrado. Use o botão de movimentação em um ativo e escolha
              dividendo, JCP ou rendimento.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dividends.list.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{formatDateBR(m.date)}</TableCell>
                    <TableCell>{invName.get(m.investment_id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.type}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.account_id ? (accName.get(m.account_id) ?? "-") : "-"}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-chart-2">
                      {formatBRL(Number(m.amount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Movimentar investimento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select
                value={move.type}
                onValueChange={(v) =>
                  setMove({ ...move, type: v as (typeof INVESTMENT_TX_TYPES)[number] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVESTMENT_TX_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mv-amount">Valor</Label>
              <Input
                id="mv-amount"
                value={move.amount}
                onChange={(e) => setMove({ ...move, amount: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mv-date">Data</Label>
              <Input
                id="mv-date"
                type="date"
                value={move.date}
                onChange={(e) => setMove({ ...move, date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Conta de origem/destino</Label>
              <Select
                value={move.account_id}
                onValueChange={(v) => setMove({ ...move, account_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem conta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem conta</SelectItem>
                  {(accounts.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Tributação</Label>
              <Select value={move.ir_type} onValueChange={(v) => setMove({ ...move, ir_type: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Não informado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {IR_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Aportes e resgates são registrados como transferência (não afetam receitas/despesas).
              Rendimentos, dividendos e JCP entram como receita.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveMove} disabled={saving}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
