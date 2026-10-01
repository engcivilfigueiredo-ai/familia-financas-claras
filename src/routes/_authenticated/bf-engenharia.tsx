import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, HandCoins, Pencil, Plus, Trash2 } from "lucide-react";
import { TransactionDialog } from "@/components/transactions/TransactionDialog";
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
import { formatBRL, formatDateBR, formatPercent, parseCurrencyInput, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/bf-engenharia")({
  head: () => ({
    meta: [
      { title: "BF Engenharia | Controle Financeiro Família" },
      {
        name: "description",
        content: "Controle gerencial dos projetos da BF Engenharia: orçamentos, contratos e recebimentos.",
      },
      { property: "og:title", content: "BF Engenharia | Controle Financeiro Família" },
      {
        property: "og:description",
        content: "Controle gerencial dos projetos da BF Engenharia: orçamentos, contratos e recebimentos.",
      },
    ],
  }),
  component: BfEngenhariaPage,
});

interface ProjectRow {
  id: string;
  project_number: string;
  name: string;
  city: string | null;
  state: string | null;
  status: string;
  budget_amount: number;
  budget_date: string | null;
  closing_date: string | null;
  contract_amount: number;
  received_amount: number;
  notes: string | null;
}

const STATUS = [
  { value: "orcamento", label: "Orçamento" },
  { value: "negociacao", label: "Em negociação" },
  { value: "contratado", label: "Contratado" },
  { value: "em_execucao", label: "Em execução" },
  { value: "concluido", label: "Concluído" },
  { value: "perdido", label: "Perdido" },
] as const;

const UF = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

function statusLabel(value: string): string {
  return STATUS.find((s) => s.value === value)?.label ?? value;
}

function statusVariant(value: string): "default" | "secondary" | "outline" | "destructive" {
  if (value === "perdido") return "destructive";
  if (value === "concluido" || value === "contratado" || value === "em_execucao") return "default";
  if (value === "negociacao") return "secondary";
  return "outline";
}

const emptyForm = {
  id: "",
  project_number: "",
  name: "",
  city: "",
  state: "",
  status: "orcamento",
  budget_amount: "",
  budget_date: todayISO(),
  closing_date: "",
  contract_amount: "",
  received_amount: "",
  notes: "",
};

function nextNumber(rows: ProjectRow[]): string {
  const max = rows.reduce((acc, r) => {
    const n = Number(String(r.project_number ?? "").replace(/\D/g, ""));
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `P${String(max + 1).padStart(3, "0")}`;
}

function BfEngenhariaPage() {
  const projects = useTable<ProjectRow>("projects");
  const upsert = useUpsert("projects", "Projeto salvo");
  const remove = useRemove("projects", "Projeto excluído");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [statusFilter, setStatusFilter] = useState("all");
  const [receiveProject, setReceiveProject] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = projects.data ?? [];
    return [...list]
      .filter((p) => statusFilter === "all" || p.status === statusFilter)
      .sort((a, b) => a.project_number.localeCompare(b.project_number));
  }, [projects.data, statusFilter]);

  const totals = useMemo(() => {
    const list = projects.data ?? [];
    const budget = list.reduce((s, p) => s + Number(p.budget_amount ?? 0), 0);
    const contract = list.reduce((s, p) => s + Number(p.contract_amount ?? 0), 0);
    const received = list.reduce((s, p) => s + Number(p.received_amount ?? 0), 0);
    return { budget, contract, received, balance: contract - received, count: list.length };
  }, [projects.data]);

  function openNew() {
    setForm({
      ...emptyForm,
      project_number: nextNumber(projects.data ?? []),
      budget_date: todayISO(),
    });
    setOpen(true);
  }

  function openEdit(row: ProjectRow) {
    setForm({
      id: row.id,
      project_number: row.project_number,
      name: row.name,
      city: row.city ?? "",
      state: row.state ?? "",
      status: row.status,
      budget_amount: String(row.budget_amount ?? ""),
      budget_date: row.budget_date ?? "",
      closing_date: row.closing_date ?? "",
      contract_amount: String(row.contract_amount ?? ""),
      received_amount: String(row.received_amount ?? ""),
      notes: row.notes ?? "",
    });
    setOpen(true);
  }

  function save() {
    if (!form.name.trim()) return;
    upsert.mutate(
      {
        ...(form.id ? { id: form.id } : {}),
        project_number: form.project_number.trim() || nextNumber(projects.data ?? []),
        name: form.name.trim(),
        city: form.city.trim() || null,
        state: form.state || null,
        status: form.status,
        budget_amount: parseCurrencyInput(form.budget_amount || "0"),
        budget_date: form.budget_date || null,
        closing_date: form.closing_date || null,
        contract_amount: parseCurrencyInput(form.contract_amount || "0"),
        received_amount: parseCurrencyInput(form.received_amount || "0"),
        notes: form.notes.trim() || null,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="BF Engenharia"
        description="Controle gerencial dos projetos: orçamentos, contratos e recebimentos."
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar orçamento
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Orçamentos ({totals.count})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatBRL(totals.budget)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Valor contratado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatBRL(totals.contract)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recebido</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatBRL(totals.received)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Saldo a receber
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{formatBRL(totals.balance)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {STATUS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {projects.isLoading ? (
        <LoadingState rows={4} />
      ) : projects.isError ? (
        <ErrorState
          message={(projects.error as Error)?.message}
          onRetry={() => projects.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhum projeto cadastrado"
          description="Adicione o primeiro orçamento para começar o controle gerencial."
          icon={<Building2 className="h-6 w-6" />}
          action={
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar orçamento
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Orçamento</TableHead>
                  <TableHead>Data orçamento</TableHead>
                  <TableHead>Fechamento</TableHead>
                  <TableHead className="text-right">Contrato</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const contract = Number(row.contract_amount ?? 0);
                  const received = Number(row.received_amount ?? 0);
                  const balance = contract - received;
                  const pct = contract > 0 ? (received / contract) * 100 : 0;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.project_number}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[row.city, row.state].filter(Boolean).join(" / ") || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatBRL(Number(row.budget_amount))}
                      </TableCell>
                      <TableCell className="text-sm">{formatDateBR(row.budget_date)}</TableCell>
                      <TableCell className="text-sm">{formatDateBR(row.closing_date)}</TableCell>
                      <TableCell className="text-right">{formatBRL(contract)}</TableCell>
                      <TableCell className="text-right">
                        {formatBRL(received)}
                        {contract > 0 ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({formatPercent(pct, 0)})
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">{formatBRL(balance)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Registrar recebimento"
                            aria-label="Registrar recebimento"
                            onClick={() => setReceiveProject(row.id)}
                          >
                            <HandCoins className="h-4 w-4 text-primary" />
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
                            onConfirm={() => remove.mutate(row.id)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <TransactionDialog
        open={receiveProject !== null}
        onOpenChange={(o) => {
          if (!o) setReceiveProject(null);
        }}
        initialKind="receita"
        initialProjectId={receiveProject}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {form.id ? `Editar projeto ${form.project_number}` : "Adicionar orçamento"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="bf-number">Número</Label>
              <Input
                id="bf-number"
                value={form.project_number}
                onChange={(e) => setForm({ ...form, project_number: e.target.value })}
                placeholder="P001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bf-name">Nome do projeto</Label>
              <Input
                id="bf-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Residência Alvorada"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bf-city">Cidade</Label>
              <Input
                id="bf-city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="São Paulo"
              />
            </div>
            <div className="grid gap-2">
              <Label>Estado</Label>
              <Select value={form.state} onValueChange={(v) => setForm({ ...form, state: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {UF.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bf-budget">Valor do orçamento</Label>
              <Input
                id="bf-budget"
                value={form.budget_amount}
                onChange={(e) => setForm({ ...form, budget_amount: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bf-bdate">Data do orçamento</Label>
              <Input
                id="bf-bdate"
                type="date"
                value={form.budget_date}
                onChange={(e) => setForm({ ...form, budget_date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bf-cdate">Data de fechamento</Label>
              <Input
                id="bf-cdate"
                type="date"
                value={form.closing_date}
                onChange={(e) => setForm({ ...form, closing_date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bf-contract">Valor do contrato</Label>
              <Input
                id="bf-contract"
                value={form.contract_amount}
                onChange={(e) => setForm({ ...form, contract_amount: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bf-received">Valor recebido</Label>
              <Input
                id="bf-received"
                value={form.received_amount}
                onChange={(e) => setForm({ ...form, received_amount: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="bf-notes">Observações</Label>
              <Input
                id="bf-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Escopo, condições de pagamento..."
              />
            </div>
            {parseCurrencyInput(form.contract_amount || "0") > 0 ? (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Saldo a receber:{" "}
                {formatBRL(
                  parseCurrencyInput(form.contract_amount || "0") -
                    parseCurrencyInput(form.received_amount || "0"),
                )}
              </p>
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
