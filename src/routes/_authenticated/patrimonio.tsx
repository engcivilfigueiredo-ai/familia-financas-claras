import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Landmark, Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/shared/states";
import { AllocationChart } from "@/components/shared/allocation-chart";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { useInvalidateFinance, useRemove, useTable, useUpsert } from "@/hooks/useFinance";
import { useScope } from "@/hooks/useScope";
import {
  ASSET_TYPES,
  LIABILITY_TYPES,
  accountBalance,
  cardOutstanding,
  type AccountRow,
  type CardRow,
  type Tx,
} from "@/lib/finance";
import { formatBRL, formatDateBR, parseCurrencyInput, parseISO, todayISO } from "@/lib/format";
import { registerContemplation, syncLiabilitySchedule } from "@/lib/liabilities";
import { installmentsLeft, nextDueDate, suggestInstallments } from "@/lib/liability-schedule";

export const Route = createFileRoute("/_authenticated/patrimonio")({
  head: () => ({
    meta: [
      { title: "Patrimônio | Controle Financeiro Família" },
      { name: "description", content: "Bens, dívidas e cálculo do patrimônio líquido da família." },
      { property: "og:title", content: "Patrimônio | Controle Financeiro Família" },
      {
        property: "og:description",
        content: "Bens, dívidas e cálculo do patrimônio líquido da família.",
      },
    ],
  }),
  component: PatrimonioPage,
});

interface Named {
  id: string;
  name: string;
}

interface AssetRow {
  id: string;
  name: string;
  type: string;
  value: number;
  acquisition_date: string | null;
  family_member_id: string | null;
}

interface LiabilityRow {
  id: string;
  name: string;
  type: string;
  total_amount: number;
  remaining_amount: number;
  monthly_payment: number;
  due_day: number | null;
  family_member_id: string | null;
  schedule_enabled: boolean;
  first_due_date: string | null;
  installments_total: number | null;
  auto_reduce_balance: boolean;
  account_id: string | null;
  category_id: string | null;
  contemplated_at: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  type: string;
}

interface InvestmentRow {
  id: string;
  current_amount: number;
  family_member_id: string | null;
}

const NONE = "__none__";

const emptyAsset = {
  id: "",
  name: "",
  type: "imóvel",
  value: "",
  acquisition_date: todayISO(),
  family_member_id: NONE,
};

const emptyLiability = {
  id: "",
  name: "",
  type: "financiamento",
  total_amount: "",
  remaining_amount: "",
  monthly_payment: "",
  due_day: "10",
  family_member_id: NONE,
  // Contas a pagar: lança uma parcela pendente por mês, no dia do vencimento
  schedule_enabled: true,
  first_due_date: "", // próximo vencimento (cadastro) ou 1º vencimento já gravado (edição)
  installments_left: "",
  account_id: NONE,
  category_id: NONE,
  auto_reduce_balance: false,
  has_schedule_base: false, // já existe cronograma gravado (o 1º vencimento não muda)
  paid_count: 0,
};

const emptyContemplation = {
  date: "",
  new_payment: "",
  installments_left: "",
  remaining_amount: "",
};

function PatrimonioPage() {
  const scope = useScope();
  const assets = useTable<AssetRow>("assets");
  const liabilities = useTable<LiabilityRow>("liabilities");
  const accounts = useTable<AccountRow>("accounts");
  const cards = useTable<CardRow>("credit_cards");
  const investments = useTable<InvestmentRow>("investments");
  const transactions = useTable<Tx>("transactions");
  const members = useTable<Named>("family_members");
  const categories = useTable<CategoryRow>("categories");
  const invalidate = useInvalidateFinance();

  const assetUpsert = useUpsert("assets", "Bem salvo");
  const assetRemove = useRemove("assets", "Bem excluído");
  const liabilityUpsert = useUpsert("liabilities", "Dívida salva");
  const liabilityRemove = useRemove("liabilities", "Dívida excluída");

  const [assetOpen, setAssetOpen] = useState(false);
  const [assetForm, setAssetForm] = useState(emptyAsset);
  const [liabOpen, setLiabOpen] = useState(false);
  const [liabForm, setLiabForm] = useState(emptyLiability);
  const [contOpen, setContOpen] = useState(false);
  const [contRow, setContRow] = useState<LiabilityRow | null>(null);
  const [contForm, setContForm] = useState(emptyContemplation);
  const [contSaving, setContSaving] = useState(false);

  const assetRows = useMemo(
    () => (assets.data ?? []).filter((a) => scope.matches(a.family_member_id)),
    [assets.data, scope],
  );
  const liabRows = useMemo(
    () => (liabilities.data ?? []).filter((l) => scope.matches(l.family_member_id)),
    [liabilities.data, scope],
  );

  const summary = useMemo(() => {
    const txs = transactions.data ?? [];
    const cash = (accounts.data ?? [])
      .filter((a) => a.is_active && scope.matches(a.family_member_id))
      .reduce((s, a) => s + accountBalance(a, txs), 0);
    const invested = (investments.data ?? [])
      .filter((i) => scope.matches(i.family_member_id))
      .reduce((s, i) => s + Number(i.current_amount), 0);
    const goods = assetRows.reduce((s, a) => s + Number(a.value), 0);
    const cardDebt = (cards.data ?? [])
      .filter((c) => scope.matches(c.family_member_id))
      .reduce((s, c) => s + cardOutstanding(c.id, txs), 0);
    const debts = liabRows.reduce((s, l) => s + Number(l.remaining_amount), 0);
    return {
      cash,
      invested,
      goods,
      cardDebt,
      debts,
      total: cash + invested + goods - cardDebt - debts,
    };
  }, [accounts.data, cards.data, investments.data, transactions.data, assetRows, liabRows, scope]);

  const memberName = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.id, m.name])),
    [members.data],
  );

  function saveAsset() {
    if (!assetForm.name.trim()) return;
    assetUpsert.mutate(
      {
        ...(assetForm.id ? { id: assetForm.id } : {}),
        name: assetForm.name.trim(),
        type: assetForm.type,
        value: parseCurrencyInput(assetForm.value || "0"),
        acquisition_date: assetForm.acquisition_date || null,
        family_member_id: assetForm.family_member_id === NONE ? null : assetForm.family_member_id,
      },
      { onSuccess: () => setAssetOpen(false) },
    );
  }

  // Parcelas já pagas de cada dívida (vêm de Contas a pagar)
  const paidByLiability = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions.data ?? []) {
      if (t.liability_id && t.status === "pago") {
        map.set(t.liability_id, (map.get(t.liability_id) ?? 0) + 1);
      }
    }
    return map;
  }, [transactions.data]);

  function openNewLiability() {
    setLiabForm({
      ...emptyLiability,
      first_due_date: nextDueDate(10, todayISO()),
      family_member_id: scope.memberId ?? NONE,
    });
    setLiabOpen(true);
  }

  function openEditLiability(row: LiabilityRow) {
    const paid = paidByLiability.get(row.id) ?? 0;
    setLiabForm({
      id: row.id,
      name: row.name,
      type: row.type,
      total_amount: String(row.total_amount ?? ""),
      remaining_amount: String(row.remaining_amount ?? ""),
      monthly_payment: String(row.monthly_payment ?? ""),
      due_day: String(row.due_day ?? ""),
      family_member_id: row.family_member_id ?? NONE,
      schedule_enabled: row.schedule_enabled,
      first_due_date: row.first_due_date ?? nextDueDate(row.due_day ?? 10, todayISO()),
      installments_left:
        row.schedule_enabled && row.installments_total
          ? String(installmentsLeft(row.installments_total, paid))
          : "",
      account_id: row.account_id ?? NONE,
      category_id: row.category_id ?? NONE,
      auto_reduce_balance: row.auto_reduce_balance,
      has_schedule_base: Boolean(row.first_due_date),
      paid_count: paid,
    });
    setLiabOpen(true);
  }

  function saveLiability() {
    if (!liabForm.name.trim()) return;
    const total = parseCurrencyInput(liabForm.total_amount || "0");
    const remaining = parseCurrencyInput(liabForm.remaining_amount || String(total));
    const payment = parseCurrencyInput(liabForm.monthly_payment || "0");
    let dueDay = Number(liabForm.due_day) || null;
    const schedule: Record<string, unknown> = {};

    if (liabForm.schedule_enabled) {
      if (payment <= 0) {
        toast.error("Informe a parcela mensal para lançar as parcelas em Contas a pagar.");
        return;
      }
      const left = Number(liabForm.installments_left) || suggestInstallments(remaining, payment);
      if (left < 1) {
        toast.error("Informe quantas parcelas restam pagar.");
        return;
      }
      if (!liabForm.has_schedule_base) {
        if (!liabForm.first_due_date) {
          toast.error("Informe a data do próximo vencimento.");
          return;
        }
        dueDay = parseISO(liabForm.first_due_date).getDate();
        schedule["first_due_date"] = liabForm.first_due_date;
      }
      schedule["installments_total"] = liabForm.paid_count + left;
    }

    liabilityUpsert.mutate(
      {
        ...(liabForm.id ? { id: liabForm.id } : {}),
        name: liabForm.name.trim(),
        type: liabForm.type,
        total_amount: total,
        remaining_amount: remaining,
        monthly_payment: payment,
        due_day: dueDay,
        family_member_id: liabForm.family_member_id === NONE ? null : liabForm.family_member_id,
        schedule_enabled: liabForm.schedule_enabled,
        auto_reduce_balance: liabForm.auto_reduce_balance,
        account_id: liabForm.account_id === NONE ? null : liabForm.account_id,
        category_id: liabForm.category_id === NONE ? null : liabForm.category_id,
        ...schedule,
      },
      {
        onSuccess: async () => {
          setLiabOpen(false);
          try {
            await syncLiabilitySchedule();
            invalidate();
          } catch (error) {
            toast.error((error as Error).message);
          }
        },
      },
    );
  }

  function openContemplation(row: LiabilityRow) {
    const paid = paidByLiability.get(row.id) ?? 0;
    setContRow(row);
    setContForm({
      date: todayISO(),
      new_payment: String(row.monthly_payment ?? ""),
      installments_left:
        row.schedule_enabled && row.installments_total
          ? String(installmentsLeft(row.installments_total, paid))
          : "",
      remaining_amount: String(row.remaining_amount ?? ""),
    });
    setContOpen(true);
  }

  async function submitContemplation() {
    if (!contRow) return;
    const payment = parseCurrencyInput(contForm.new_payment || "0");
    if (payment <= 0) {
      toast.error("Informe o novo valor da parcela.");
      return;
    }
    if (!contForm.date || contForm.date > todayISO()) {
      toast.error("Informe a data em que foi contemplado (não pode ser futura).");
      return;
    }
    setContSaving(true);
    try {
      const updated = await registerContemplation({
        liability_id: contRow.id,
        date: contForm.date,
        new_payment: payment,
        installments_left:
          contForm.installments_left.trim() === ""
            ? null
            : Math.max(0, Math.trunc(Number(contForm.installments_left)) || 0),
        remaining_amount:
          contForm.remaining_amount.trim() === ""
            ? null
            : parseCurrencyInput(contForm.remaining_amount),
      });
      invalidate();
      setContOpen(false);
      toast.success(
        contRow.schedule_enabled
          ? `Contemplação registrada: ${updated} parcela(s) em Contas a pagar com o novo valor.`
          : "Contemplação registrada. Ative “Lançar parcelas em Contas a pagar” na dívida para gerar as parcelas.",
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setContSaving(false);
    }
  }

  // Quantas parcelas pendentes já lançadas serão atualizadas pela contemplação
  const contAffected = contRow
    ? (transactions.data ?? []).filter(
        (t) => t.liability_id === contRow.id && t.status !== "pago" && t.date >= contForm.date,
      ).length
    : 0;
  const showDateInput = liabForm.schedule_enabled && !liabForm.has_schedule_base;
  const suggestedLeft = suggestInstallments(
    parseCurrencyInput(liabForm.remaining_amount || liabForm.total_amount || "0"),
    parseCurrencyInput(liabForm.monthly_payment || "0"),
  );

  const loading = assets.isLoading || liabilities.isLoading;
  const error = assets.isError ? assets.error : liabilities.isError ? liabilities.error : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patrimônio"
        description={`Patrimônio líquido: ${formatBRL(summary.total)}`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Contas", value: summary.cash },
          { label: "Investimentos", value: summary.invested },
          { label: "Bens", value: summary.goods },
          { label: "Cartões", value: -summary.cardDebt },
          { label: "Dívidas", value: -summary.debts },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-6">
              <p className="text-xs uppercase text-muted-foreground">{item.label}</p>
              <p className={`text-lg font-semibold ${item.value < 0 ? "text-destructive" : ""}`}>
                {formatBRL(item.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AllocationChart
          title="Composição do patrimônio"
          description="Onde o patrimônio está alocado: contas, investimentos e bens."
          slices={[
            { name: "Contas", value: summary.cash },
            { name: "Investimentos", value: summary.invested },
            { name: "Bens", value: summary.goods },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compromissos</CardTitle>
            <p className="text-xs text-muted-foreground">
              Valores que reduzem o patrimônio líquido.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Faturas de cartões", value: summary.cardDebt },
              { label: "Dívidas e financiamentos", value: summary.debts },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between text-sm">
                <span>{item.label}</span>
                <span className="font-medium text-destructive">-{formatBRL(item.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-3 text-sm font-semibold">
              <span>Patrimônio líquido</span>
              <span className={summary.total < 0 ? "text-destructive" : "text-chart-2"}>
                {formatBRL(summary.total)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <LoadingState rows={4} />
      ) : error ? (
        <ErrorState message={(error as Error)?.message} onRetry={() => assets.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Bens</h2>
              <Button
                size="sm"
                onClick={() => {
                  setAssetForm({ ...emptyAsset, family_member_id: scope.memberId ?? NONE });
                  setAssetOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Novo bem
              </Button>
            </div>
            {assetRows.length === 0 ? (
              <EmptyState
                title="Nenhum bem cadastrado"
                description="Cadastre imóveis, veículos e outros bens."
                icon={<Building2 className="h-6 w-6" />}
              />
            ) : (
              assetRows.map((row) => (
                <Card key={row.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                    <div>
                      <CardTitle className="text-base">{row.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {row.type}
                        {row.acquisition_date
                          ? ` · desde ${formatDateBR(row.acquisition_date)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setAssetForm({
                            id: row.id,
                            name: row.name,
                            type: row.type,
                            value: String(row.value ?? ""),
                            acquisition_date: row.acquisition_date ?? "",
                            family_member_id: row.family_member_id ?? NONE,
                          });
                          setAssetOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConfirmDelete
                        trigger={
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        }
                        onConfirm={() => assetRemove.mutate(row.id)}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <p className="text-xl font-semibold">{formatBRL(Number(row.value))}</p>
                    <Badge variant="outline">
                      {row.family_member_id ? memberName.get(row.family_member_id) : "Família"}
                    </Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Dívidas</h2>
              <Button size="sm" onClick={openNewLiability}>
                <Plus className="mr-2 h-4 w-4" /> Nova dívida
              </Button>
            </div>
            {liabRows.length === 0 ? (
              <EmptyState
                title="Nenhuma dívida cadastrada"
                description="Cadastre financiamentos, empréstimos e consórcios."
                icon={<Landmark className="h-6 w-6" />}
              />
            ) : (
              liabRows.map((row) => (
                <Card key={row.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                    <div>
                      <CardTitle className="text-base">{row.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {row.type} · parcela {formatBRL(Number(row.monthly_payment))}
                        {row.due_day ? ` · dia ${row.due_day}` : ""}
                      </p>
                      {row.schedule_enabled ? (
                        <p className="text-xs text-muted-foreground">
                          Em Contas a pagar ·{" "}
                          {installmentsLeft(
                            row.installments_total,
                            paidByLiability.get(row.id) ?? 0,
                          )}{" "}
                          parcela(s) restante(s)
                        </p>
                      ) : null}
                      {row.contemplated_at ? (
                        <Badge variant="secondary" className="mt-1">
                          Contemplado em {formatDateBR(row.contemplated_at)}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex gap-1">
                      {row.type === "consórcio" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Registrar contemplação"
                          onClick={() => openContemplation(row)}
                        >
                          <Trophy className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="icon" onClick={() => openEditLiability(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConfirmDelete
                        trigger={
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        }
                        onConfirm={() => liabilityRemove.mutate(row.id)}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <div>
                      <p className="text-xl font-semibold text-destructive">
                        {formatBRL(Number(row.remaining_amount))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        de {formatBRL(Number(row.total_amount))}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {row.family_member_id ? memberName.get(row.family_member_id) : "Família"}
                    </Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </section>
        </div>
      )}

      <Dialog open={assetOpen} onOpenChange={setAssetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{assetForm.id ? "Editar bem" : "Novo bem"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="as-name">Nome</Label>
              <Input
                id="as-name"
                value={assetForm.name}
                onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select
                value={assetForm.type}
                onValueChange={(v) => setAssetForm({ ...assetForm, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="as-value">Valor</Label>
              <Input
                id="as-value"
                value={assetForm.value}
                onChange={(e) => setAssetForm({ ...assetForm, value: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="as-date">Aquisição</Label>
              <Input
                id="as-date"
                type="date"
                value={assetForm.acquisition_date}
                onChange={(e) => setAssetForm({ ...assetForm, acquisition_date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Pessoa</Label>
              <Select
                value={assetForm.family_member_id}
                onValueChange={(v) => setAssetForm({ ...assetForm, family_member_id: v })}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssetOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveAsset} disabled={assetUpsert.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={liabOpen} onOpenChange={setLiabOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{liabForm.id ? "Editar dívida" : "Nova dívida"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="li-name">Nome</Label>
              <Input
                id="li-name"
                value={liabForm.name}
                onChange={(e) => setLiabForm({ ...liabForm, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select
                value={liabForm.type}
                onValueChange={(v) =>
                  setLiabForm({
                    ...liabForm,
                    type: v,
                    // consórcio: o saldo é a soma das parcelas, então pode abater a cada pagamento
                    auto_reduce_balance: liabForm.id
                      ? liabForm.auto_reduce_balance
                      : v === "consórcio",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIABILITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!showDateInput ? (
              <div className="grid gap-2">
                <Label htmlFor="li-day">Dia de vencimento</Label>
                <Input
                  id="li-day"
                  value={liabForm.due_day}
                  onChange={(e) => setLiabForm({ ...liabForm, due_day: e.target.value })}
                  inputMode="numeric"
                />
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="li-total">Valor total</Label>
              <Input
                id="li-total"
                value={liabForm.total_amount}
                onChange={(e) => setLiabForm({ ...liabForm, total_amount: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="li-rem">Saldo devedor</Label>
              <Input
                id="li-rem"
                value={liabForm.remaining_amount}
                onChange={(e) => setLiabForm({ ...liabForm, remaining_amount: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="li-month">Parcela mensal</Label>
              <Input
                id="li-month"
                value={liabForm.monthly_payment}
                onChange={(e) => setLiabForm({ ...liabForm, monthly_payment: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label>Pessoa</Label>
              <Select
                value={liabForm.family_member_id}
                onValueChange={(v) => setLiabForm({ ...liabForm, family_member_id: v })}
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
            <div className="grid gap-3 rounded-md border p-3 sm:col-span-2">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox
                  checked={liabForm.schedule_enabled}
                  onCheckedChange={(v) =>
                    setLiabForm({ ...liabForm, schedule_enabled: v === true })
                  }
                  className="mt-0.5"
                />
                <span>
                  <strong>Lançar as parcelas em Contas a pagar</strong>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    Cria uma despesa pendente por mês, no dia do vencimento (próximos 12 meses; o
                    app completa o resto sozinho). Para dar baixa, marque como paga em Contas a
                    pagar.
                  </span>
                </span>
              </label>
              {liabForm.schedule_enabled ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {showDateInput ? (
                    <div className="grid gap-2">
                      <Label htmlFor="li-first">Próximo vencimento</Label>
                      <Input
                        id="li-first"
                        type="date"
                        value={liabForm.first_due_date}
                        onChange={(e) =>
                          setLiabForm({
                            ...liabForm,
                            first_due_date: e.target.value,
                            due_day: e.target.value
                              ? String(parseISO(e.target.value).getDate())
                              : liabForm.due_day,
                          })
                        }
                      />
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    <Label htmlFor="li-left">Parcelas restantes</Label>
                    <Input
                      id="li-left"
                      value={liabForm.installments_left}
                      onChange={(e) =>
                        setLiabForm({ ...liabForm, installments_left: e.target.value })
                      }
                      inputMode="numeric"
                      placeholder={suggestedLeft > 0 ? `ex.: ${suggestedLeft}` : "0"}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Conta de pagamento (opcional)</Label>
                    <Select
                      value={liabForm.account_id}
                      onValueChange={(v) => setLiabForm({ ...liabForm, account_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Nenhuma</SelectItem>
                        {(accounts.data ?? []).map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Categoria (opcional)</Label>
                    <Select
                      value={liabForm.category_id}
                      onValueChange={(v) => setLiabForm({ ...liabForm, category_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sem categoria</SelectItem>
                        {(categories.data ?? [])
                          .filter((c) => c.type === "despesa")
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex cursor-pointer items-start gap-2 text-sm sm:col-span-2">
                    <Checkbox
                      checked={liabForm.auto_reduce_balance}
                      onCheckedChange={(v) =>
                        setLiabForm({ ...liabForm, auto_reduce_balance: v === true })
                      }
                      className="mt-0.5"
                    />
                    <span>
                      Abater o saldo devedor a cada parcela paga
                      <br />
                      <span className="text-xs text-muted-foreground">
                        Indicado para consórcio. Em financiamento ou empréstimo com juros, deixe
                        desmarcado e atualize o saldo na mão.
                      </span>
                    </span>
                  </label>
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiabOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveLiability} disabled={liabilityUpsert.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={contOpen} onOpenChange={setContOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar contemplação</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {contRow?.name}. As parcelas ainda não pagas, a partir da data, passam para o novo valor
            em Contas a pagar. As já pagas não mudam.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ct-date">Data da contemplação</Label>
              <Input
                id="ct-date"
                type="date"
                value={contForm.date}
                max={todayISO()}
                onChange={(e) => setContForm({ ...contForm, date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ct-payment">Novo valor da parcela</Label>
              <Input
                id="ct-payment"
                value={contForm.new_payment}
                onChange={(e) => setContForm({ ...contForm, new_payment: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ct-left">Parcelas restantes</Label>
              <Input
                id="ct-left"
                value={contForm.installments_left}
                onChange={(e) => setContForm({ ...contForm, installments_left: e.target.value })}
                inputMode="numeric"
                placeholder="manter"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ct-rem">Saldo devedor</Label>
              <Input
                id="ct-rem"
                value={contForm.remaining_amount}
                onChange={(e) => setContForm({ ...contForm, remaining_amount: e.target.value })}
                inputMode="decimal"
                placeholder="manter"
              />
            </div>
          </div>
          {contRow?.schedule_enabled ? (
            <p className="text-xs text-muted-foreground">
              {contAffected} parcela(s) já lançada(s) em Contas a pagar serão atualizadas.
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setContOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitContemplation} disabled={contSaving}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
