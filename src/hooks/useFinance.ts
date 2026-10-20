import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchAllRows } from "@/lib/pagination";

export type TableName =
  | "family_members"
  | "accounts"
  | "credit_cards"
  | "categories"
  | "transactions"
  | "recurring_transactions"
  | "installments"
  | "invoices"
  | "investments"
  | "investment_transactions"
  | "assets"
  | "liabilities"
  | "budgets"
  | "financial_goals"
  | "notifications"
  | "projects";

const ORDER: Partial<Record<TableName, { column: string; ascending: boolean }>> = {
  transactions: { column: "date", ascending: false },
  categories: { column: "sort_order", ascending: true },
  family_members: { column: "created_at", ascending: true },
  accounts: { column: "created_at", ascending: true },
  credit_cards: { column: "created_at", ascending: true },
  investments: { column: "created_at", ascending: true },
  investment_transactions: { column: "date", ascending: false },
  assets: { column: "created_at", ascending: true },
  liabilities: { column: "created_at", ascending: true },
  budgets: { column: "month_reference", ascending: false },
  financial_goals: { column: "target_date", ascending: true },
  recurring_transactions: { column: "start_date", ascending: false },
  notifications: { column: "created_at", ascending: false },
  projects: { column: "project_number", ascending: true },
};

/**
 * Lê todas as linhas de uma tabela. O Supabase corta em 1.000 linhas por consulta e, sem a
 * paginação, saldos e relatórios (somados no navegador) ficariam errados em silêncio depois do
 * 1.000º lançamento.
 */
export async function fetchTable<T = Record<string, unknown>>(table: TableName): Promise<T[]> {
  const order = ORDER[table];
  return fetchAllRows<T>(async (from, to) => {
    const base = supabase.from(table);
    let query = from === 0 ? base.select("*", { count: "exact" }) : base.select("*");
    if (order) query = query.order(order.column, { ascending: order.ascending });
    // Desempate por id: sem ele, linhas com a mesma data podem repetir ou sumir entre páginas.
    const { data, error, count } = await query.order("id", { ascending: true }).range(from, to);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as T[], total: count ?? null };
  });
}

export function useTable<T = Record<string, unknown>>(table: TableName) {
  return useQuery({
    queryKey: [table],
    queryFn: () => fetchTable<T>(table),
  });
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sessão expirada. Faça login novamente.");
  return data.user.id;
}

export function useInvalidateFinance() {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      "transactions",
      "accounts",
      "credit_cards",
      "categories",
      "family_members",
      "investments",
      "investment_transactions",
      "installments",
      "invoices",
      "assets",
      "liabilities",
      "budgets",
      "financial_goals",
      "recurring_transactions",
      "notifications",
      "projects",
    ]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useUpsert(table: TableName, successMessage = "Salvo com sucesso") {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown> & { id?: string }) => {
      const user_id = await currentUserId();
      const body = { ...payload, user_id };
      // Generic table writer: the row shape is validated by each form.
      const client = supabase.from(table) as unknown as {
        update: (b: unknown) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
        insert: (b: unknown) => Promise<{ error: { message: string } | null }>;
      };
      if (payload.id) {
        const { error } = await client.update(body).eq("id", payload.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await client.insert(body);
        if (error) throw new Error(error.message);
      }
    },

    onSuccess: () => {
      invalidate();
      toast.success(successMessage);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRemove(table: TableName, successMessage = "Excluído com sucesso") {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      toast.success(successMessage);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export { currentUserId };
