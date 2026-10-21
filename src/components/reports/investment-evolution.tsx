import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTable } from "@/hooks/useFinance";
import { useScope } from "@/hooks/useScope";
import { formatBRL, formatMonthBR, formatPercent } from "@/lib/format";

interface Inv {
  id: string;
  type: string;
  current_amount: number;
  application_date: string;
  family_member_id: string | null;
}
interface InvTx {
  investment_id: string;
  type: string;
  amount: number;
  date: string;
}

function flow(t: InvTx) {
  const v = Number(t.amount);
  if (t.type === "aplicação" || t.type === "rendimento") return v;
  if (t.type === "resgate") return -v;
  return 0;
}

/** Posição de cada mês reconstruída a partir do valor atual, descontando movimentações posteriores. */
export function InvestmentEvolution({ months }: { months: string[] }) {
  const scope = useScope();
  const investments = useTable<Inv>("investments");
  const movements = useTable<InvTx>("investment_transactions");
  const [open, setOpen] = useState(false);

  const { rows, types } = useMemo(() => {
    const invs = (investments.data ?? []).filter((i) => scope.matches(i.family_member_id));
    const txs = movements.data ?? [];
    const thisMonth = new Date().toISOString().slice(0, 7);
    const typeSet = new Set<string>();
    const result = months.map((m) => {
      const key = m.slice(0, 7);
      const byType: Record<string, number> = {};
      let total = 0;
      for (const inv of invs) {
        let value: number;
        if (key >= thisMonth) value = Number(inv.current_amount);
        else if (inv.application_date.slice(0, 7) > key &&
          !txs.some((t) => t.investment_id === inv.id && t.date.slice(0, 7) <= key)) value = 0;
        else {
          const later = txs
            .filter((t) => t.investment_id === inv.id && t.date.slice(0, 7) > key)
            .reduce((s, t) => s + flow(t), 0);
          value = Math.max(0, Number(inv.current_amount) - later);
        }
        if (value > 0) {
          byType[inv.type] = (byType[inv.type] ?? 0) + value;
          typeSet.add(inv.type);
          total += value;
        }
      }
      return { month: m, label: formatMonthBR(m), total, byType };
    });
    const withGrowth = result.map((r, i) => {
      const prev = i > 0 ? result[i - 1]!.total : 0;
      return { ...r, growth: prev > 0 ? ((r.total - prev) / prev) * 100 : 0 };
    });
    return { rows: withGrowth, types: [...typeSet].sort() };
  }, [investments.data, movements.data, months, scope]);

  if (investments.isLoading || movements.isLoading) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Posição dos investimentos no fim do mês</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => formatBRL(Number(v))} width={95} />
                <Tooltip formatter={(v) => formatBRL(Number(v))} />
                <Line type="monotone" dataKey="total" name="Posição" stroke="var(--color-chart-1)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crescimento mensal (%)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} width={60} />
                <Tooltip formatter={(v) => formatPercent(Number(v))} />
                <Bar dataKey="growth" name="Crescimento" radius={[4, 4, 0, 0]}>
                  {rows.map((r) => (
                    <Cell key={r.month} fill={r.growth < 0 ? "var(--color-destructive)" : "var(--color-chart-2)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ChevronDown className={`mr-1 h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            {open ? "Ocultar" : "Ver"} detalhamento por tipo de investimento
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="overflow-x-auto pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    {types.map((t) => (
                      <TableHead key={t} className="text-right capitalize">{t}</TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Cresc.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.month}>
                      <TableCell>{r.label}</TableCell>
                      {types.map((t) => (
                        <TableCell key={t} className="text-right">{formatBRL(r.byType[t] ?? 0)}</TableCell>
                      ))}
                      <TableCell className="text-right font-medium">{formatBRL(r.total)}</TableCell>
                      <TableCell className={`text-right ${r.growth < 0 ? "text-destructive" : ""}`}>
                        {formatPercent(r.growth)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                Meses anteriores são estimados a partir do valor atual, descontando aportes, resgates e
                rendimentos lançados depois de cada mês.
              </p>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
