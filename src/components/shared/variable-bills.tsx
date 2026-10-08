import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useTable, useInvalidateFinance } from "@/hooks/useFinance";
import { useScope } from "@/hooks/useScope";
import type { Tx } from "@/lib/finance";
import { todayISO } from "@/lib/format";

interface Named { id: string; name: string; type?: string; is_active?: boolean }
export interface VariableBill {
  id: string;
  description: string;
  type: string;
  is_active: boolean;
  is_variable_amount: boolean;
  due_day: number | null;
  alert_days: number;
  category_id: string | null;
  account_id: string | null;
  family_member_id: string | null;
}

const NONE = "__none__";

function dueDateFor(year: number, month: number, day: number) {
  const last = new Date(year, month + 1, 0).getDate();
  const d = Math.min(day, last);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysUntil(from: string, to: string) {
  return Math.round((new Date(to + "T00:00:00").getTime() - new Date(from + "T00:00:00").getTime()) / 86400000);
}

/** Datas de vencimento que já devem existir como pendência (mês atual + próximo se dentro do alerta). */
function datesToEnsure(bill: VariableBill, today: string) {
  const now = new Date(today + "T00:00:00");
  const day = bill.due_day ?? 10;
  const out = [dueDateFor(now.getFullYear(), now.getMonth(), day)];
  const next = dueDateFor(now.getFullYear(), now.getMonth() + 1, day);
  if (daysUntil(today, next) <= bill.alert_days) out.push(next);
  return out;
}

export function VariableBills() {
  const scope = useScope();
  const qc = useQueryClient();
  const invalidate = useInvalidateFinance();
  const recurring = useTable<VariableBill>("recurring_transactions");
  const transactions = useTable<Tx>("transactions");
  const categories = useTable<Named>("categories");
  const accounts = useTable<Named>("accounts");
  const members = useTable<Named>("family_members");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ description: "", due_day: "10", alert_days: "7", category_id: NONE, account_id: NONE, family_member_id: NONE });
  const running = useRef(false);

  const bills = (recurring.data ?? []).filter((r) => r.is_variable_amount && scope.matches(r.family_member_id));

  // Gera automaticamente as pendências com valor zerado
  useEffect(() => {
    if (!recurring.data || !transactions.data || running.current) return;
    const today = todayISO();
    const missing: Record<string, unknown>[] = [];
    for (const b of recurring.data.filter((r) => r.is_variable_amount && r.is_active)) {
      for (const date of datesToEnsure(b, today)) {
        const exists = transactions.data.some((t) => (t as Tx & { recurring_id?: string }).recurring_id === b.id && t.date.slice(0, 7) === date.slice(0, 7));
        if (!exists) missing.push({
          type: "despesa", description: b.description, amount: 0, date, status: "pendente",
          is_recurring: true, recurring_id: b.id, category_id: b.category_id, account_id: b.account_id,
          family_member_id: b.family_member_id, payment_method: "boleto", tags: [],
        });
      }
    }
    if (!missing.length) return;
    running.current = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { error } = await supabase.from("transactions").insert(missing.map((m) => ({ ...m, user_id: u.user!.id })) as never);
      if (error) toast.error(error.message);
      else qc.invalidateQueries({ queryKey: ["transactions"] });
      running.current = false;
    })();
  }, [recurring.data, transactions.data, qc]);

  async function save() {
    const day = Number(form.due_day);
    if (!form.description.trim() || !(day >= 1 && day <= 31)) { toast.error("Informe descrição e dia de vencimento (1-31)"); return; }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("recurring_transactions").insert({
      user_id: u.user.id, description: form.description.trim(), amount: 0, type: "despesa", frequency: "mensal",
      start_date: todayISO(), is_active: true, is_variable_amount: true, due_day: day,
      alert_days: Math.max(0, Number(form.alert_days) || 7),
      category_id: form.category_id === NONE ? null : form.category_id,
      account_id: form.account_id === NONE ? null : form.account_id,
      family_member_id: form.family_member_id === NONE ? null : form.family_member_id,
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Conta mensal cadastrada");
    setOpen(false);
    setForm({ ...form, description: "" });
    invalidate();
  }

  async function removeBill(id: string) {
    await supabase.from("transactions").delete().eq("recurring_id", id).eq("status", "pendente").eq("amount", 0);
    const { error } = await supabase.from("recurring_transactions").update({ is_active: false, is_variable_amount: false } as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Conta mensal removida");
    invalidate();
  }

  const expenseCats = (categories.data ?? []).filter((c) => c.type === "despesa");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><Zap className="h-4 w-4" /> Contas mensais de valor variável</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Conta mensal variável</Button>
      </CardHeader>
      <CardContent>
        {bills.length === 0 ? (
          <p className="text-sm text-muted-foreground">Cadastre contas como luz, água ou gás. Todo mês o app cria a pendência e avisa você para informar o valor.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {bills.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                <span className="font-medium">{b.description}</span>
                <Badge variant="secondary">dia {b.due_day}</Badge>
                <span className="text-xs text-muted-foreground">alerta {b.alert_days}d antes</span>
                <button type="button" aria-label="Remover" onClick={() => removeBill(b.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova conta mensal variável</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>Descrição</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Conta de luz" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Dia do vencimento</Label>
                <Input type="number" min={1} max={31} value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Avisar quantos dias antes</Label>
                <Input type="number" min={0} value={form.alert_days} onChange={(e) => setForm({ ...form, alert_days: e.target.value })} /></div>
            </div>
            <div className="grid gap-1.5"><Label>Categoria</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>Sem categoria</SelectItem>
                  {expenseCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="grid gap-1.5"><Label>Conta de pagamento (opcional)</Label>
              <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>Nenhuma</SelectItem>
                  {(accounts.data ?? []).filter((a) => a.is_active !== false).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="grid gap-1.5"><Label>Responsável</Label>
              <Select value={form.family_member_id} onValueChange={(v) => setForm({ ...form, family_member_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>Família</SelectItem>
                  {(members.data ?? []).filter((m) => m.is_active !== false).map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          <DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
