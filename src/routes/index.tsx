import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Controle Financeiro Família | Finanças da sua casa" },
      {
        name: "description",
        content:
          "Acompanhe receitas, despesas, cartões, investimentos, metas e patrimônio de toda a família em um só painel.",
      },
      { property: "og:title", content: "Controle Financeiro Família" },
      {
        property: "og:description",
        content: "Painel completo para as finanças pessoais e familiares.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? "/dashboard" : "/auth", replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Carregando seu painel financeiro...</p>
    </div>
  );
}
