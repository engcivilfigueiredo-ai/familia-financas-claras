import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/shared/states";

export const Route = createFileRoute("/_authenticated/orcamento")({
  head: () => ({
    meta: [
      { title: "Orçamento | Controle Financeiro Família" },
      { name: "description", content: "Defina limites de gastos por categoria e acompanhe o consumo." },
      { property: "og:title", content: "Orçamento | Controle Financeiro Família" },
      { property: "og:description", content: "Defina limites de gastos por categoria e acompanhe o consumo." },
    ],
  }),
  component: OrcamentoPage,
});

function OrcamentoPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Orçamento" description="Defina limites de gastos por categoria e acompanhe o consumo." />
      <EmptyState
        title="Em construção"
        description="Esta página será implementada em breve."
      />
    </div>
  );
}
