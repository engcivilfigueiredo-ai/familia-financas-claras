import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/shared/states";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { useRemove, useTable, useUpsert } from "@/hooks/useFinance";
import { useScope } from "@/hooks/useScope";
import {
  cardInvoiceMonths,
  cardInvoiceTotal,
  cardOutstanding,
  invoiceDueDate,
  type CardRow,
  type Tx,
} from "@/lib/finance";
import { formatBRL, formatDateBR, formatMonthBR, parseCurrencyInput } from "@/lib/format";
import { nextInvoiceMonthFromToday } from "@/lib/transactions";

export const Route = createFileRoute("/_authenticated/cartoes")({
  head: () => ({
    meta: [
      { title: "Cartões de crédito | Controle Financeiro Família" },
      {
        name: "description",
        content:
          "Gerencie cartões, limites, fechamento e vencimento das faturas, com detalhamento das compras do mês.",
      },
      { property: "og:title", content: "Cartões de crédito | Controle Financeiro Família" },
      {
        property: "og:description",
        content: "Faturas, limites e compras parceladas dos cartões da família.",
      },
    ],
  }),
  component: CardsPage,
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
  brand: "",
  credit_limit: "",
  closing_day: "5",
  due_day: "12",
  family_member_id: NONE,
  color: "#7c3aed",
  is_active: true,
};

function CardsPage() {
  const scope = useScope();
  const cards = useTable<CardRow>("credit_cards");
  const transactions = useTable<Tx>("transactions");
  const members = useTable<Member>("family_members");
  const categories = useTable<{ id: string; name: string }>("categories");
  const upsert = useUpsert("credit_cards", "Cartão salvo");
  const remove = useRemove("credit_cards", "Cartão excluído");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [invoiceMonth, setInvoiceMonth] = useState<string>(() => nextInvoiceMonthFromToday(1));

  const txs = transactions.data ?? [];
  const rows = useMemo(
    () =>
      (cards.data ?? [])
        .filter((c) => scope.matches(c.family_member_id))
        .map((c) => {
          const outstanding = cardOutstanding(c.id, txs);
          return {
            ...c,
            outstanding,
            available: Math.max(Number(c.credit_limit) - outstanding, 0),
            usage: Math.min((outstanding / (Number(c.credit_limit) || 1)) * 100, 100),
          };
        }),
    [cards.data, txs, scope],
  );

  const activeCard = useMemo(
    () => rows.find((r) => r.id === (selectedCard ?? rows[0]?.id)) ?? null,
    [rows, selectedCard],
  );

  const months = useMemo(
    () => (activeCard ? cardInvoiceMonths(activeCard.id, txs) : []),
    [activeCard, txs],
  );

  const currentMonth = months.includes(invoiceMonth) ? invoiceMonth : (months.at(-1) ?? invoiceMonth);

  const invoiceRows = useMemo(
    () =>
      activeCard
        ? txs.filter((t) => t.credit_card_id === activeCard.id && t.invoice_month === currentMonth)
        : [],
    [activeCard, txs, currentMonth],
  );

  const categoryName = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c.name])),
    [categories.data],
  );
  const memberName = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.id, m.name])),
    [members.data],
  );

  function openNew() {
    setForm({ ...emptyForm, family_member_id: scope.memberId ?? NONE });
    setOpen(true);
  }

  function openEdit(row: CardRow) {
    setForm({
      id: row.id,
      name: row.name,
      institution: row.institution ?? "",
      brand: row.brand ?? "",
      credit_limit: String(row.credit_limit ?? ""),
      closing_day: String(row.closing_day),
      due_day: String(row.due_day),
      family_member_id: row.family_member_id ?? NONE,
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
        institution: form.institution.trim() || null,
        brand: form.brand.trim() || null,
        credit_limit: parseCurrencyInput(form.credit_limit || "0"),
        closing_day: Math.min(Math.max(Number(form.closing_day) || 1, 1), 28),
        due_day: Math.min(Math.max(Number(form.due_day) || 1, 1), 28),
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
        title="Cartões de crédito"
        description="Limites, faturas e compras parceladas"
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Novo cartão
          </Button>
        }
      />

      {cards.isLoading ? (
        <LoadingState rows={3} />
      ) : cards.isError ? (
        <ErrorState message={(cards.error as Error)?.message} onRetry={() => cards.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhum cartão cadastrado"
          description="Cadastre um cartão para lançar compras e acompanhar faturas."
          action={
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Novo cartão
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <Card
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedCard(row.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSelectedCard(row.id);
                }}
                className={`cursor-pointer transition-shadow hover:shadow-md ${
                  activeCard?.id === row.id ? "ring-2 ring-ring" : ""
                } ${row.is_active ? "" : "opacity-60"}`}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: row.color }}
                    >
                      <CreditCard className="h-4 w-4" />
                    </span>
                    <div>
                      <CardTitle className="text-base">{row.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Fecha dia {row.closing_day} · vence dia {row.due_day}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(row);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <ConfirmDelete
                      trigger={
                        <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      }
                      description="Compras vinculadas podem impedir a exclusão. Você pode inativar o cartão."
                      onConfirm={() => remove.mutate(row.id)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Fatura em aberto</p>
                    <p className="text-2xl font-semibold">{formatBRL(row.outstanding)}</p>
                  </div>
                  <Progress value={row.usage} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Disponível {formatBRL(row.available)}</span>
                    <span>Limite {formatBRL(Number(row.credit_limit))}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {row.family_member_id ? memberName.get(row.family_member_id) : "Família"}
                    </Badge>
                    {row.brand ? <Badge variant="secondary">{row.brand}</Badge> : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {activeCard ? (
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Fatura de {activeCard.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Vencimento{" "}
                    {formatDateBR(
                      invoiceDueDate(currentMonth, activeCard.closing_day, activeCard.due_day),
                    )}{" "}
                    · Total {formatBRL(cardInvoiceTotal(activeCard.id, currentMonth, txs))}
                  </p>
                </div>
                <Select value={currentMonth} onValueChange={setInvoiceMonth}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {(months.length ? months : [currentMonth]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {formatMonthBR(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {invoiceRows.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      title="Fatura sem lançamentos"
                      description="Nenhuma compra registrada para este mês de referência."
                    />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceRows.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="whitespace-nowrap">{formatDateBR(t.date)}</TableCell>
                          <TableCell>
                            {t.description}
                            {t.installment_number ? (
                              <Badge variant="outline" className="ml-2">
                                {t.installment_number}ª
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {t.category_id ? categoryName.get(t.category_id) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {t.type === "transferencia" ? "-" : ""}
                            {formatBRL(Math.abs(Number(t.amount)))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar cartão" : "Novo cartão"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="card-name">Nome</Label>
              <Input
                id="card-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nubank Ultravioleta"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="card-inst">Instituição</Label>
              <Input
                id="card-inst"
                value={form.institution}
                onChange={(e) => setForm({ ...form, institution: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="card-brand">Bandeira</Label>
              <Input
                id="card-brand"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="Visa"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="card-limit">Limite</Label>
              <Input
                id="card-limit"
                inputMode="decimal"
                value={form.credit_limit}
                onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
                placeholder="5.000,00"
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
                  <SelectItem value={NONE}>Família (compartilhado)</SelectItem>
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
              <Label htmlFor="card-closing">Dia de fechamento</Label>
              <Input
                id="card-closing"
                type="number"
                min={1}
                max={28}
                value={form.closing_day}
                onChange={(e) => setForm({ ...form, closing_day: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="card-due">Dia de vencimento</Label>
              <Input
                id="card-due"
                type="number"
                min={1}
                max={28}
                value={form.due_day}
                onChange={(e) => setForm({ ...form, due_day: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="card-color">Cor</Label>
              <Input
                id="card-color"
                type="color"
                className="h-10 w-20 p-1"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="card-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label htmlFor="card-active">Cartão ativo</Label>
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
