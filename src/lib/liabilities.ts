import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { failRpc } from "./transactions";

/**
 * Mantém as parcelas das dívidas (janela dos próximos 12 meses) em Contas a pagar.
 * É idempotente: rodar de novo não duplica nada. Devolve quantas parcelas foram
 * criadas, atualizadas ou removidas.
 */
export async function syncLiabilitySchedule(horizonMonths = 12): Promise<number> {
  const { data, error } = await supabase.rpc("sync_liability_schedule", {
    p_horizon_months: horizonMonths,
  });
  failRpc(error);
  return Number(data ?? 0);
}

export interface ContemplationInput {
  liability_id: string;
  /** Data em que o consórcio foi contemplado (não pode ser futura). */
  date: string;
  /** Novo valor da parcela, a partir da data. */
  new_payment: number;
  /** Parcelas restantes após a contemplação (opcional: mantém o prazo atual). */
  installments_left?: number | null;
  /** Saldo devedor após a contemplação (opcional: mantém o atual). */
  remaining_amount?: number | null;
}

/** Registra a contemplação e atualiza as parcelas ainda não pagas. Devolve quantas mudaram. */
export async function registerContemplation(input: ContemplationInput): Promise<number> {
  type Args = Database["public"]["Functions"]["register_liability_contemplation"]["Args"];
  const args: Args = {
    p_liability_id: input.liability_id,
    p_date: input.date,
    p_new_payment: input.new_payment,
    ...(input.installments_left != null ? { p_installments_left: input.installments_left } : {}),
    ...(input.remaining_amount != null ? { p_remaining_amount: input.remaining_amount } : {}),
  };
  const { data, error } = await supabase.rpc("register_liability_contemplation", args);
  failRpc(error);
  return Number(data ?? 0);
}
