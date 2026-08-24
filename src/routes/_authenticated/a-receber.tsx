import { createFileRoute } from "@tanstack/react-router";
import { PendingList } from "@/components/shared/pending-list";

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
    <PendingList
      kind="receita"
      title="Contas a receber"
      description="Receitas previstas ainda não recebidas. Marque como recebido para atualizar os saldos."
    />
  );
}
