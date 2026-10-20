import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/states";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useScope } from "@/hooks/useScope";
import { useTable } from "@/hooks/useFinance";

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

interface ProfileRow {
  id: string;
  full_name: string | null;
  currency: string;
}

interface Named {
  id: string;
  name: string;
}

function ConfiguracoesPage() {
  const { user, signOut } = useAuth();
  const scope = useScope();
  const members = useTable<Named>("family_members");
  const qc = useQueryClient();

  const profile = useQuery({
    queryKey: ["profiles", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ProfileRow | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, currency")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as ProfileRow | null;
    },
  });

  const [fullName, setFullName] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (!profile.data) return;
    setFullName(profile.data.full_name ?? "");
    setCurrency(profile.data.currency ?? "BRL");
  }, [profile.data]);

  useEffect(() => {
    const stored = window.localStorage.getItem("cff:theme");
    const initial = stored === "dark" ? "dark" : "light";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("cff:theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Sessão expirada.");
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, full_name: fullName.trim() || null, currency });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPassword = useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error("E-mail indisponível.");
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => toast.success("Enviamos um e-mail para redefinir sua senha."),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Preferências do aplicativo e dados da conta." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perfil</CardTitle>
            <CardDescription>Dados exibidos no aplicativo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="cfg-email">E-mail</Label>
              <Input id="cfg-email" value={user?.email ?? ""} readOnly disabled />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cfg-name">Nome completo</Label>
              <Input
                id="cfg-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>
            <div className="grid gap-2">
              <Label>Moeda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">Real (R$)</SelectItem>
                  <SelectItem value="USD">Dólar (US$)</SelectItem>
                  <SelectItem value="EUR">Euro (€)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
              Salvar perfil
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferências</CardTitle>
            <CardDescription>Visualização e escopo padrão.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Tema</p>
                <p className="text-xs text-muted-foreground">
                  {theme === "dark" ? "Escuro" : "Claro"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={toggleTheme}>
                {theme === "dark" ? (
                  <Sun className="mr-2 h-4 w-4" />
                ) : (
                  <Moon className="mr-2 h-4 w-4" />
                )}
                Alternar
              </Button>
            </div>
            <Separator />
            <div className="grid gap-2">
              <Label>Visão padrão</Label>
              <Select
                value={scope.view}
                onValueChange={(v) => scope.setView(v === "mine" ? "mine" : "family")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="family">Finanças da família</SelectItem>
                  <SelectItem value="mine">Minhas finanças</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Pessoa vinculada a mim</Label>
              <Select
                value={scope.memberId ?? ""}
                onValueChange={(v) => scope.setMemberId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(members.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Segurança</CardTitle>
            <CardDescription>Acesso à sua conta.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => resetPassword.mutate()}
              disabled={resetPassword.isPending}
            >
              Redefinir senha
            </Button>
            <Button variant="destructive" onClick={() => void signOut()}>
              <LogOut className="mr-2 h-4 w-4" /> Sair da conta
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
