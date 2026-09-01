import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/shared/states";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { useRemove, useTable, useUpsert } from "@/hooks/useFinance";
import { useScope } from "@/hooks/useScope";
import type { Tx } from "@/lib/finance";
import {
  addMonths,
  formatBRL,
  formatMonthBR,
  formatPercent,
  monthStart,
  parseCurrencyInput,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/orcamento")({
  head: () => ({
    meta: [
      { title: "Orçamento | Controle Financeiro Família" },
      { name: "description", content: "Defina limites de gastos por categoria e acompanhe o consumo." },
      { property: "og:title", content: "Orçamento | Controle Financeiro Família" },
      { property: "og:description", content: "Defina limites de gastos por categoria e acompanhe o consumo." },
    ],
  }),
  component: OrcamentoPage,
});

interface Named {
  id: string;
  name: string;
  type?: string;
}

interface BudgetRow {
  id: string;
  category_id: string;
  month_reference: string;
  limit_amount: number;
  family_member_id: string | null;
}

const NONE = "__none__";

function OrcamentoPage() {
  const scope = useScope();
  const budgets = useTable<BudgetRow>("budgets");
  const transactions = useTable<Tx>("transactions");
  const categories = useTable<Named>("categories");
  const members = useTable<Named>("family_members");
  const upsert = useUpsert("budgets", "Orçamento salvo");
  const remove = useRemove("budgets", "Orçamento excluído");

  const currentMonth = monthStart(new Date());
  const [month, setMonth] = useState(currentMonth);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    id: "",
    category_id: "",
    limit_amount: "",
    family_member_id: NONE,
  });

  const monthOptions = useMemo(() => {
    const list: string[] = [];
    for (let i = -6; i <= 6; i += 1) list.push(monthStart(addMonths(currentMonth, i)));
    return list;
  }, [currentMonth]);

  const expenseCategories = useMemo(
    () => (categories.data ?? []).filter((c) => c.type === "despesa"),
    [categories.data],
  );
  const categoryName = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c.name])),
    [categories.data],
  );

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions.data ?? []) {
      if (t.type !== "despesa" || !t.category_id) continue;
      if (!scope.matches(t.family_member_id)) continue;
      if (monthStart(t.date) !== month) continue;
      map.set(t.category_id, (map.get(t.category_id) ?? 0) + Number(t.amount));
    }
    return map;
  }, [transactions.data, month, scope]);

  const rows = useMemo(
    () =>
      (budgets.data ?? [])
        .filter((b) => b.month_reference === month && scope.matches(b.family_member_id))
        .map((b) => {
          const spent = spentByCategory.get(b.category_id) ?? 0;
          const limit = Number(b.limit_amount);
          return { ...b, spent, limit, pct: limit > 0 ? (spent / limit) * 100 : 0 };
        }),
    [budgets.data, month, scope, spentByCategory],
  );

  const totals = rows.reduce(
    (acc, r) => ({ limit: acc.limit + r.limit, spent: acc.spent + r.spent }),
    { limit: 0, spent: 0 },
  );

  function openNew() {
    setForm({
      id: "",
      category_id: expenseCategories[0]?.id ?? "",
      limit_amount: "",
      family_member_id: scope.memberId ?? NONE,
    });
    setOpen(true);
  }

  function save() {
    if (!form.category_id) return;
    upsert.mutate(
      {
        ...(form.id ? { id: form.id } : {}),
        category_id: form.category_id,
        month_reference: month,
        limit_amount: parseCurrencyInput(form.limit_amount || "0"),
        family_member_id: form.family_member_id === NONE ? null : form.family_member_id,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orçamento"
        description={`${formatMonthBR(month)} · ${formatBRL(totals.spent)} de ${formatBRL(totals.limit)}`}
        actions={
          <div className="flex gap-2">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatMonthBR(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Novo limite
            </Button>
          </div>
        }
      />

      {budgets.isLoading ? (
        <LoadingState rows={4} />
      ) : budgets.isError ? (
        <ErrorState message={(budgets.error as Error)?.message} onRetry={() => budgets.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhum limite definido"
          description="Defina limites por categoria para acompanhar o consumo do mês."
          icon={<Target className="h-6 w-6" />}
          action={
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Novo limite
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Card key={row.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                <CardTitle className="text-base">
                  {categoryName.get(row.category_id) ?? "Categoria"}
                </CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setForm({
                        id: row.id,
                        category_id: row.category_id,
                        limit_amount: String(row.limit_amount ?? ""),
                        family_member_id: row.family_member_id ?? NONE,
                      });
                      setOpen(true);
                    }}
                  >
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
                <p className="text-xl font-semibold">
                  {formatBRL(row.spent)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    de {formatBRL(row.limit)}
                  </span>
                </p>
                <Progress value={Math.min(row.pct, 100)} />
                <div className="flex items-center justify-between">
                  <Badge variant={row.pct > 100 ? "destructive" : row.pct > 80 ? "outline" : "secondary"}>
                    {formatPercent(row.pct)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {row.limit - row.spent >= 0
                      ? `Resta ${formatBRL(row.limit - row.spent)}`
                      : `Excedeu ${formatBRL(row.spent - row.limit)}`}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar limite" : "Novo limite"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Categoria</Label>
              <Select
                value={form.category_id}
                onValueChange={(v) => setForm({ ...form, category_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bg-limit">Limite mensal</Label>
              <Input
                id="bg-limit"
                value={form.limit_amount}
                onChange={(e) => setForm({ ...form, limit_amount: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
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
            <p className="text-xs text-muted-foreground">
              Mês de referência: {formatMonthBR(month)}
            </p>
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
    </div>
  );
}
