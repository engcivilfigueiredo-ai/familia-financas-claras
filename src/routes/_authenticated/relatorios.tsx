import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, LoadingState, PageHeader } from "@/components/shared/states";
import { PeriodFilter } from "@/components/shared/period-filter";
import { useTable } from "@/hooks/useFinance";
import { InvestmentEvolution } from "@/components/reports/investment-evolution";
import { BudgetRule } from "@/components/reports/budget-rule";
import { useScope } from "@/hooks/useScope";
import {
  inPeriod,
  monthsInRange,
  resolvePeriod,
  type PeriodKey,
  type Tx,
} from "@/lib/finance";
import { formatBRL, formatMonthBR, formatPercent, monthStart } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios | Controle Financeiro Família" },
      { name: "description", content: "Análises de receitas, despesas e evolução financeira." },
      { property: "og:title", content: "Relatórios | Controle Financeiro Família" },
      { property: "og:description", content: "Análises de receitas, despesas e evolução financeira." },
    ],
  }),
  component: RelatoriosPage,
});

interface Named {
  id: string;
  name: string;
  color?: string;
}

const FALLBACK_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const DEFAULT_CATEGORY_COLOR = "#64748b";

function RelatoriosPage() {
  const scope = useScope();
  const transactions = useTable<Tx>("transactions");
  const categories = useTable<Named>("categories");
  const members = useTable<Named>("family_members");
  const investments = useTable<{ id: string; family_member_id: string | null }>("investments");
  const investmentMoves = useTable<{ investment_id: string; type: string; amount: number; date: string }>(
    "investment_transactions",
  );

  const [periodKey, setPeriodKey] = useState<PeriodKey>("last-6");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const period = useMemo(() => resolvePeriod(periodKey, custom), [periodKey, custom]);

  const txs = useMemo(
    () =>
      (transactions.data ?? []).filter(
        (t) => scope.matches(t.family_member_id) && inPeriod(t.date, period),
      ),
    [transactions.data, scope, period],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of txs) {
      if (t.type === "receita") income += Number(t.amount);
      if (t.type === "despesa") expense += Number(t.amount);
    }
    const rate = income > 0 ? ((income - expense) / income) * 100 : 0;
    return { income, expense, balance: income - expense, rate };
  }, [txs]);

  const monthly = useMemo(() => {
    const months = monthsInRange(period.from, period.to);
    const map = new Map(months.map((m) => [m, { month: m, receita: 0, despesa: 0 }]));
    for (const t of txs) {
      const key = monthStart(t.date);
      const row = map.get(key);
      if (!row) continue;
      if (t.type === "receita") row.receita += Number(t.amount);
      if (t.type === "despesa") row.despesa += Number(t.amount);
    }
    return [...map.values()].map((r) => ({
      ...r,
      label: formatMonthBR(r.month),
      saldo: r.receita - r.despesa,
    }));
  }, [txs, period]);

  const byCategory = useMemo(() => {
    const catMap = new Map((categories.data ?? []).map((c) => [c.id, c]));
    const map = new Map<string, { name: string; value: number; color: string }>();
    let i = 0;
    for (const t of txs) {
      if (t.type !== "despesa") continue;
      const cat = t.category_id ? catMap.get(t.category_id) : undefined;
      const key = cat?.id ?? "sem-categoria";
      const existing = map.get(key);
      if (existing) existing.value += Number(t.amount);
      else {
        const savedColor = cat?.color?.trim();
        const chartColor = savedColor && savedColor.toLowerCase() !== DEFAULT_CATEGORY_COLOR
          ? savedColor
          : FALLBACK_COLORS[i % FALLBACK_COLORS.length] || "var(--color-chart-1)";
        map.set(key, {
          name: cat?.name ?? "Sem categoria",
          value: Number(t.amount),
          color: chartColor,
        });
        i += 1;
      }
    }
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [txs, categories.data]);

  const byMember = useMemo(() => {
    const nameMap = new Map((members.data ?? []).map((m) => [m.id, m.name]));
    const map = new Map<string, { name: string; receita: number; despesa: number }>();
    for (const t of txs) {
      if (t.type === "transferencia") continue;
      const key = t.family_member_id ?? "familia";
      const row =
        map.get(key) ??
        ({
          name: t.family_member_id ? nameMap.get(t.family_member_id) ?? "Pessoa" : "Família",
          receita: 0,
          despesa: 0,
        } as { name: string; receita: number; despesa: number });
      if (t.type === "receita") row.receita += Number(t.amount);
      else row.despesa += Number(t.amount);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.despesa - a.despesa);
  }, [txs, members.data]);

  const expenseTotal = byCategory.reduce((s, c) => s + c.value, 0);

  // Aportes em investimentos do período (compõem o grupo "Poupança e dívidas" da regra 50-30-20)
  const contributions = useMemo(() => {
    const owner = new Map((investments.data ?? []).map((i) => [i.id, i.family_member_id]));
    const cents = (investmentMoves.data ?? [])
      .filter(
        (m) =>
          m.type === "aplicação" &&
          owner.has(m.investment_id) &&
          scope.matches(owner.get(m.investment_id) ?? null) &&
          inPeriod(m.date, period),
      )
      .reduce((s, m) => s + Math.round(Math.abs(Number(m.amount)) * 100), 0);
    return cents / 100;
  }, [investments.data, investmentMoves.data, scope, period]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description={`Análises de ${period.label.toLowerCase()}.`}
        actions={
          <PeriodFilter
            value={periodKey}
            onChange={setPeriodKey}
            custom={custom}
            onCustomChange={setCustom}
          />
        }
      />

      {transactions.isLoading ? (
        <LoadingState rows={4} />
      ) : transactions.isError ? (
        <ErrorState
          message={(transactions.error as Error)?.message}
          onRetry={() => transactions.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Receitas", value: totals.income },
              { label: "Despesas", value: -totals.expense },
              { label: "Saldo", value: totals.balance },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="pt-6">
                  <p className="text-xs uppercase text-muted-foreground">{item.label}</p>
                  <p
                    className={`text-lg font-semibold ${item.value < 0 ? "text-destructive" : ""}`}
                  >
                    {formatBRL(item.value)}
                  </p>
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs uppercase text-muted-foreground">Taxa de economia</p>
                <p className="text-lg font-semibold">{formatPercent(totals.rate)}</p>
              </CardContent>
            </Card>
          </div>

          <BudgetRule txs={txs} income={totals.income} investmentContributions={contributions} />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receitas x Despesas por mês</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => formatBRL(Number(v))} width={90} />
                    <Tooltip formatter={(v) => formatBRL(Number(v))} />
                    <Legend />
                    <Bar dataKey="receita" name="Receitas" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesa" name="Despesas" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evolução do saldo mensal</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => formatBRL(Number(v))} width={90} />
                    <Tooltip formatter={(v) => formatBRL(Number(v))} />
                    <Line
                      type="monotone"
                      dataKey="saldo"
                      name="Saldo"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Despesas por categoria</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {byCategory.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Nenhuma despesa no período.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byCategory}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={95}
                      >
                        {byCategory.map((c) => (
                          <Cell key={c.name} fill={c.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatBRL(Number(v))} />
                      <Legend iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ranking de categorias</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byCategory.slice(0, 10).map((c) => (
                      <TableRow key={c.name}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell className="text-right">{formatBRL(c.value)}</TableCell>
                        <TableCell className="text-right">
                          {formatPercent(expenseTotal > 0 ? (c.value / expenseTotal) * 100 : 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {byCategory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          Sem dados no período.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <InvestmentEvolution months={monthsInRange(period.from, period.to)} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comparativo por pessoa</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead>
                    <TableHead className="text-right">Receitas</TableHead>
                    <TableHead className="text-right">Despesas</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byMember.map((m) => (
                    <TableRow key={m.name}>
                      <TableCell>{m.name}</TableCell>
                      <TableCell className="text-right">{formatBRL(m.receita)}</TableCell>
                      <TableCell className="text-right">{formatBRL(m.despesa)}</TableCell>
                      <TableCell className="text-right">
                        {formatBRL(m.receita - m.despesa)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {byMember.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Sem dados no período.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
