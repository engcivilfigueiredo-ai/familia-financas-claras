import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
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
import { useRemove, useTable, useUpsert } from "@/hooks/useFinance";
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
import { formatBRL, formatDateBR, parseCurrencyInput, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/patrimonio")({
  head: () => ({
    meta: [
      { title: "Patrimônio | Controle Financeiro Família" },
      { name: "description", content: "Bens, dívidas e cálculo do patrimônio líquido da família." },
      { property: "og:title", content: "Patrimônio | Controle Financeiro Família" },
      { property: "og:description", content: "Bens, dívidas e cálculo do patrimônio líquido da família." },
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

  const assetUpsert = useUpsert("assets", "Bem salvo");
  const assetRemove = useRemove("assets", "Bem excluído");
  const liabilityUpsert = useUpsert("liabilities", "Dívida salva");
  const liabilityRemove = useRemove("liabilities", "Dívida excluída");

  const [assetOpen, setAssetOpen] = useState(false);
  const [assetForm, setAssetForm] = useState(emptyAsset);
  const [liabOpen, setLiabOpen] = useState(false);
  const [liabForm, setLiabForm] = useState(emptyLiability);

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

  function saveLiability() {
    if (!liabForm.name.trim()) return;
    const total = parseCurrencyInput(liabForm.total_amount || "0");
    liabilityUpsert.mutate(
      {
        ...(liabForm.id ? { id: liabForm.id } : {}),
        name: liabForm.name.trim(),
        type: liabForm.type,
        total_amount: total,
        remaining_amount: parseCurrencyInput(liabForm.remaining_amount || String(total)),
        monthly_payment: parseCurrencyInput(liabForm.monthly_payment || "0"),
        due_day: Number(liabForm.due_day) || null,
        family_member_id: liabForm.family_member_id === NONE ? null : liabForm.family_member_id,
      },
      { onSuccess: () => setLiabOpen(false) },
    );
  }

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
              <p
                className={`text-lg font-semibold ${item.value < 0 ? "text-destructive" : ""}`}
              >
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
                <span className="font-medium text-destructive">
                  -{formatBRL(item.value)}
                </span>
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
              <Button
                size="sm"
                onClick={() => {
                  setLiabForm({ ...emptyLiability, family_member_id: scope.memberId ?? NONE });
                  setLiabOpen(true);
                }}
              >
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
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setLiabForm({
                            id: row.id,
                            name: row.name,
                            type: row.type,
                            total_amount: String(row.total_amount ?? ""),
                            remaining_amount: String(row.remaining_amount ?? ""),
                            monthly_payment: String(row.monthly_payment ?? ""),
                            due_day: String(row.due_day ?? ""),
                            family_member_id: row.family_member_id ?? NONE,
                          });
                          setLiabOpen(true);
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
                onValueChange={(v) => setLiabForm({ ...liabForm, type: v })}
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
            <div className="grid gap-2">
              <Label htmlFor="li-day">Dia de vencimento</Label>
              <Input
                id="li-day"
                value={liabForm.due_day}
                onChange={(e) => setLiabForm({ ...liabForm, due_day: e.target.value })}
                inputMode="numeric"
              />
            </div>
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
    </div>
  );
}
