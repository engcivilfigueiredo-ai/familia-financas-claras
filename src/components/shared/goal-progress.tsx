import { cn } from "@/lib/utils";

interface GoalProgressProps {
  /** Progresso já realizado, de 0 a 100. */
  value: number;
  /** Quanto a barra chegaria somando o saldo em contrato (faixa cinza clara atrás). */
  potential?: number | null;
  className?: string;
}

const clamp = (n: number) => Math.min(Math.max(Number.isFinite(n) ? n : 0, 0), 100);

/**
 * Barra de progresso da meta. Quando há `potential` maior que `value`, uma faixa cinza clara
 * aparece atrás: é o que ainda falta receber de contratos já assinados.
 */
export function GoalProgress({ value, potential, className }: GoalProgressProps) {
  const done = clamp(value);
  const ahead = potential != null ? clamp(potential) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(done)}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/20", className)}
    >
      {ahead > done ? (
        <div
          className="absolute inset-y-0 left-0 bg-muted-foreground/30 transition-all"
          style={{ width: `${ahead}%` }}
        />
      ) : null}
      <div
        className="absolute inset-y-0 left-0 bg-primary transition-all"
        style={{ width: `${done}%` }}
      />
    </div>
  );
}
