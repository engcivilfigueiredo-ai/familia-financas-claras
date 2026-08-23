import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/shared/states";

export const Route = createFileRoute("/_authenticated/patrimonio")({
  head: () => ({
    meta: [
      { title: "Patrimônio | Controle Financeiro Família" },
      { name: "description", content: "Bens, dívidas e cálculo do patrimônio líquido da família." },
      { property: "og:title", content: "Patrimônio | Controle Financeiro Família" },
      { property: "og:description", content: "Bens, dívidas e cálculo do patrimônio líquido da família." },
    ],
  }),
  component: PatrimonioPage,
});

function PatrimonioPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Patrimônio" description="Bens, dívidas e cálculo do patrimônio líquido da família." />
      <EmptyState
        title="Em construção"
        description="Esta página será implementada em breve."
      />
    </div>
  );
}
