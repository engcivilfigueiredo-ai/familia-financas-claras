import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/shared/states";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { useRemove, useTable, useUpsert } from "@/hooks/useFinance";
import { accountBalance, type AccountRow, type Tx } from "@/lib/finance";
import { formatBRL } from "@/lib/format";

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

interface MemberRow {
  id: string;
  name: string;
  color: string;
  relationship: string | null;
  is_active: boolean;
}

const emptyForm = {
  id: "",
  name: "",
  relationship: "",
  color: "#22c55e",
  is_active: true,
};

function FamiliaPage() {
  const members = useTable<MemberRow>("family_members");
  const accounts = useTable<AccountRow>("accounts");
  const transactions = useTable<Tx>("transactions");
  const upsert = useUpsert("family_members", "Membro salvo");
  const remove = useRemove("family_members", "Membro excluído");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const stats = useMemo(() => {
    const map = new Map<string, { balance: number; income: number; expense: number }>();
    for (const m of members.data ?? []) {
      const balance = (accounts.data ?? [])
        .filter((a) => a.family_member_id === m.id && a.is_active)
        .reduce((s, a) => s + accountBalance(a, transactions.data ?? []), 0);
      const mine = (transactions.data ?? []).filter((t) => t.family_member_id === m.id);
      map.set(m.id, {
        balance,
        income: mine.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0),
        expense: mine.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0),
      });
    }
    return map;
  }, [members.data, accounts.data, transactions.data]);

  function openNew() {
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row: MemberRow) {
    setForm({
      id: row.id,
      name: row.name,
      relationship: row.relationship ?? "",
      color: row.color,
      is_active: row.is_active,
    });
    setOpen(true);
  }

  function save() {
    if (!form.name.trim()) return;
    upsert.mutate(
      {
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        relationship: form.relationship.trim() || null,
        color: form.color,
        is_active: form.is_active,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Família"
        description="Cada pessoa pode ter contas, cartões e lançamentos próprios, usados no filtro do topo."
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Novo membro
          </Button>
        }
      />

      {members.isLoading ? (
        <LoadingState rows={3} />
      ) : members.isError ? (
        <ErrorState message={(members.error as Error)?.message} onRetry={() => members.refetch()} />
      ) : (members.data ?? []).length === 0 ? (
        <EmptyState
          title="Nenhum membro cadastrado"
          description="Cadastre as pessoas da família para separar as finanças."
          action={
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Novo membro
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(members.data ?? []).map((row) => {
            const s = stats.get(row.id);
            return (
              <Card key={row.id} className={row.is_active ? "" : "opacity-60"}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: row.color }}
                    >
                      <Users className="h-4 w-4" />
                    </span>
                    <div>
                      <CardTitle className="text-base">{row.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {row.relationship || "Sem parentesco informado"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <ConfirmDelete
                      trigger={
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      }
                      description="Registros vinculados podem impedir a exclusão. Você pode inativar o membro."
                      onConfirm={() => remove.mutate(row.id)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-2xl font-semibold">{formatBRL(s?.balance ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">
                    Receitas {formatBRL(s?.income ?? 0)} · Despesas {formatBRL(s?.expense ?? 0)}
                  </p>
                  {row.is_active ? null : <Badge variant="secondary">Inativo</Badge>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar membro" : "Novo membro"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="fam-name">Nome</Label>
              <Input
                id="fam-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fam-rel">Parentesco</Label>
              <Input
                id="fam-rel"
                value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                placeholder="Cônjuge, filho(a)..."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fam-color">Cor</Label>
              <Input
                id="fam-color"
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="fam-active">Ativo</Label>
              <Switch
                id="fam-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={upsert.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
