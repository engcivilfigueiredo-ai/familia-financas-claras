import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";

export interface AllocationSlice {
  name: string;
  value: number;
}

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export function AllocationChart({
  title,
  description,
  slices,
}: {
  title: string;
  description?: string;
  slices: AllocationSlice[];
}) {
  const data = useMemo(
    () =>
      slices
        .filter((s) => Number(s.value) > 0)
        .map((s) => ({ name: s.name, value: Number(s.value) }))
        .sort((a, b) => b.value - a.value),
    [slices],
  );
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent>
        <div className="grid items-center gap-4 sm:grid-cols-2">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatBRL(Number(value))}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "0.5rem",
                    color: "var(--color-popover-foreground)",
                    fontSize: "0.8rem",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-2">
            {data.map((entry, index) => (
              <li key={entry.name} className="flex items-center gap-2 text-sm">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <span className="flex-1 truncate">{entry.name}</span>
                <span className="font-medium">{formatBRL(entry.value)}</span>
                <span className="w-12 text-right text-xs text-muted-foreground">
                  {total > 0 ? `${((entry.value / total) * 100).toFixed(1)}%` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
