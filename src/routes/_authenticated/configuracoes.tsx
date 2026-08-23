import { createFileRoute } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/shared/states";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações | Controle Financeiro Família" },
      { name: "description", content: "Preferências do aplicativo e dados da conta." },
      { property: "og:title", content: "Configurações | Controle Financeiro Família" },
      { property: "og:description", content: "Preferências do aplicativo e dados da conta." },
    ],
  }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Preferências do aplicativo e dados da conta." />
      <EmptyState
        title="Em construção"
        description="Esta página será implementada em breve."
      />
    </div>
  );
}
