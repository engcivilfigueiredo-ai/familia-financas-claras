import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, PiggyBank, Plus, RefreshCw, Repeat, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { useInvalidateFinance, useRemove, useTable, useUpsert } from "@/hooks/useFinance";
import { useScope } from "@/hooks/useScope";
import { deleteFutureRecurringOccurrences, materializeRecurring } from "@/lib/transactions";
import { RECURRENCE_FREQUENCIES, recurrenceDate, type Tx } from "@/lib/finance";
import { addMonths, formatBRL, formatDateBR, parseCurrencyInput, todayISO } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/recorrencias")({
  head: () => ({
    meta: [
      { title: "Recorrências | Controle Financeiro Família" },
      { name: "description", content: "Gerencie lançamentos fixos e repetidos automaticamente." },
      { property: "og:title", content: "Recorrências | Controle Financeiro Família" },
      { property: "og:description", content: "Gerencie lançamentos fixos e repetidos automaticamente." },
    ],
  }),
  component: RecorrenciasPage,
});

interface Named {
  id: string;
  name: string;
  type?: string;
  is_active?: boolean;
}

interface RecurringRow {
  id: string;
  description: string;
  amount: number;
  type: string;
  frequency: string;
  start_date: string;
  end_date: string | null;
  category_id: string | null;
  account_id: string | null;
  credit_card_id: string | null;
  family_member_id: string | null;
  is_active: boolean;
  investment_id: string | null;
  is_investment_contribution: boolean;
}

const NONE = "__none__";

const emptyForm = {
  id: "",
  description: "",
  amount: "",
  type: "despesa",
  frequency: "mensal",
  start_date: todayISO(),
  end_date: "",
  category_id: NONE,
  account_id: NONE,
  credit_card_id: NONE,
  family_member_id: NONE,
  is_active: true,
  investment_id: NONE,
  is_investment_contribution: false,
};

function RecorrenciasPage() {
  const scope = useScope();
  const invalidate = useInvalidateFinance();
  const recurring = useTable<RecurringRow>("recurring_transactions");
  const transactions = useTable<Tx>("transactions");
  const accounts = useTable<Named>("accounts");
  const cards = useTable<Named>("credit_cards");
  const categories = useTable<Named>("categories");
  const members = useTable<Named>("family_members");
  const investments = useTable<Named>("investments");
  const upsert = useUpsert("recurring_transactions", "Recorrência salva");
  const remove = useRemove("recurring_transactions", "Recorrência excluída");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [generating, setGenerating] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const rows = useMemo(
    () => (recurring.data ?? []).filter((r) => scope.matches(r.family_member_id)),
    [recurring.data, scope],
  );

  const nameOf = (list: Named[] | undefined, id: string | null) =>
    id ? (list ?? []).find((x) => x.id === id)?.name ?? "-" : "-";

  const monthlyTotal = rows
    .filter((r) => r.is_active && r.frequency === "mensal")
    .reduce((s, r) => s + (r.type === "receita" ? Number(r.amount) : -Number(r.amount)), 0);

  function openNew() {
    setForm({ ...emptyForm, family_member_id: scope.memberId ?? NONE });
    setOpen(true);
  }

  function openEdit(row: RecurringRow) {
    setForm({
      id: row.id,
      description: row.description,
      amount: String(row.amount ?? ""),
      type: row.type,
      frequency: row.frequency,
      start_date: row.start_date,
      end_date: row.end_date ?? "",
      category_id: row.category_id ?? NONE,
      account_id: row.account_id ?? NONE,
      credit_card_id: row.credit_card_id ?? NONE,
      family_member_id: row.family_member_id ?? NONE,
      is_active: row.is_active,
      investment_id: row.investment_id ?? NONE,
      is_investment_contribution: row.is_investment_contribution,
    });
    setOpen(true);
  }

  function save() {
    if (!form.description.trim()) return;
    upsert.mutate(
      {
        ...(form.id ? { id: form.id } : {}),
        description: form.description.trim(),
        amount: parseCurrencyInput(form.amount),
        type: form.type,
        frequency: form.frequency,
        start_date: form.start_date,
        end_date: form.end_date || null,
        category_id: form.category_id === NONE ? null : form.category_id,
        account_id: form.credit_card_id !== NONE || form.account_id === NONE ? null : form.account_id,
        credit_card_id: form.credit_card_id === NONE ? null : form.credit_card_id,
        family_member_id: form.family_member_id === NONE ? null : form.family_member_id,
        is_active: form.is_active,
        investment_id: form.investment_id === NONE ? null : form.investment_id,
        is_investment_contribution: form.is_investment_contribution,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  function occurrences(row: RecurringRow, skip: Set<string>) {
    const horizon = addMonths(todayISO(), 3);
    const dates: string[] = [];
    for (let index = 0; index < 200; index += 1) {
      const date = recurrenceDate(row.start_date, row.frequency, index);
      if (date > horizon) break;
      if (row.end_date && date > row.end_date) break;
      if (!skip.has(date)) dates.push(date);
    }
    return dates;
  }

  /** Rule 7: generate the missing occurrences up to 3 months ahead. */
  async function generate(row: RecurringRow) {
    setGenerating(row.id);
    try {
      const existing = new Set(
        (transactions.data ?? []).filter((t) => t.recurring_id === row.id).map((t) => t.date),
      );
      const dates = occurrences(row, existing);
      if (!dates.length) {
        toast.info("Nenhuma nova ocorrência para gerar.");
        return;
      }
      const created = await materializeRecurring(
        { ...row, investment_name: row.description },
        dates,
      );
      invalidate();
      if (created === 0) toast.info("Nenhum aporte vencido para registrar ainda.");
      else toast.success(`${created} lançamento(s) gerado(s).`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setGenerating(null);
    }
  }

  /** Reaplica os dados atuais da recorrência nos lançamentos futuros pendentes. */
  async function refresh(row: RecurringRow) {
    setRefreshing(row.id);
    try {
      const today = todayISO();
      await deleteFutureRecurringOccurrences(row.id, today);
      const kept = new Set(
        (transactions.data ?? [])
          .filter((t) => t.recurring_id === row.id && !(t.status === "pendente" && t.date >= today))
          .map((t) => t.date),
      );
      const dates = occurrences(row, kept).filter((d) => d >= today);
      const created = dates.length
        ? await materializeRecurring({ ...row, investment_name: row.description }, dates)
        : 0;
      invalidate();
      toast.success(`Recorrência atualizada: ${created} lançamento(s) futuro(s) ajustado(s).`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRefreshing(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recorrências"
        description={`Impacto mensal estimado: ${formatBRL(monthlyTotal)}`}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Nova recorrência
          </Button>
        }
      />

      {recurring.isLoading ? (
        <LoadingState rows={4} />
      ) : recurring.isError ? (
        <ErrorState
          message={(recurring.error as Error)?.message}
          onRetry={() => recurring.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhuma recorrência"
          description="Cadastre salários, aluguéis e assinaturas para gerar lançamentos automaticamente."
          icon={<Repeat className="h-6 w-6" />}
          action={
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Nova recorrência
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Frequência</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className={row.is_active ? "" : "opacity-60"}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {row.is_investment_contribution ? (
                          <PiggyBank className="h-4 w-4 text-chart-2" />
                        ) : null}
                        {row.description}
                      </div>
                      <div className="flex gap-1 pt-1">
                        <Badge variant={row.type === "receita" ? "secondary" : "outline"}>
                          {row.type}
                        </Badge>
                        {row.is_investment_contribution ? (
                          <Badge variant="secondary">Aporte previdência</Badge>
                        ) : null}
                        {row.is_active ? null : <Badge variant="secondary">Inativa</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{row.frequency}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateBR(row.start_date)}
                      {row.end_date ? ` até ${formatDateBR(row.end_date)}` : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.credit_card_id
                        ? nameOf(cards.data, row.credit_card_id)
                        : nameOf(accounts.data, row.account_id)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${row.type === "receita" ? "text-chart-2" : "text-destructive"}`}
                    >
                      {formatBRL(Number(row.amount))}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={generating === row.id || !row.is_active}
                          onClick={() => generate(row)}
                        >
                          <Zap className="mr-1 h-4 w-4" /> Gerar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={refreshing === row.id || !row.is_active}
                          onClick={() => refresh(row)}
                          title="Reaplica os dados atuais nos lançamentos futuros pendentes"
                        >
                          <RefreshCw
                            className={`mr-1 h-4 w-4 ${refreshing === row.id ? "animate-spin" : ""}`}
                          />{" "}
                          Atualizar
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ConfirmDelete
                          trigger={
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          }
                          description="Os lançamentos já gerados permanecem no histórico."
                          onConfirm={() => remove.mutate(row.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar recorrência" : "Nova recorrência"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="rec-desc">Descrição</Label>
              <Input
                id="rec-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Salário, aluguel, streaming..."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rec-amount">Valor</Label>
              <Input
                id="rec-amount"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
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
              <Label>Frequência</Label>
              <Select
                value={form.frequency}
                onValueChange={(v) => setForm({ ...form, frequency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Categoria</Label>
              <Select
                value={form.category_id}
                onValueChange={(v) => setForm({ ...form, category_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem categoria</SelectItem>
                  {(categories.data ?? [])
                    .filter((c) => c.type === form.type)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rec-start">Início</Label>
              <Input
                id="rec-start"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rec-end">Fim (opcional)</Label>
              <Input
                id="rec-end"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Conta</Label>
              <Select
                value={form.account_id}
                onValueChange={(v) => setForm({ ...form, account_id: v, credit_card_id: NONE })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem conta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem conta</SelectItem>
                  {(accounts.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Cartão</Label>
              <Select
                value={form.credit_card_id}
                onValueChange={(v) => setForm({ ...form, credit_card_id: v, account_id: NONE })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem cartão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem cartão</SelectItem>
                  {(cards.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  {(members.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
              <Label htmlFor="rec-active">Ativa</Label>
              <Switch
                id="rec-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
              <Label htmlFor="rec-contribution">Aporte em previdência</Label>
              <Switch
                id="rec-contribution"
                checked={form.is_investment_contribution}
                onCheckedChange={(v) =>
                  setForm({
                    ...form,
                    is_investment_contribution: Boolean(v),
                    investment_id: v ? form.investment_id : NONE,
                    type: v ? "despesa" : form.type,
                    category_id: v ? NONE : form.category_id,
                  })
                }
              />
            </div>
            {form.is_investment_contribution ? (
              <div className="grid gap-2 sm:col-span-2">
                <Label>Previdência</Label>
                <Select
                  value={form.investment_id}
                  onValueChange={(v) => setForm({ ...form, investment_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o investimento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Selecione</SelectItem>
                    {(investments.data ?? [])
                      .filter((i) => i.type === "previdência")
                      .map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
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
