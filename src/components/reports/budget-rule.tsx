import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTable, useUpsert } from "@/hooks/useFinance";
import {
  BUDGET_GROUPS,
  computeBudgetRule,
  isBudgetGroup,
  resolveGroup,
  type BudgetGroup,
  type RuleGroup,
  type RuleLine,
  type RuleTx,
} from "@/lib/budget-rule";
import { formatBRL, formatPercent } from "@/lib/format";

interface CategoryRow {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  budget_group: string | null;
}

interface Props {
  /** Lançamentos do período, já filtrados por pessoa. */
  txs: RuleTx[];
  /** Receitas do período (mesma conta do cartão "Receitas" do relatório). */
  income: number;
  /** Aportes em investimentos do período (já filtrados por período e pessoa). */
  investmentContributions: number;
}

const GROUP_COLOR: Record<BudgetGroup, string> = {
  necessidades: "var(--color-chart-1)",
  desejos: "var(--color-chart-4)",
  poupanca: "var(--color-chart-2)",
};
const OK_COLOR = "#16a34a";
const WARN_COLOR = "#d97706";
const MAX_LINES = 8;

const STATUS_TEXT = {
  ok: "Dentro do ideal",
  acima: "Acima do ideal",
  abaixo: "Abaixo do ideal",
} as const;

function Lines({ lines, total, color }: { lines: RuleLine[]; total: number; color: string }) {
  const shown = lines.slice(0, MAX_LINES);
  const rest = lines.slice(MAX_LINES);
  const restAmount = rest.reduce((s, l) => s + l.amount, 0);
  if (lines.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum gasto neste grupo no período.</p>;
  }
  return (
    <ul className="space-y-2">
      {shown.map((l) => (
        <li key={l.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{l.name}</span>
            <span className="shrink-0 text-muted-foreground">
              {formatBRL(l.amount)} · {formatPercent(l.pct)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full"
              style={{
                width: `${total > 0 ? Math.min((l.amount / total) * 100, 100) : 0}%`,
                background: color,
              }}
            />
          </div>
        </li>
      ))}
      {rest.length > 0 ? (
        <li className="text-xs text-muted-foreground">
          + {rest.length} categoria(s) menores · {formatBRL(restAmount)}
        </li>
      ) : null}
    </ul>
  );
}

function GroupColumn({ group, basisLabel }: { group: RuleGroup; basisLabel: string }) {
  const color = GROUP_COLOR[group.key];
  // escala da régua: cabe o maior entre o real e o ideal, com folga
  const scale = Math.max(group.pct, group.target, 1) * 1.15;
  const ok = group.status === "ok";
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
            {group.label}
          </p>
          <p className="text-xs text-muted-foreground">{group.hint}</p>
        </div>
        <Badge
          variant="outline"
          className={`shrink-0 ${ok ? "border-emerald-600 text-emerald-600" : "border-amber-600 text-amber-600"}`}
        >
          {STATUS_TEXT[group.status]}
        </Badge>
      </div>
      <div>
        <p className="text-lg font-semibold">
          {formatBRL(group.amount)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {formatPercent(group.pct)} {basisLabel}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Ideal ({group.target}%): {formatBRL(group.ideal)} · {formatBRL(Math.abs(group.diff))}{" "}
          {group.diff >= 0 ? "acima" : "abaixo"} do ideal
        </p>
      </div>
      <div
        className="relative h-2.5 rounded-full bg-muted"
        title={`Marca = ideal de ${group.target}%`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${(group.pct / scale) * 100}%`, background: color }}
        />
        <div
          className="absolute -bottom-1 -top-1 w-0.5 rounded bg-foreground/70"
          style={{ left: `${(group.target / scale) * 100}%` }}
        />
      </div>
      <Lines lines={group.lines} total={group.amount} color={color} />
    </div>
  );
}

export function BudgetRule({ txs, income, investmentContributions }: Props) {
  const categories = useTable<CategoryRow>("categories");
  const save = useUpsert("categories", "Grupo da categoria atualizado");
  const [open, setOpen] = useState(false);

  const result = useMemo(
    () =>
      computeBudgetRule({
        txs,
        categories: categories.data ?? [],
        investmentContributions,
        income,
      }),
    [txs, categories.data, investmentContributions, income],
  );

  const byId = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );
  const expenseCategories = useMemo(
    () =>
      (categories.data ?? [])
        .filter((c) => c.type === "despesa")
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [categories.data],
  );

  const basisLabel = result.basis === "renda" ? "da renda" : "do gasto";
  const chartData = result.groups.map((g) => ({
    name: g.label,
    ideal: g.target,
    real: Number(g.pct.toFixed(1)),
    ok: g.status === "ok",
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Regra 50-30-20</CardTitle>
          <p className="text-sm text-muted-foreground">
            {result.basis === "renda"
              ? `Seus gastos do período comparados com 50% necessidades, 30% desejos e 20% poupança e dívidas da renda (${formatBRL(result.income)}).`
              : "Sem receitas no período: os percentuais usam o total gasto como base."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Settings2 className="mr-2 h-4 w-4" /> Organizar categorias
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${v}%`} width={48} />
                <Tooltip formatter={(v) => `${Number(v).toLocaleString("pt-BR")}%`} />
                <Bar
                  dataKey="ideal"
                  name="Ideal (regra)"
                  fill="var(--color-primary)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar dataKey="real" name="Real" radius={[4, 4, 0, 0]}>
                  {chartData.map((d) => (
                    <Cell key={d.name} fill={d.ok ? OK_COLOR : WARN_COLOR} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: "var(--color-primary)" }}
              />{" "}
              Ideal (regra)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: OK_COLOR }} /> Real,
              dentro do ideal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: WARN_COLOR }} /> Real,
              fora do ideal
            </span>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {result.groups.map((g) => (
            <GroupColumn key={g.key} group={g} basisLabel={basisLabel} />
          ))}
        </div>

        {result.unclassified.amount > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">
                {formatBRL(result.unclassified.amount)} ({formatPercent(result.unclassified.pct)}{" "}
                {basisLabel}) em categorias sem grupo
              </p>
              <p className="text-xs text-muted-foreground">
                {result.unclassified.lines
                  .slice(0, 6)
                  .map((l) => l.name)
                  .join(", ")}
                . Classifique-as para a regra ficar completa.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              Classificar
            </Button>
          </div>
        ) : null}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Organizar categorias na regra 50-30-20</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Escolha o grupo de cada categoria de despesa. “Automático” sugere pelo nome (e
            subcategorias seguem a categoria-mãe).
          </p>
          <ul className="divide-y">
            {expenseCategories.map((c) => {
              const auto = resolveGroup({ ...c, budget_group: null }, byId);
              const autoLabel = auto
                ? (BUDGET_GROUPS.find((g) => g.key === auto)?.label ?? "")
                : "sem grupo";
              const mother = c.parent_id ? byId.get(c.parent_id)?.name : null;
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{c.name}</p>
                    {mother ? (
                      <p className="truncate text-xs text-muted-foreground">em {mother}</p>
                    ) : null}
                  </div>
                  <Select
                    value={isBudgetGroup(c.budget_group) ? c.budget_group : "auto"}
                    onValueChange={(v) =>
                      save.mutate({ id: c.id, budget_group: v === "auto" ? null : v })
                    }
                  >
                    <SelectTrigger className="w-52 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Automático ({autoLabel})</SelectItem>
                      {BUDGET_GROUPS.map((g) => (
                        <SelectItem key={g.key} value={g.key}>
                          {g.label} ({g.target}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              );
            })}
            {expenseCategories.length === 0 ? (
              <li className="py-4 text-sm text-muted-foreground">Nenhuma categoria de despesa.</li>
            ) : null}
          </ul>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
