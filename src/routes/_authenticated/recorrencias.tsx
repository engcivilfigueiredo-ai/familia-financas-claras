import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/shared/states";

export const Route = createFileRoute("/_authenticated/recorrencias")({
  head: () => ({
    meta: [
      { title: "Recorrências | Controle Financeiro Família" },
      { name: "description", content: "Gerencie lançamentos fixos e repetidos automaticamente." },
      { property: "og:title", content: "Recorrências | Controle Financeiro Família" },
      { property: "og:description", content: "Gerencie lançamentos fixos e repetidos automaticamente." },
    ],
  }),
  component: RecorrenciasPage,
});

function RecorrenciasPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Recorrências" description="Gerencie lançamentos fixos e repetidos automaticamente." />
      <EmptyState
        title="Em construção"
        description="Esta página será implementada em breve."
      />
    </div>
  );
}
