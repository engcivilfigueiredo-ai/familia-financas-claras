import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/shared/states";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios | Controle Financeiro Família" },
      { name: "description", content: "Análises de receitas, despesas e evolução financeira." },
      { property: "og:title", content: "Relatórios | Controle Financeiro Família" },
      { property: "og:description", content: "Análises de receitas, despesas e evolução financeira." },
    ],
  }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" description="Análises de receitas, despesas e evolução financeira." />
      <EmptyState
        title="Em construção"
        description="Esta página será implementada em breve."
      />
    </div>
  );
}
