import { createFileRoute } from "@tanstack/react-router";
import { PendingList } from "@/components/shared/pending-list";

export const Route = createFileRoute("/_authenticated/a-pagar")({
  head: () => ({
    meta: [
      { title: "A pagar | Controle Financeiro Família" },
      { name: "description", content: "Acompanhe as despesas pendentes e suas datas de vencimento." },
      { property: "og:title", content: "A pagar | Controle Financeiro Família" },
      { property: "og:description", content: "Acompanhe as despesas pendentes e suas datas de vencimento." },
    ],
  }),
  component: APagarPage,
});

function APagarPage() {
  return (
    <PendingList
      kind="despesa"
      title="Contas a pagar"
      description="Despesas pendentes ordenadas por vencimento. Marque como pago para atualizar os saldos."
    />
  );
}
