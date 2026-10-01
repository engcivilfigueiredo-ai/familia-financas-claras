import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, ArrowDownCircle, ArrowUpCircle, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInvalidateFinance, useTable } from "@/hooks/useFinance";
import { useScope } from "@/hooks/useScope";
import { todayISO, parseCurrencyInput } from "@/lib/format";
import { INVESTMENT_TX_TYPES, IR_TYPES, PAYMENT_METHODS, invoiceMonthFor } from "@/lib/finance";
import {
  createInstallmentPurchase,
  createInvestmentMove,
  createTransfer,
  saveSimpleTransaction,
} from "@/lib/transactions";

export type QuickKind = "receita" | "despesa" | "transferencia" | "investimento";

interface Member {
  id: string;
  name: string;
  is_active: boolean;
}
interface Account {
  id: string;
  name: string;
  is_active: boolean;
  family_member_id: string | null;
}
interface Card {
  id: string;
  name: string;
  closing_day: number;
  due_day: number;
  is_active: boolean;
}
interface Category {
  id: string;
  name: string;
  type: string;
}
interface Investment {
  id: string;
  name: string;
}

export interface EditingTransaction {
  id: string;
  type: string;
  description: string;
  amount: number;
  date: string;
  category_id: string | null;
  account_id: string | null;
  credit_card_id: string | null;
  family_member_id: string | null;
  payment_method: string | null;
  status: string;
  notes: string | null;
  tags: string[] | null;
  project_id?: string | null;
}

interface ProjectOption {
  id: string;
  project_number: string;
  name: string;
}

const NONE = "__none__";

export function TransactionDialog({
  open,
  onOpenChange,
  initialKind = "despesa",
  editing,
  initialProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKind?: QuickKind;
  editing?: EditingTransaction | null;
  initialProjectId?: string | null;
}) {
  const invalidate = useInvalidateFinance();
  const scope = useScope();
  const members = useTable<Member>("family_members");
  const accounts = useTable<Account>("accounts");
  const cards = useTable<Card>("credit_cards");
  const categories = useTable<Category>("categories");
  const investments = useTable<Investment>("investments");
  const projects = useTable<ProjectOption>("projects");
  const [projectId, setProjectId] = useState<string>(NONE);

  const [kind, setKind] = useState<QuickKind>(initialKind);
  const [saving, setSaving] = useState(false);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState<string>(NONE);
  const [memberId, setMemberId] = useState<string>(NONE);
  const [status, setStatus] = useState("pago");
  const [paymentMethod, setPaymentMethod] = useState<string>("pix");
  const [notes, setNotes] = useState("");
  const [payWithCard, setPayWithCard] = useState(false);
  const [accountId, setAccountId] = useState<string>(NONE);
  const [cardId, setCardId] = useState<string>(NONE);
  const [installmentMode, setInstallmentMode] = useState(false);
  const [installmentCount, setInstallmentCount] = useState("2");
  const [toAccountId, setToAccountId] = useState<string>(NONE);
  const [destinationKind, setDestinationKind] = useState<"conta" | "cartao">("conta");
  const [investmentId, setInvestmentId] = useState<string>(NONE);
  const [moveType, setMoveType] = useState<string>("aplicação");
  const [irType, setIrType] = useState<string>(NONE);

  const activeAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => a.is_active),
    [accounts.data],
  );
  const activeCards = useMemo(() => (cards.data ?? []).filter((c) => c.is_active), [cards.data]);
  const activeMembers = useMemo(
    () => (members.data ?? []).filter((m) => m.is_active),
    [members.data],
  );

  useEffect(() => {
    if (!open) return;
    setKind(editing ? (editing.type as QuickKind) : initialKind);
    setSaving(false);
    if (editing) {
      setDescription(editing.description);
      setAmount(String(Math.abs(editing.amount)).replace(".", ","));
      setDate(editing.date);
      setCategoryId(editing.category_id ?? NONE);
      setMemberId(editing.family_member_id ?? NONE);
      setStatus(editing.status);
      setPaymentMethod(editing.payment_method ?? "pix");
      setNotes(editing.notes ?? "");
      setPayWithCard(Boolean(editing.credit_card_id));
      setAccountId(editing.account_id ?? NONE);
      setCardId(editing.credit_card_id ?? NONE);
      setInstallmentMode(false);
      setProjectId(editing.project_id ?? NONE);
    } else {
      setProjectId(initialProjectId ?? NONE);
      setDescription("");
      setAmount("");
      setDate(todayISO());
      setCategoryId(NONE);
      setMemberId(scope.view === "mine" && scope.memberId ? scope.memberId : NONE);
      setStatus("pago");
      setPaymentMethod("pix");
      setNotes("");
      setPayWithCard(false);
      setAccountId(NONE);
      setCardId(NONE);
      setInstallmentMode(false);
      setInstallmentCount("2");
      setToAccountId(NONE);
      setDestinationKind("conta");
      setInvestmentId(NONE);
      setMoveType("aplicação");
      setIrType(NONE);
    }
  }, [open, editing, initialKind, scope.view, scope.memberId]);

  const filteredCategories = useMemo(
    () =>
      (categories.data ?? []).filter((c) =>
        kind === "receita" ? c.type === "receita" : c.type === "despesa",
      ),
    [categories.data, kind],
  );

  const value = parseCurrencyInput(amount);

  async function handleSubmit() {
    if (kind !== "investimento" && !description.trim()) {
      toast.error("Informe uma descrição");
      return;
    }
    if (value <= 0) {
      toast.error("Informe um valor maior que zero");
      return;
    }
    setSaving(true);
    try {
      if (kind === "receita" || kind === "despesa") {
        const useCard = kind === "despesa" && payWithCard;
        if (useCard && cardId === NONE) throw new Error("Selecione um cartão");
        if (!useCard && accountId === NONE) throw new Error("Selecione uma conta");
        const card = activeCards.find((c) => c.id === cardId) ?? null;

        if (useCard && installmentMode && !editing) {
          const count = Math.max(2, Number(installmentCount) || 2);
          if (!card) throw new Error("Selecione um cartão");
          await createInstallmentPurchase(
            {
              purchase_description: description.trim(),
              total_amount: value,
              installment_count: count,
              credit_card_id: card.id,
              category_id: categoryId === NONE ? null : categoryId,
              family_member_id: memberId === NONE ? null : memberId,
              purchase_date: date,
              notes: notes || null,
              tags: [],
            },
            card,
          );
          toast.success(`${count} parcelas geradas`);
        } else {
          await saveSimpleTransaction(
            {
              ...(editing ? { id: editing.id } : {}),
              type: kind,
              description: description.trim(),
              amount: value,
              date,
              category_id: categoryId === NONE ? null : categoryId,
              account_id: useCard ? null : accountId === NONE ? null : accountId,
              credit_card_id: useCard ? cardId : null,
              family_member_id: memberId === NONE ? null : memberId,
              payment_method: useCard ? "crédito" : paymentMethod,
              status,
              notes: notes || null,
              tags: [],
              project_id: kind === "receita" && projectId !== NONE ? projectId : null,
            },
            useCard ? card : null,
          );
          toast.success(editing ? "Lançamento atualizado" : "Lançamento registrado");
        }
      } else if (kind === "transferencia") {
        if (accountId === NONE) throw new Error("Selecione a conta de origem");
        if (destinationKind === "conta" && toAccountId === NONE)
          throw new Error("Selecione a conta de destino");
        if (destinationKind === "cartao" && cardId === NONE)
          throw new Error("Selecione o cartão a pagar");
        if (destinationKind === "conta" && toAccountId === accountId)
          throw new Error("As contas de origem e destino devem ser diferentes");
        const card = activeCards.find((c) => c.id === cardId);
        await createTransfer({
          description: description.trim(),
          amount: value,
          date,
          from_account_id: accountId,
          to_account_id: destinationKind === "conta" ? toAccountId : null,
          to_credit_card_id: destinationKind === "cartao" ? cardId : null,
          family_member_id: memberId === NONE ? null : memberId,
          notes: notes || null,
          invoice_month: card ? invoiceMonthFor(date, card.closing_day) : null,
        });
        toast.success("Transferência registrada");
      } else {
        if (investmentId === NONE) throw new Error("Selecione um investimento");
        const inv = (investments.data ?? []).find((i) => i.id === investmentId);
        await createInvestmentMove({
          investment_id: investmentId,
          account_id: accountId === NONE ? null : accountId,
          amount: value,
          date,
          type: moveType as (typeof INVESTMENT_TX_TYPES)[number],
          ir_type: irType === NONE ? null : irType,
          family_member_id: memberId === NONE ? null : memberId,
          investment_name: inv?.name ?? "Investimento",
        });
        toast.success("Movimentação de investimento registrada");
      }
      invalidate();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const kinds: { key: QuickKind; label: string; icon: typeof ArrowUpCircle }[] = [
    { key: "receita", label: "Receita", icon: ArrowUpCircle },
    { key: "despesa", label: "Despesa", icon: ArrowDownCircle },
    { key: "transferencia", label: "Transferência", icon: ArrowLeftRight },
    { key: "investimento", label: "Investimento", icon: TrendingUp },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
          <DialogDescription>
            Escolha o tipo e preencha os campos. Transferências e aportes não entram como
            receita ou despesa.
          </DialogDescription>
        </DialogHeader>

        {!editing ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {kinds.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setKind(key)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-medium transition-colors ${
                  kind === key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 py-2">
          {kind !== "investimento" ? (
            <div className="grid gap-2">
              <Label htmlFor="tx-desc">Descrição</Label>
              <Input
                id="tx-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Supermercado, Salário, Aluguel"
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="tx-amount">Valor (R$)</Label>
              <Input
                id="tx-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tx-date">Data</Label>
              <Input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {kind === "receita" || kind === "despesa" ? (
            <>
              <div className="grid gap-2">
                <Label>Categoria</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem categoria</SelectItem>
                    {filteredCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {kind === "despesa" ? (
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Pagar com cartão de crédito</p>
                    <p className="text-xs text-muted-foreground">
                      A despesa entra na fatura do mês de fechamento
                    </p>
                  </div>
                  <Switch checked={payWithCard} onCheckedChange={setPayWithCard} />
                </div>
              ) : null}

              {kind === "despesa" && payWithCard ? (
                <>
                  <div className="grid gap-2">
                    <Label>Cartão</Label>
                    <Select value={cardId} onValueChange={setCardId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o cartão" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeCards.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!editing ? (
                    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">Compra parcelada</p>
                        <p className="text-xs text-muted-foreground">
                          Gera todas as parcelas automaticamente
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {installmentMode ? (
                          <Input
                            className="w-16"
                            inputMode="numeric"
                            value={installmentCount}
                            onChange={(e) => setInstallmentCount(e.target.value)}
                          />
                        ) : null}
                        <Switch checked={installmentMode} onCheckedChange={setInstallmentMode} />
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="grid gap-2">
                  <Label>Conta</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="atrasado">Atrasado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!payWithCard ? (
                  <div className="grid gap-2">
                    <Label>Forma de pagamento</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {kind === "transferencia" ? (
            <>
              <div className="grid gap-2">
                <Label>Conta de origem</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Destino</Label>
                <Select
                  value={destinationKind}
                  onValueChange={(v) => setDestinationKind(v as "conta" | "cartao")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conta">Outra conta</SelectItem>
                    <SelectItem value="cartao">Pagamento de fatura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {destinationKind === "conta" ? (
                <div className="grid gap-2">
                  <Label>Conta de destino</Label>
                  <Select value={toAccountId} onValueChange={setToAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label>Cartão</Label>
                  <Select value={cardId} onValueChange={setCardId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCards.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          ) : null}

          {kind === "investimento" ? (
            <>
              <div className="grid gap-2">
                <Label>Investimento</Label>
                <Select value={investmentId} onValueChange={setInvestmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {(investments.data ?? []).map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Movimento</Label>
                  <Select value={moveType} onValueChange={setMoveType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVESTMENT_TX_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t === "jcp" ? "JCP" : t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Tributação</Label>
                  <Select value={irType} onValueChange={setIrType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Não informar</SelectItem>
                      {IR_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Conta vinculada</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem conta</SelectItem>
                    {activeAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          {kind === "receita" ? (
            <div className="grid gap-2">
              <Label>Projeto BF Engenharia</Label>
              <Select
                value={projectId}
                onValueChange={(v) => {
                  setProjectId(v);
                  const p = (projects.data ?? []).find((x) => x.id === v);
                  if (p && !description.trim()) setDescription(`Recebimento ${p.project_number} - ${p.name}`);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem projeto</SelectItem>
                  {(projects.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.project_number} · {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label>Pessoa</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não atribuído</SelectItem>
                {activeMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tx-notes">Observações</Label>
            <Textarea
              id="tx-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
