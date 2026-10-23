import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { syncLiabilitySchedule } from "@/lib/liabilities";

/**
 * Ao abrir o app (uma vez por login), completa as parcelas das dívidas dos próximos 12
 * meses em Contas a pagar. Se o banco ainda não tem a atualização, ignora em silêncio.
 */
export function useLiabilitySchedule(userId: string | undefined) {
  const qc = useQueryClient();
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || ranFor.current === userId) return;
    ranFor.current = userId;
    syncLiabilitySchedule()
      .then((changed) => {
        if (changed > 0) {
          for (const key of ["transactions", "liabilities"]) {
            void qc.invalidateQueries({ queryKey: [key] });
          }
        }
      })
      .catch(() => {
        /* migração pendente ou sem conexão: tenta de novo no próximo acesso */
      });
  }, [userId, qc]);
}
