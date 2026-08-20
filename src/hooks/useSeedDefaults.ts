import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidateFinance } from "./useFinance";

const DEFAULT_EXPENSES = [
  "Alimentação",
  "Moradia",
  "Transporte",
  "Saúde",
  "Educação",
  "Lazer",
  "Compras",
  "Assinaturas",
  "Impostos",
  "Seguros",
  "Viagens",
  "Pets",
  "Outros",
];

const DEFAULT_INCOMES = [
  "Salário",
  "Freelance",
  "Negócios",
  "Rendimentos",
  "Dividendos",
  "Aluguéis",
  "Outros",
];

/**
 * On first access, creates the default categories, the profile row and the
 * initial family member for the account owner.
 */
export function useSeedDefaults(userId: string | undefined, userName: string | undefined) {
  const invalidate = useInvalidateFinance();
  const ran = useRef(false);

  useEffect(() => {
    if (!userId || ran.current) return;
    ran.current = true;

    (async () => {
      let changed = false;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();
      if (!profile) {
        await supabase.from("profiles").insert({ id: userId, full_name: userName ?? null });
        changed = true;
      }

      const { data: members } = await supabase.from("family_members").select("id").limit(1);
      if (!members?.length) {
        await supabase.from("family_members").insert({
          user_id: userId,
          name: userName ?? "Eu",
          relationship: "titular",
          color: "#0ea5e9",
        });
        changed = true;
      }

      const { data: cats } = await supabase.from("categories").select("id").limit(1);
      if (!cats?.length) {
        const rows = [
          ...DEFAULT_EXPENSES.map((name, i) => ({
            user_id: userId,
            name,
            type: "despesa",
            sort_order: i + 1,
          })),
          ...DEFAULT_INCOMES.map((name, i) => ({
            user_id: userId,
            name,
            type: "receita",
            sort_order: i + 1,
          })),
        ];
        await supabase.from("categories").insert(rows);
        changed = true;
      }

      if (changed) invalidate();
    })();
  }, [userId, userName, invalidate]);
}
