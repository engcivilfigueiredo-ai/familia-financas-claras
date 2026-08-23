import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Bell,
  CreditCard,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  PiggyBank,
  Receipt,
  Settings,
  Tags,
  Target,
  TrendingUp,
  Users,
  Wallet,
  FileBarChart,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useScope } from "@/hooks/useScope";
import { useTable } from "@/hooks/useFinance";
import { useSeedDefaults } from "@/hooks/useSeedDefaults";
import { GlobalSearch } from "./GlobalSearch";
import { TransactionDialog, type QuickKind } from "@/components/transactions/TransactionDialog";
import { formatDateBR, todayISO } from "@/lib/format";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/lancamentos", label: "Lançamentos", icon: Receipt },
  { to: "/contas", label: "Contas", icon: Wallet },
  { to: "/cartoes", label: "Cartões", icon: CreditCard },
  { to: "/a-pagar", label: "Contas a pagar", icon: ArrowDownCircle },
  { to: "/a-receber", label: "Contas a receber", icon: ArrowUpCircle },
  { to: "/recorrencias", label: "Recorrências", icon: CalendarClock },
  { to: "/investimentos", label: "Investimentos", icon: TrendingUp },
  { to: "/patrimonio", label: "Patrimônio", icon: Landmark },
  { to: "/orcamento", label: "Orçamento", icon: PiggyBank },
  { to: "/metas", label: "Metas", icon: Target },
  { to: "/relatorios", label: "Relatórios", icon: FileBarChart },
  { to: "/categorias", label: "Categorias", icon: Tags },
  { to: "/familia", label: "Família", icon: Users },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

interface Member {
  id: string;
  name: string;
  is_active: boolean;
}

interface TxRow {
  id: string;
  description: string;
  date: string;
  status: string;
  type: string;
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  return (
    <nav className="flex flex-col gap-1 px-2 pb-6">
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = location.pathname === to;
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-4 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
        <Wallet className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-sidebar-foreground">Controle Financeiro</p>
        <p className="text-xs text-sidebar-foreground/60">Família</p>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const scope = useScope();
  const members = useTable<Member>("family_members");
  const transactions = useTable<TxRow>("transactions");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [kind, setKind] = useState<QuickKind>("despesa");

  useSeedDefaults(user?.id, (user?.user_metadata?.["full_name"] as string) ?? user?.email?.split("@")[0]);

  const activeMembers = useMemo(
    () => (members.data ?? []).filter((m) => m.is_active),
    [members.data],
  );

  const alerts = useMemo(() => {
    const today = todayISO();
    return (transactions.data ?? [])
      .filter(
        (t) =>
          (t.type === "despesa" || t.type === "receita") &&
          t.status !== "pago" &&
          t.date <= todayISOPlus(7),
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8)
      .map((t) => ({
        ...t,
        late: t.date < today,
      }));
  }, [transactions.data]);

  function openQuick(next: QuickKind) {
    setKind(next);
    setDialogOpen(true);
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-y-auto bg-sidebar lg:flex">
        <Brand />
        <NavList />
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-2 px-4 py-3 sm:px-6">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Abrir menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-sidebar p-0">
                <Brand />
                <NavList onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
              <button
                type="button"
                onClick={() => scope.setView("mine")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  scope.view === "mine"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Minhas finanças
              </button>
              <button
                type="button"
                onClick={() => scope.setView("family")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  scope.view === "family"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Família
              </button>
            </div>

            {scope.view === "mine" ? (
              <Select
                value={scope.memberId ?? activeMembers[0]?.id ?? ""}
                onValueChange={(v) => scope.setMemberId(v)}
              >
                <SelectTrigger className="hidden w-40 sm:flex">
                  <SelectValue placeholder="Pessoa" />
                </SelectTrigger>
                <SelectContent>
                  {activeMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <div className="ml-auto flex items-center gap-2">
              <GlobalSearch />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="relative">
                    <Bell className="h-4 w-4" />
                    {alerts.length ? (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
                        {alerts.length}
                      </span>
                    ) : null}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Notificações</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {alerts.length === 0 ? (
                    <div className="px-2 py-4 text-sm text-muted-foreground">
                      Nenhum vencimento próximo.
                    </div>
                  ) : (
                    alerts.map((a) => (
                      <DropdownMenuItem
                        key={a.id}
                        onClick={() => navigate({ to: a.type === "receita" ? "/a-receber" : "/a-pagar" })}
                        className="flex flex-col items-start gap-1"
                      >
                        <span className="text-sm font-medium">{a.description}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          {formatDateBR(a.date)}
                          <Badge variant={a.late ? "destructive" : "secondary"}>
                            {a.late ? "Atrasado" : "A vencer"}
                          </Badge>
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Novo lançamento</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openQuick("despesa")}>
                    <ArrowDownCircle className="mr-2 h-4 w-4" /> Nova despesa
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openQuick("receita")}>
                    <ArrowUpCircle className="mr-2 h-4 w-4" /> Nova receita
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openQuick("transferencia")}>
                    <ArrowLeftRight className="mr-2 h-4 w-4" /> Nova transferência
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openQuick("investimento")}>
                    <TrendingUp className="mr-2 h-4 w-4" /> Nova aplicação
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate({ to: "/cartoes" })}>
                    <CreditCard className="mr-2 h-4 w-4" /> Novo cartão
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate({ to: "/contas" })}>
                    <Wallet className="mr-2 h-4 w-4" /> Nova conta
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                      {(user?.email ?? "?").slice(0, 2).toUpperCase()}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="max-w-[220px] truncate text-xs font-normal text-muted-foreground">
                    {user?.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate({ to: "/configuracoes" })}>
                    <Settings className="mr-2 h-4 w-4" /> Configurações
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      await signOut();
                      navigate({ to: "/auth" });
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>

      <TransactionDialog open={dialogOpen} onOpenChange={setDialogOpen} initialKind={kind} />
    </div>
  );
}

function todayISOPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
