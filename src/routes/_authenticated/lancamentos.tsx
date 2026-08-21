import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { PeriodFilter } from "@/components/shared/period-filter";
import {
  TransactionDialog,
  type EditingTransaction,
} from "@/components/transactions/TransactionDialog";
import { useInvalidateFinance, useRemove, useTable } from "@/hooks/useFinance";
import { useScope } from "@/hooks/useScope";
import { deleteTransferGroup } from "@/lib/transactions";
import { inPeriod, resolvePeriod, type PeriodKey, type Tx } from "@/lib/finance";
import { formatBRL, formatDateBR, monthStart, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => ({
    meta: [
      { title: "Lançamentos | Controle Financeiro Família" },
      {
        name: "description",
        content: "Registre e filtre receitas, despesas, transferências e parcelamentos da família.",
      },
      { property: "og:title", content: "Lançamentos | Controle Financeiro Família" },
      {
        property: "og:description",
        content: "Todos os lançamentos financeiros com filtros por período, conta e categoria.",
      },
    ],
  }),
  component: TransactionsPage,
});

interface Named {
  id: string;
  name: string;
}

const ALL = "__all__";

function TransactionsPage() {
  const scope = useScope();
  const invalidate = useInvalidateFinance();
  const transactions = useTable<Tx>("transactions");
  const accounts = useTable<Named>("accounts");
  const cards = useTable<Named>("credit_cards");
  const categories = useTable<Named & { type: string }>("categories");
  const members = useTable<Named>("family_members");
  const remove = useRemove("transactions", "Lançamento excluído");

  const [periodKey, setPeriodKey] = useState<PeriodKey>("this-month");
  const [custom, setCustom] = useState({ from: monthStart(new Date()), to: todayISO() });
  const [search, setSearch] = useState("");
  const [type, setType] = useState(ALL);
  const [categoryId, setCategoryId] = useState(ALL);
  const [accountId, setAccountId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EditingTransaction | null>(null);

  const period = useMemo(() => resolvePeriod(periodKey, custom), [periodKey, custom]);
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
  const memberName = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.id, m.name])),
    [members.data],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (transactions.data ?? []).filter((t) => {
      if (!scope.matches(t.family_member_id)) return false;
      if (!inPeriod(t.date, period)) return false;
      if (type !== ALL && t.type !== type) return false;
      if (status !== ALL && t.status !== status) return false;
      if (categoryId !== ALL && t.category_id !== categoryId) return false;
      if (accountId !== ALL && t.account_id !== accountId && t.credit_card_id !== accountId)
        return false;
      if (term && !t.description.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [transactions.data, scope, period, type, status, categoryId, accountId, search]);

  const totals = useMemo(() => {
    const income = rows.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
    const expense = rows.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
    return { income, expense, result: income - expense };
  }, [rows]);

  async function handleDelete(t: Tx) {
    if (t.transfer_group_id) {
      await deleteTransferGroup(t.transfer_group_id);
      invalidate();
      return;
    }
    remove.mutate(t.id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lançamentos"
        description={`${rows.length} registro(s) · ${period.label}`}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Novo lançamento
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Receitas</p>
            <p className="text-xl font-semibold text-chart-2">{formatBRL(totals.income)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Despesas</p>
            <p className="text-xl font-semibold text-destructive">{formatBRL(totals.expense)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Resultado</p>
            <p className="text-xl font-semibold">{formatBRL(totals.result)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          <Input
            placeholder="Buscar descrição..."
            className="w-full sm:w-56"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <PeriodFilter
            value={periodKey}
            onChange={setPeriodKey}
            custom={custom}
            onCustomChange={setCustom}
          />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os tipos</SelectItem>
              <SelectItem value="receita">Receitas</SelectItem>
              <SelectItem value="despesa">Despesas</SelectItem>
              <SelectItem value="transferencia">Transferências</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as categorias</SelectItem>
              {(categories.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Conta / cartão" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Contas e cartões</SelectItem>
              {(accounts.data ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
              {(cards.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos status</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {transactions.isLoading ? (
        <LoadingState rows={6} />
      ) : transactions.isError ? (
        <ErrorState
          message={(transactions.error as Error)?.message}
          onRetry={() => transactions.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhum lançamento encontrado"
          description="Ajuste os filtros ou registre um novo lançamento."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Novo lançamento
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Conta / Cartão</TableHead>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{formatDateBR(t.date)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {t.transfer_group_id ? (
                          <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : null}
                        <span className="font-medium">{t.description}</span>
                        {t.installment_number ? (
                          <Badge variant="outline">{t.installment_number}ª</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.category_id ? categoryName.get(t.category_id) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.credit_card_id
                        ? cardName.get(t.credit_card_id)
                        : t.account_id
                          ? accountName.get(t.account_id)
                          : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.family_member_id ? memberName.get(t.family_member_id) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.status === "pago" ? "secondary" : "outline"}>
                        {t.status === "pago" ? "Pago" : "Pendente"}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        t.type === "receita"
                          ? "text-chart-2"
                          : t.type === "despesa"
                            ? "text-destructive"
                            : ""
                      }`}
                    >
                      {t.type === "despesa" ? "-" : t.type === "receita" ? "+" : ""}
                      {formatBRL(Math.abs(Number(t.amount)))}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {t.transfer_group_id ? null : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing({
                                id: t.id,
                                type: t.type,
                                description: t.description,
                                amount: Number(t.amount),
                                date: t.date,
                                category_id: t.category_id,
                                account_id: t.account_id,
                                credit_card_id: t.credit_card_id,
                                family_member_id: t.family_member_id,
                                payment_method: t.payment_method,
                                status: t.status,
                                notes: t.notes,
                                tags: t.tags,
                              });
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <ConfirmDelete
                          trigger={
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          }
                          description={
                            t.transfer_group_id
                              ? "As duas pernas da transferência serão excluídas."
                              : "O lançamento será removido permanentemente."
                          }
                          onConfirm={() => handleDelete(t)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        editing={editing}
      />
    </div>
  );
}
