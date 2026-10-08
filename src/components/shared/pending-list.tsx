import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/shared/states";
import { useTable, useUpsert } from "@/hooks/useFinance";
import { useScope } from "@/hooks/useScope";
import type { Tx } from "@/lib/finance";
import { formatBRL, formatDateBR, daysBetween, todayISO, parseCurrencyInput } from "@/lib/format";
import { VariableBills } from "@/components/shared/variable-bills";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Named {
  id: string;
  name: string;
}

export function PendingList({
  kind,
  title,
  description,
}: {
  kind: "despesa" | "receita";
  title: string;
  description: string;
}) {
  const scope = useScope();
  const transactions = useTable<Tx>("transactions");
  const accounts = useTable<Named>("accounts");
  const cards = useTable<Named>("credit_cards");
  const categories = useTable<Named>("categories");
  const update = useUpsert("transactions", kind === "despesa" ? "Pagamento registrado" : "Recebimento registrado");
  const [search, setSearch] = useState("");
  const valueUpdate = useUpsert("transactions", "Valor da fatura registrado");
  const [valueTx, setValueTx] = useState<Tx | null>(null);
  const [valueInput, setValueInput] = useState("");

  const accountName = useMemo(
    () => new Map((accounts.data ?? []).map((a) => [a.id, a.name])),
    [accounts.data],
  );
  const cardName = useMemo(
    () => new Map((cards.data ?? []).map((c) => [c.id, c.name])),
    [cards.data],
  );
  const categoryName = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c.name])),
    [categories.data],
  );

  const today = todayISO();
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (transactions.data ?? [])
      .filter((t) => t.type === kind && t.status !== "pago" && scope.matches(t.family_member_id))
      .filter((t) => !term || t.description.toLowerCase().includes(term))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions.data, kind, scope, search]);

  const total = rows.reduce((s, t) => s + Number(t.amount), 0);
  const overdue = rows.filter((t) => t.date < today);
  const overdueTotal = overdue.reduce((s, t) => s + Number(t.amount), 0);
  const next7 = rows.filter((t) => t.date >= today && daysBetween(today, t.date) <= 7);
  const next7Total = next7.reduce((s, t) => s + Number(t.amount), 0);

  function statusBadge(date: string) {
    if (date < today) return <Badge variant="destructive">Vencido</Badge>;
    if (date === today) return <Badge>Hoje</Badge>;
    const d = daysBetween(today, date);
    return <Badge variant="secondary">{`em ${d} dia(s)`}</Badge>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Total pendente</p>
            <p className="text-xl font-semibold">{formatBRL(total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Vencidos</p>
            <p className="text-xl font-semibold text-destructive">{formatBRL(overdueTotal)}</p>
            <p className="text-xs text-muted-foreground">{overdue.length} registro(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Próximos 7 dias</p>
            <p className="text-xl font-semibold">{formatBRL(next7Total)}</p>
            <p className="text-xs text-muted-foreground">{next7.length} registro(s)</p>
          </CardContent>
        </Card>
      </div>

      {kind === "despesa" ? <VariableBills /> : null}

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por descrição"
        className="sm:max-w-xs"
      />

      {transactions.isLoading ? (
        <LoadingState rows={5} />
      ) : transactions.isError ? (
        <ErrorState
          message={(transactions.error as Error)?.message}
          onRetry={() => transactions.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={kind === "despesa" ? "Nenhuma despesa pendente" : "Nenhuma receita pendente"}
          description="Lançamentos com status pendente aparecem aqui automaticamente."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {formatDateBR(t.date)}
                        {statusBadge(t.date)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        {t.description}
                        {kind === "despesa" && Number(t.amount) === 0 ? (
                          <Badge className="bg-chart-4 text-foreground hover:bg-chart-4">Aguardando valor da fatura</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.category_id ? categoryName.get(t.category_id) ?? "-" : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.credit_card_id
                        ? cardName.get(t.credit_card_id) ?? "Cartão"
                        : t.account_id
                          ? accountName.get(t.account_id) ?? "Conta"
                          : "-"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${kind === "despesa" ? "text-destructive" : "text-chart-2"}`}
                    >
                      {formatBRL(Number(t.amount))}
                    </TableCell>
                    <TableCell className="space-x-2 whitespace-nowrap text-right">
                      {kind === "despesa" && Number(t.amount) === 0 ? (
                        <Button size="sm" onClick={() => { setValueTx(t); setValueInput(""); }}>
                          Informar valor
                        </Button>
                      ) : null}
                      <Button
                        disabled={kind === "despesa" && Number(t.amount) === 0}
                        size="sm"
                        variant="outline"
                        onClick={() => update.mutate({ id: t.id, status: "pago" })}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        {kind === "despesa" ? "Pagar" : "Receber"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!valueTx} onOpenChange={(o) => !o && setValueTx(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Valor da fatura · {valueTx?.description}</DialogTitle></DialogHeader>
          <Input autoFocus inputMode="decimal" placeholder="0,00" value={valueInput} onChange={(e) => setValueInput(e.target.value)} />
          <DialogFooter>
            <Button
              onClick={() => {
                const v = parseCurrencyInput(valueInput);
                if (!valueTx || !(v > 0)) return;
                valueUpdate.mutate({ id: valueTx.id, amount: v }, { onSuccess: () => setValueTx(null) });
              }}
            >Salvar valor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
