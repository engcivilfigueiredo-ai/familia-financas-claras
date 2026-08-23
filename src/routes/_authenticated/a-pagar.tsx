import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/shared/states";

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
    <div className="space-y-6">
      <PageHeader title="Contas a pagar" description="Acompanhe as despesas pendentes e suas datas de vencimento." />
      <EmptyState
        title="Em construção"
        description="Esta página será implementada em breve."
      />
    </div>
  );
}
