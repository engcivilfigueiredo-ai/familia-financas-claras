import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Landmark,
  PiggyBank,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader, LoadingState, EmptyState } from "@/components/shared/states";
import { PeriodFilter } from "@/components/shared/period-filter";
import { useTable } from "@/hooks/useFinance";
import { useScope } from "@/hooks/useScope";
import {
  formatGoalAmount,
  goalContractBalance,
  goalCurrent,
  goalPct,
  type GoalProject,
} from "@/lib/goals";
import { GoalProgress } from "@/components/shared/goal-progress";
import {
  accountBalance,
  cardOutstanding,
  inPeriod,
  monthsInRange,
  resolvePeriod,
  type AccountRow,
  type CardRow,
  type PeriodKey,
  type Tx,
} from "@/lib/finance";
import { formatBRL, formatMonthBR, formatPercent, monthStart, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | Controle Financeiro Família" },
      {
        name: "description",
        content:
          "Visão geral das finanças da família: saldo, receitas, despesas, faturas e evolução do patrimônio.",
      },
      { property: "og:title", content: "Dashboard | Controle Financeiro Família" },
      {
        property: "og:description",
        content: "Resumo financeiro do mês com gráficos e alertas de vencimento.",
      },
    ],
  }),
  component: DashboardPage,
});

interface Category {
  id: string;
  name: string;
  type: string;
  color: string;
}
interface Investment {
  id: string;
  current_amount: number;
  family_member_id: string | null;
  status: string;
}
interface Asset {
  id: string;
  value: number;
  family_member_id: string | null;
}
interface Liability {
  id: string;
  remaining_amount: number;
  family_member_id: string | null;
}
interface Goal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  family_member_id: string | null;
  goal_kind: string;
  goal_year: number | null;
  unit: string | null;
}
interface Budget {
  id: string;
  category_id: string;
  month_reference: string;
  limit_amount: number;
  family_member_id: string | null;
}

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function DashboardPage() {
  const scope = useScope();
  const [periodKey, setPeriodKey] = useState<PeriodKey>("this-month");
  const [custom, setCustom] = useState({ from: monthStart(new Date()), to: todayISO() });
  const period = useMemo(() => resolvePeriod(periodKey, custom), [periodKey, custom]);

  const transactions = useTable<Tx>("transactions");
  const accounts = useTable<AccountRow>("accounts");
  const cards = useTable<CardRow>("credit_cards");
  const categories = useTable<Category>("categories");
  const investments = useTable<Investment>("investments");
  const assets = useTable<Asset>("assets");
  const liabilities = useTable<Liability>("liabilities");
  const goals = useTable<Goal>("financial_goals");
  const goalProjects = useTable<GoalProject>("projects");
  const budgets = useTable<Budget>("budgets");

  const loading =
    transactions.isLoading || accounts.isLoading || cards.isLoading || investments.isLoading;

  const scoped = useMemo(
    () => (transactions.data ?? []).filter((t) => scope.matches(t.family_member_id)),
    [transactions.data, scope],
  );

  const scopedAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => a.is_active && scope.matches(a.family_member_id)),
    [accounts.data, scope],
  );
  const scopedCards = useMemo(
    () => (cards.data ?? []).filter((c) => c.is_active && scope.matches(c.family_member_id)),
    [cards.data, scope],
  );

  const totals = useMemo(() => {
    const inPeriodTx = scoped.filter((t) => inPeriod(t.date, period));
    const income = inPeriodTx
      .filter((t) => t.type === "receita" && t.status === "pago")
      .reduce((s, t) => s + Number(t.amount), 0);
    const expense = inPeriodTx
      .filter((t) => t.type === "despesa" && t.status === "pago")
      .reduce((s, t) => s + Number(t.amount), 0);
    const balance = scopedAccounts.reduce((s, a) => s + accountBalance(a, scoped), 0);
    const invoices = scopedCards.reduce((s, c) => s + cardOutstanding(c.id, scoped), 0);
    const invested = (investments.data ?? [])
      .filter((i) => i.status !== "encerrado" && scope.matches(i.family_member_id))
      .reduce((s, i) => s + Number(i.current_amount), 0);
    const assetsTotal = (assets.data ?? [])
      .filter((a) => scope.matches(a.family_member_id))
      .reduce((s, a) => s + Number(a.value), 0);
    const liabilitiesTotal = (liabilities.data ?? [])
      .filter((l) => scope.matches(l.family_member_id))
      .reduce((s, l) => s + Number(l.remaining_amount), 0);
    const netWorth = balance + invested + assetsTotal - liabilitiesTotal - invoices;
    return {
      income,
      expense,
      balance,
      invoices,
      invested,
      assetsTotal,
      liabilitiesTotal,
      netWorth,
      result: income - expense,
      savingRate: income > 0 ? (income - expense) / income : 0,
    };
  }, [scoped, period, scopedAccounts, scopedCards, investments.data, assets.data, liabilities.data, scope]);

  const monthlySeries = useMemo(() => {
    const months = monthsInRange(period.from, period.to);
    const base = months.length > 1 ? months : monthsInRange(resolvePeriod("last-6").from, period.to);
    return base.map((month) => {
      const prefix = month.slice(0, 7);
      const rows = scoped.filter((t) => t.date.startsWith(prefix));
      const receita = rows
        .filter((t) => t.type === "receita" && t.status === "pago")
        .reduce((s, t) => s + Number(t.amount), 0);
      const despesa = rows
        .filter((t) => t.type === "despesa" && t.status === "pago")
        .reduce((s, t) => s + Number(t.amount), 0);
      return { month: formatMonthBR(month), receita, despesa, saldo: receita - despesa };
    });
  }, [scoped, period]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of scoped) {
      if (t.type !== "despesa" || !inPeriod(t.date, period)) continue;
      const key = t.category_id ?? "sem-categoria";
      map.set(key, (map.get(key) ?? 0) + Number(t.amount));
    }
    const names = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
    return [...map.entries()]
      .map(([id, value]) => ({ name: names.get(id) ?? "Sem categoria", value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [scoped, period, categories.data]);

  const upcoming = useMemo(() => {
    const today = todayISO();
    return scoped
      .filter((t) => t.status !== "pago" && t.type !== "transferencia")
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6)
      .map((t) => ({ ...t, late: t.date < today }));
  }, [scoped]);

  const budgetProgress = useMemo(() => {
    const month = monthStart(new Date());
    const names = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
    return (budgets.data ?? [])
      .filter((b) => b.month_reference === month && scope.matches(b.family_member_id))
      .map((b) => {
        const spent = scoped
          .filter(
            (t) =>
              t.type === "despesa" &&
              t.category_id === b.category_id &&
              t.date.startsWith(month.slice(0, 7)),
          )
          .reduce((s, t) => s + Number(t.amount), 0);
        const limit = Number(b.limit_amount) || 1;
        return {
          id: b.id,
          name: names.get(b.category_id) ?? "Categoria",
          spent,
          limit: Number(b.limit_amount),
          pct: Math.min((spent / limit) * 100, 130),
        };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [budgets.data, categories.data, scoped, scope]);

  const scopedGoals = useMemo(
    () =>
      (goals.data ?? [])
        .filter((g) => scope.matches(g.family_member_id))
        .slice(0, 4)
        .map((g) => {
          // mesmo cálculo da página Metas: metas BF são calculadas ao vivo (lib/goals)
          const current = goalCurrent(g, goalProjects.data ?? [], transactions.data ?? []);
          const target = Number(g.target_amount);
          const rawPct = goalPct(current, target);
          // faixa cinza: com o saldo em contrato, até onde a meta chegaria
          const balance = goalContractBalance(g, goalProjects.data ?? []);
          const potential = balance > 0 ? goalPct(current + balance, target) : null;
          return { ...g, current, target, rawPct, pct: Math.min(rawPct, 100), balance, potential };
        }),
    [goals.data, goalProjects.data, transactions.data, scope],
  );

  if (loading) return <LoadingState rows={6} label="Carregando seu painel..." />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`${scope.view === "family" ? "Visão da família" : "Visão individual"} · ${period.label}`}
        actions={
          <PeriodFilter
            value={periodKey}
            onChange={setPeriodKey}
            custom={custom}
            onCustomChange={setCustom}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Saldo em contas"
          value={formatBRL(totals.balance)}
          icon={Wallet}
          hint={`${scopedAccounts.length} conta(s) ativa(s)`}
        />
        <StatCard
          title="Receitas do período"
          value={formatBRL(totals.income)}
          icon={ArrowUpRight}
          tone="positive"
        />
        <StatCard
          title="Despesas do período"
          value={formatBRL(totals.expense)}
          icon={ArrowDownRight}
          tone="negative"
        />
        <StatCard
          title="Resultado"
          value={formatBRL(totals.result)}
          icon={PiggyBank}
          tone={totals.result >= 0 ? "positive" : "negative"}
          hint={`Taxa de poupança ${formatPercent(totals.savingRate)}`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Faturas abertas"
          value={formatBRL(totals.invoices)}
          icon={CreditCard}
          hint={`${scopedCards.length} cartão(ões)`}
        />
        <StatCard title="Investimentos" value={formatBRL(totals.invested)} icon={TrendingUp} />
        <StatCard title="Bens" value={formatBRL(totals.assetsTotal)} icon={Landmark} />
        <StatCard
          title="Patrimônio líquido"
          value={formatBRL(totals.netWorth)}
          icon={Landmark}
          tone={totals.netWorth >= 0 ? "positive" : "negative"}
          hint={`Dívidas ${formatBRL(totals.liabilitiesTotal)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Receitas x Despesas</CardTitle>
            <CardDescription>Evolução mensal do fluxo de caixa</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {monthlySeries.length === 0 ? (
              <EmptyState title="Sem dados" description="Registre lançamentos para ver o gráfico." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    stroke="var(--color-muted-foreground)"
                    tickFormatter={(v) => formatBRL(Number(v))}
                    width={90}
                  />
                  <Tooltip formatter={(v) => formatBRL(Number(v))} />
                  <Legend />
                  <Bar dataKey="receita" name="Receitas" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="despesa" name="Despesas" fill="var(--color-chart-5)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Despesas por categoria</CardTitle>
            <CardDescription>{period.label}</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {byCategory.length === 0 ? (
              <EmptyState title="Sem despesas" description="Nenhuma despesa neste período." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
                    {byCategory.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatBRL(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Evolução do saldo</CardTitle>
            <CardDescription>Resultado mensal acumulável</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlySeries}>
                <defs>
                  <linearGradient id="saldoFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="var(--color-muted-foreground)"
                  tickFormatter={(v) => formatBRL(Number(v))}
                  width={90}
                />
                <Tooltip formatter={(v) => formatBRL(Number(v))} />
                <Area
                  type="monotone"
                  dataKey="saldo"
                  name="Resultado"
                  stroke="var(--color-chart-1)"
                  fill="url(#saldoFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximos vencimentos</CardTitle>
            <CardDescription>Contas pendentes de pagamento ou recebimento</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.length === 0 ? (
              <EmptyState title="Tudo em dia" description="Nenhum vencimento pendente." />
            ) : (
              upcoming.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(`${t.date}T12:00:00`).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{formatBRL(Number(t.amount))}</span>
                    <Badge variant={t.late ? "destructive" : "secondary"}>
                      {t.late ? "Atrasado" : "A vencer"}
                    </Badge>
                  </div>
                </div>
              ))
            )}
            <Link to="/a-pagar" className="block text-sm text-primary underline-offset-4 hover:underline">
              Ver contas a pagar
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orçamento e metas</CardTitle>
            <CardDescription>Acompanhamento do mês atual</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {budgetProgress.length === 0 && scopedGoals.length === 0 ? (
              <EmptyState
                title="Nada configurado"
                description="Defina orçamentos e metas para acompanhar aqui."
              />
            ) : null}
            {budgetProgress.map((b) => (
              <div key={b.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{b.name}</span>
                  <span className="text-muted-foreground">
                    {formatBRL(b.spent)} / {formatBRL(b.limit)}
                  </span>
                </div>
                <Progress value={b.pct} />
              </div>
            ))}
            {scopedGoals.map((g) => (
              <div key={g.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 font-medium">
                    <Target className="h-3.5 w-3.5" /> {g.name}
                  </span>
                  <span className="text-muted-foreground">
                    {formatGoalAmount(g.current, g)} / {formatGoalAmount(g.target, g)} ·{" "}
                    {formatPercent(g.rawPct)}
                  </span>
                </div>
                <GoalProgress value={g.pct} potential={g.potential} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  tone = "neutral",
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-chart-2"
      : tone === "negative"
        ? "text-destructive"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 pt-6">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className={`truncate text-2xl font-semibold ${toneClass}`}>{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="h-4 w-4" />
        </span>
      </CardContent>
    </Card>
  );
}
