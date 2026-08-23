import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/shared/states";

export const Route = createFileRoute("/_authenticated/categorias")({
  head: () => ({
    meta: [
      { title: "Categorias | Controle Financeiro Família" },
      { name: "description", content: "Organize as categorias de receitas e despesas." },
      { property: "og:title", content: "Categorias | Controle Financeiro Família" },
      { property: "og:description", content: "Organize as categorias de receitas e despesas." },
    ],
  }),
  component: CategoriasPage,
});

function CategoriasPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Categorias" description="Organize as categorias de receitas e despesas." />
      <EmptyState
        title="Em construção"
        description="Esta página será implementada em breve."
      />
    </div>
  );
}
