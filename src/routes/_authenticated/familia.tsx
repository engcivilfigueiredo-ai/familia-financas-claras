import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/shared/states";

export const Route = createFileRoute("/_authenticated/familia")({
  head: () => ({
    meta: [
      { title: "Família | Controle Financeiro Família" },
      { name: "description", content: "Gerencie os membros da família e seus escopos financeiros." },
      { property: "og:title", content: "Família | Controle Financeiro Família" },
      { property: "og:description", content: "Gerencie os membros da família e seus escopos financeiros." },
    ],
  }),
  component: FamiliaPage,
});

function FamiliaPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Família" description="Gerencie os membros da família e seus escopos financeiros." />
      <EmptyState
        title="Em construção"
        description="Esta página será implementada em breve."
      />
    </div>
  );
}
