import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/shared/states";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { useRemove, useTable, useUpsert } from "@/hooks/useFinance";
import { useScope } from "@/hooks/useScope";
import { ACCOUNT_TYPES, accountBalance, type AccountRow, type Tx } from "@/lib/finance";
import { formatBRL, parseCurrencyInput } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/contas")({
  head: () => ({
    meta: [
      { title: "Contas | Controle Financeiro Família" },
      {
        name: "description",
        content: "Cadastre contas correntes, poupanças, carteiras e acompanhe o saldo atual de cada uma.",
      },
      { property: "og:title", content: "Contas | Controle Financeiro Família" },
      {
        property: "og:description",
        content: "Saldos e cadastro das contas bancárias e carteiras da família.",
      },
    ],
  }),
  component: AccountsPage,
});

interface Member {
  id: string;
  name: string;
  is_active: boolean;
}

const NONE = "__none__";

const emptyForm = {
  id: "",
  name: "",
  institution: "",
  type: "corrente",
  initial_balance: "",
  family_member_id: NONE,
  color: "#0ea5e9",
  is_active: true,
};

function AccountsPage() {
  const scope = useScope();
  const accounts = useTable<AccountRow>("accounts");
  const transactions = useTable<Tx>("transactions");
  const members = useTable<Member>("family_members");
  const upsert = useUpsert("accounts", "Conta salva");
  const remove = useRemove("accounts", "Conta excluída");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const rows = useMemo(
    () =>
      (accounts.data ?? [])
        .filter((a) => scope.matches(a.family_member_id))
        .map((a) => ({ ...a, balance: accountBalance(a, transactions.data ?? []) })),
    [accounts.data, transactions.data, scope],
  );

  const total = rows.filter((r) => r.is_active).reduce((s, r) => s + r.balance, 0);
  const memberName = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.id, m.name])),
    [members.data],
  );

  function openNew() {
    setForm({ ...emptyForm, family_member_id: scope.memberId ?? NONE });
    setOpen(true);
  }

  function openEdit(row: AccountRow) {
    setForm({
      id: row.id,
      name: row.name,
      institution: row.institution ?? "",
      type: row.type,
      initial_balance: String(row.initial_balance ?? ""),
      family_member_id: row.family_member_id ?? NONE,
      color: row.color,
      is_active: row.is_active,
    });
    setOpen(true);
  }

  function save() {
    if (!form.name.trim()) return;
    const initial = parseCurrencyInput(form.initial_balance || "0");
    upsert.mutate(
      {
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        institution: form.institution.trim() || null,
        type: form.type,
        initial_balance: initial,
        current_balance: initial,
        currency: "BRL",
        color: form.color,
        is_active: form.is_active,
        family_member_id: form.family_member_id === NONE ? null : form.family_member_id,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas"
        description={`Saldo total ativo: ${formatBRL(total)}`}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Nova conta
          </Button>
        }
      />

      {accounts.isLoading ? (
        <LoadingState rows={4} />
      ) : accounts.isError ? (
        <ErrorState message={(accounts.error as Error)?.message} onRetry={() => accounts.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhuma conta cadastrada"
          description="Cadastre suas contas para acompanhar os saldos."
          action={
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Nova conta
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Card key={row.id} className={row.is_active ? "" : "opacity-60"}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: row.color }}
                  >
                    <Wallet className="h-4 w-4" />
                  </span>
                  <div>
                    <CardTitle className="text-base">{row.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {row.institution || "Sem instituição"} ·{" "}
                      {row.type}
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
                    description="Lançamentos vinculados podem impedir a exclusão. Você pode inativar a conta."
                    onConfirm={() => remove.mutate(row.id)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-2xl font-semibold">{formatBRL(row.balance)}</p>
                <div className="flex flex-wrap gap-2">
                  {row.family_member_id ? (
                    <Badge variant="outline">{memberName.get(row.family_member_id)}</Badge>
                  ) : (
                    <Badge variant="outline">Família</Badge>
                  )}
                  {row.is_active ? null : <Badge variant="secondary">Inativa</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar conta" : "Nova conta"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="acc-name">Nome</Label>
              <Input
                id="acc-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Conta corrente Itaú"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acc-inst">Instituição</Label>
              <Input
                id="acc-inst"
                value={form.institution}
                onChange={(e) => setForm({ ...form, institution: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acc-balance">Saldo inicial</Label>
              <Input
                id="acc-balance"
                value={form.initial_balance}
                onChange={(e) => setForm({ ...form, initial_balance: e.target.value })}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div className="grid gap-2">
              <Label>Pessoa</Label>
              <Select
                value={form.family_member_id}
                onValueChange={(v) => setForm({ ...form, family_member_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Família" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Família (compartilhada)</SelectItem>
                  {(members.data ?? [])
                    .filter((m) => m.is_active)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acc-color">Cor</Label>
              <Input
                id="acc-color"
                type="color"
                className="h-10 w-20 p-1"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch
                id="acc-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label htmlFor="acc-active">Conta ativa</Label>
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
