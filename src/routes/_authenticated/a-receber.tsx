import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/shared/states";

export const Route = createFileRoute("/_authenticated/a-receber")({
  head: () => ({
    meta: [
      { title: "A receber | Controle Financeiro Família" },
      { name: "description", content: "Acompanhe as receitas previstas e ainda não recebidas." },
      { property: "og:title", content: "A receber | Controle Financeiro Família" },
      { property: "og:description", content: "Acompanhe as receitas previstas e ainda não recebidas." },
    ],
  }),
  component: AReceberPage,
});

function AReceberPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Contas a receber" description="Acompanhe as receitas previstas e ainda não recebidas." />
      <EmptyState
        title="Em construção"
        description="Esta página será implementada em breve."
      />
    </div>
  );
}
