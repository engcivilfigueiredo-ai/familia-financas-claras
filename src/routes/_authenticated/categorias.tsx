import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { Tx } from "@/lib/finance";
import { formatBRL } from "@/lib/format";

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

interface CategoryRow {
  id: string;
  name: string;
  type: string;
  color: string;
  parent_id: string | null;
  sort_order: number;
}

const NONE = "__none__";

const emptyForm = {
  id: "",
  name: "",
  type: "despesa",
  color: "#6366f1",
  parent_id: NONE,
  sort_order: "0",
};

function CategoriasPage() {
  const categories = useTable<CategoryRow>("categories");
  const transactions = useTable<Tx>("transactions");
  const upsert = useUpsert("categories", "Categoria salva");
  const remove = useRemove("categories", "Categoria excluída");

  const [tab, setTab] = useState("despesa");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const all = categories.data ?? [];
  const rows = useMemo(() => all.filter((c) => c.type === tab), [all, tab]);
  const nameById = useMemo(() => new Map(all.map((c) => [c.id, c.name])), [all]);

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions.data ?? []) {
      if (!t.category_id) continue;
      map.set(t.category_id, (map.get(t.category_id) ?? 0) + Number(t.amount));
    }
    return map;
  }, [transactions.data]);

  function openNew() {
    setForm({ ...emptyForm, type: tab });
    setOpen(true);
  }

  function openEdit(row: CategoryRow) {
    setForm({
      id: row.id,
      name: row.name,
      type: row.type,
      color: row.color,
      parent_id: row.parent_id ?? NONE,
      sort_order: String(row.sort_order ?? 0),
    });
    setOpen(true);
  }

  function save() {
    if (!form.name.trim()) return;
    upsert.mutate(
      {
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        type: form.type,
        color: form.color,
        parent_id: form.parent_id === NONE ? null : form.parent_id,
        sort_order: Number(form.sort_order) || 0,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorias"
        description="Organize as categorias de receitas e despesas usadas em todos os lançamentos."
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Nova categoria
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="despesa">Despesas</TabsTrigger>
          <TabsTrigger value="receita">Receitas</TabsTrigger>
        </TabsList>
      </Tabs>

      {categories.isLoading ? (
        <LoadingState rows={5} />
      ) : categories.isError ? (
        <ErrorState
          message={(categories.error as Error)?.message}
          onRetry={() => categories.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria"
          description="Crie categorias para classificar seus lançamentos."
          action={
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Nova categoria
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <Card key={row.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: row.color }}
                  >
                    <Tag className="h-4 w-4" />
                  </span>
                  <div>
                    <CardTitle className="text-base">{row.name}</CardTitle>
                    {row.parent_id ? (
                      <p className="text-xs text-muted-foreground">
                        Sub de {nameById.get(row.parent_id) ?? "-"}
                      </p>
                    ) : null}
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
                    description="Categorias usadas em lançamentos não podem ser excluídas."
                    onConfirm={() => remove.mutate(row.id)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Badge variant="outline">
                  Movimentado: {formatBRL(totals.get(row.id) ?? 0)}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="cat-name">Nome</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Mercado"
              />
            </div>
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="receita">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Categoria pai</Label>
              <Select
                value={form.parent_id}
                onValueChange={(v) => setForm({ ...form, parent_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma</SelectItem>
                  {all
                    .filter((c) => c.type === form.type && c.id !== form.id && !c.parent_id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-color">Cor</Label>
              <Input
                id="cat-color"
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-order">Ordem</Label>
              <Input
                id="cat-order"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                inputMode="numeric"
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
