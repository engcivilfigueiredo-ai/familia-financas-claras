import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/shared/states";

export const Route = createFileRoute("/_authenticated/metas")({
  head: () => ({
    meta: [
      { title: "Metas | Controle Financeiro Família" },
      { name: "description", content: "Crie metas de economia e acompanhe o progresso." },
      { property: "og:title", content: "Metas | Controle Financeiro Família" },
      { property: "og:description", content: "Crie metas de economia e acompanhe o progresso." },
    ],
  }),
  component: MetasPage,
});

function MetasPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Metas financeiras" description="Crie metas de economia e acompanhe o progresso." />
      <EmptyState
        title="Em construção"
        description="Esta página será implementada em breve."
      />
    </div>
  );
}
