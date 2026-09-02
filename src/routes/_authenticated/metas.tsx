import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Flag, Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  formatBRL,
  formatDateBR,
  formatPercent,
  parseCurrencyInput,
  parseISO,
  todayISO,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/metas")({
  head: () => ({
    meta: [
      { title: "Metas | Controle Financeiro Família" },
      { name: "description", content: "Crie metas de economia e acompanhe o progresso." },
      { property: "og:title", content: "Metas | Controle Financeiro Família" },
      { property: "og:description", content: "Crie metas de economia e acompanhe o progresso." },
    ],
  }),
  component: MetasPage,
});

interface Named {
  id: string;
  name: string;
}

interface GoalRow {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  category: string | null;
  family_member_id: string | null;
}

const NONE = "__none__";

const emptyForm = {
  id: "",
  name: "",
  target_amount: "",
  current_amount: "",
  target_date: "",
  category: "",
  family_member_id: NONE,
};

function monthsUntil(dateISO: string | null): number {
  if (!dateISO) return 0;
  const target = parseISO(dateISO);
  const now = parseISO(todayISO());
  const months =
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  return Math.max(months, 0);
}

function MetasPage() {
  const scope = useScope();
  const goals = useTable<GoalRow>("financial_goals");
  const members = useTable<Named>("family_members");
  const upsert = useUpsert("financial_goals", "Meta salva");
  const remove = useRemove("financial_goals", "Meta excluída");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [contribOpen, setContribOpen] = useState(false);
  const [contribGoal, setContribGoal] = useState<GoalRow | null>(null);
  const [contribValue, setContribValue] = useState("");

  const memberName = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.id, m.name])),
    [members.data],
  );

  const rows = useMemo(
    () =>
      (goals.data ?? [])
        .filter((g) => scope.matches(g.family_member_id))
        .map((g) => {
          const target = Number(g.target_amount);
          const current = Number(g.current_amount);
          const pct = target > 0 ? (current / target) * 100 : 0;
          const months = monthsUntil(g.target_date);
          const missing = Math.max(target - current, 0);
          return {
            ...g,
            pct,
            missing,
            monthly: months > 0 ? missing / months : missing,
            months,
          };
        }),
    [goals.data, scope],
  );

  function openNew() {
    setForm({ ...emptyForm, family_member_id: scope.memberId ?? NONE });
    setOpen(true);
  }

  function save() {
    if (!form.name.trim()) return;
    const target = parseCurrencyInput(form.target_amount || "0");
    const current = parseCurrencyInput(form.current_amount || "0");
    const months = monthsUntil(form.target_date || null);
    upsert.mutate(
      {
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        target_amount: target,
        current_amount: current,
        target_date: form.target_date || null,
        category: form.category.trim() || null,
        monthly_contribution_needed:
          months > 0 ? Math.max(target - current, 0) / months : Math.max(target - current, 0),
        family_member_id: form.family_member_id === NONE ? null : form.family_member_id,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  function saveContribution() {
    if (!contribGoal) return;
    const value = parseCurrencyInput(contribValue || "0");
    upsert.mutate(
      {
        id: contribGoal.id,
        name: contribGoal.name,
        target_amount: Number(contribGoal.target_amount),
        current_amount: Number(contribGoal.current_amount) + value,
        target_date: contribGoal.target_date,
        category: contribGoal.category,
        family_member_id: contribGoal.family_member_id,
      },
      {
        onSuccess: () => {
          setContribOpen(false);
          setContribValue("");
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metas financeiras"
        description="Crie metas de economia e acompanhe o progresso."
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Nova meta
          </Button>
        }
      />

      {goals.isLoading ? (
        <LoadingState rows={3} />
      ) : goals.isError ? (
        <ErrorState message={(goals.error as Error)?.message} onRetry={() => goals.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhuma meta criada"
          description="Defina um objetivo, um valor e uma data para acompanhar sua evolução."
          icon={<Flag className="h-6 w-6" />}
          action={
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Nova meta
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Card key={row.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                <div>
                  <CardTitle className="text-base">{row.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {row.category ?? "Sem categoria"}
                    {row.target_date ? ` · até ${formatDateBR(row.target_date)}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setForm({
                        id: row.id,
                        name: row.name,
                        target_amount: String(row.target_amount ?? ""),
                        current_amount: String(row.current_amount ?? ""),
                        target_date: row.target_date ?? "",
                        category: row.category ?? "",
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
              <CardContent className="space-y-3">
                <p className="text-xl font-semibold">
                  {formatBRL(Number(row.current_amount))}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    de {formatBRL(Number(row.target_amount))}
                  </span>
                </p>
                <Progress value={Math.min(row.pct, 100)} />
                <div className="flex items-center justify-between">
                  <Badge variant={row.pct >= 100 ? "secondary" : "outline"}>
                    {formatPercent(row.pct)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {row.family_member_id ? memberName.get(row.family_member_id) : "Família"}
                  </span>
                </div>
                {row.missing > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Faltam {formatBRL(row.missing)}
                    {row.months > 0
                      ? ` · ${formatBRL(row.monthly)}/mês em ${row.months} meses`
                      : ""}
                  </p>
                ) : (
                  <p className="text-xs text-success-foreground">Meta alcançada!</p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setContribGoal(row);
                    setContribValue("");
                    setContribOpen(true);
                  }}
                >
                  Registrar aporte
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar meta" : "Nova meta"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="go-name">Nome</Label>
              <Input
                id="go-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Reserva de emergência"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="go-target">Valor alvo</Label>
              <Input
                id="go-target"
                value={form.target_amount}
                onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="go-current">Valor atual</Label>
              <Input
                id="go-current"
                value={form.current_amount}
                onChange={(e) => setForm({ ...form, current_amount: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="go-date">Data alvo</Label>
              <Input
                id="go-date"
                type="date"
                value={form.target_date}
                onChange={(e) => setForm({ ...form, target_date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="go-cat">Categoria</Label>
              <Input
                id="go-cat"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Viagem, imóvel..."
              />
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

      <Dialog open={contribOpen} onOpenChange={setContribOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar aporte</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="go-contrib">Valor</Label>
            <Input
              id="go-contrib"
              value={contribValue}
              onChange={(e) => setContribValue(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContribOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveContribution} disabled={upsert.isPending}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
