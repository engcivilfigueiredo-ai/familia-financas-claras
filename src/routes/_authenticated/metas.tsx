import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Flag, Pencil, Plus, Trash2 } from "lucide-react";
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
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/shared/states";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { useRemove, useTable, useUpsert } from "@/hooks/useFinance";
import { useScope } from "@/hooks/useScope";
import {
  GOAL_KINDS,
  formatGoalAmount,
  goalContractBalance,
  goalCurrent,
  goalPct,
  goalYear,
  kindInfo,
} from "@/lib/goals";
import { GoalProgress } from "@/components/shared/goal-progress";
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
  goal_kind: string;
  goal_year: number | null;
  unit: string | null;
}

interface ProjectLite {
  id: string;
  budget_date: string | null;
  closing_date: string | null;
  status: string;
  contract_amount: number;
  addenda_amount: number;
  received_amount: number;
}

interface TxLite {
  type: string;
  amount: number;
  date: string;
  status: string;
  project_id: string | null;
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
  goal_kind: "financeiro",
  goal_year: String(new Date().getFullYear()),
  unit: "",
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
  const projects = useTable<ProjectLite>("projects");
  const txs = useTable<TxLite>("transactions");
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
          const info = kindInfo(g.goal_kind);
          const year = goalYear(g);
          // mesmo cálculo do dashboard (lib/goals): metas BF são calculadas ao vivo
          const current = goalCurrent(g, projects.data ?? [], txs.data ?? []);
          const pct = goalPct(current, target);
          const months = monthsUntil(g.target_date);
          const missing = Math.max(target - current, 0);
          const fmt = (v: number) => formatGoalAmount(v, g);
          // saldo em contrato (só meta de faturamento): faixa cinza atrás da barra
          const balance = goalContractBalance(g, projects.data ?? []);
          const potential = balance > 0 ? goalPct(current + balance, target) : null;
          return {
            ...g,
            current_amount: current,
            info,
            fmt,
            year,
            pct,
            balance,
            potential,
            missing,
            monthly: months > 0 ? missing / months : missing,
            months,
          };
        }),
    [goals.data, scope, projects.data, txs.data],
  );

  function openNew() {
    setForm({ ...emptyForm, family_member_id: scope.memberId ?? NONE });
    setOpen(true);
  }

  function save() {
    if (!form.name.trim()) return;
    const info = kindInfo(form.goal_kind);
    const target = parseCurrencyInput(form.target_amount || "0");
    const current = info.auto ? 0 : parseCurrencyInput(form.current_amount || "0");
    const year = Number(form.goal_year) || new Date().getFullYear();
    const targetDate = info.auto ? form.target_date || `${year}-12-31` : form.target_date || null;
    const months = monthsUntil(targetDate);
    upsert.mutate(
      {
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        target_amount: target,
        current_amount: current,
        target_date: targetDate,
        category: form.category.trim() || null,
        goal_kind: form.goal_kind,
        goal_year: info.auto ? year : null,
        unit: form.goal_kind === "quantidade" ? form.unit.trim() || null : null,
        monthly_contribution_needed: info.money
          ? months > 0
            ? Math.max(target - current, 0) / months
            : Math.max(target - current, 0)
          : null,
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
        goal_kind: contribGoal.goal_kind,
        unit: contribGoal.unit,
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
                    {row.info.label}
                    {row.info.auto ? ` · ${row.year}` : row.category ? ` · ${row.category}` : ""}
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
                        goal_kind: row.goal_kind ?? "financeiro",
                        goal_year: String(row.goal_year ?? new Date().getFullYear()),
                        unit: row.unit ?? "",
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
                  {row.fmt(Number(row.current_amount))}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    de {row.fmt(Number(row.target_amount))}
                  </span>
                </p>
                <GoalProgress value={Math.min(row.pct, 100)} potential={row.potential} />
                {row.balance > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Faixa cinza: saldo em contrato de {row.fmt(row.balance)} a receber. Com ele a meta
                    chega a {formatPercent(row.potential ?? 0)}.
                  </p>
                ) : null}
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
                    Faltam {row.fmt(row.missing)}
                    {row.months > 0
                      ? ` · ${row.fmt(Math.ceil(row.info.money ? row.monthly * 100 : row.monthly) / (row.info.money ? 100 : 1))}/mês em ${row.months} meses`
                      : ""}
                  </p>
                ) : (
                  <p className="text-xs text-primary-ink">Meta alcançada!</p>
                )}
                {row.info.auto ? (
                  <p className="text-xs text-muted-foreground">Atualizado automaticamente pela BF Engenharia</p>
                ) : (
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
                  {row.info.money ? "Registrar aporte" : "Registrar progresso"}
                </Button>
                )}
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
              <Label>Tipo de meta</Label>
              <Select value={form.goal_kind} onValueChange={(v) => setForm({ ...form, goal_kind: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              <Label htmlFor="go-target">{kindInfo(form.goal_kind).money ? "Valor alvo" : "Meta (quantidade)"}</Label>
              <Input
                id="go-target"
                value={form.target_amount}
                onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            {kindInfo(form.goal_kind).auto ? (
            <div className="grid gap-2">
              <Label htmlFor="go-year">Ano</Label>
              <Input
                id="go-year"
                value={form.goal_year}
                onChange={(e) => setForm({ ...form, goal_year: e.target.value })}
                inputMode="numeric"
              />
            </div>
            ) : (
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
            )}
            {form.goal_kind === "quantidade" && (
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="go-unit">Unidade</Label>
                <Input
                  id="go-unit"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="ARTs, m², visitas..."
                />
              </div>
            )}
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
