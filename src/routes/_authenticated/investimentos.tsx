import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/shared/states";

export const Route = createFileRoute("/_authenticated/investimentos")({
  head: () => ({
    meta: [
      { title: "Investimentos | Controle Financeiro Família" },
      { name: "description", content: "Carteira de investimentos, aportes, resgates e rendimentos." },
      { property: "og:title", content: "Investimentos | Controle Financeiro Família" },
      { property: "og:description", content: "Carteira de investimentos, aportes, resgates e rendimentos." },
    ],
  }),
  component: InvestimentosPage,
});

function InvestimentosPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Investimentos" description="Carteira de investimentos, aportes, resgates e rendimentos." />
      <EmptyState
        title="Em construção"
        description="Esta página será implementada em breve."
      />
    </div>
  );
}
