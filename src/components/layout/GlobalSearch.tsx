import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useTable } from "@/hooks/useFinance";
import { formatBRL, formatDateBR } from "@/lib/format";

interface Row {
  id: string;
  name?: string;
  description?: string;
  amount?: number;
  date?: string;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const transactions = useTable<Row>("transactions");
  const accounts = useTable<Row>("accounts");
  const cards = useTable<Row>("credit_cards");
  const investments = useTable<Row>("investments");
  const members = useTable<Row>("family_members");

  const groups = useMemo(
    () => [
      {
        label: "Lançamentos",
        to: "/lancamentos",
        items: (transactions.data ?? []).slice(0, 40).map((t) => ({
          id: t.id,
          label: t.description ?? "",
          hint: `${formatDateBR(t.date ?? "")} · ${formatBRL(Math.abs(Number(t.amount ?? 0)))}`,
        })),
      },
      {
        label: "Contas",
        to: "/contas",
        items: (accounts.data ?? []).map((a) => ({ id: a.id, label: a.name ?? "", hint: "" })),
      },
      {
        label: "Cartões",
        to: "/cartoes",
        items: (cards.data ?? []).map((c) => ({ id: c.id, label: c.name ?? "", hint: "" })),
      },
      {
        label: "Investimentos",
        to: "/investimentos",
        items: (investments.data ?? []).map((i) => ({ id: i.id, label: i.name ?? "", hint: "" })),
      },
      {
        label: "Família",
        to: "/familia",
        items: (members.data ?? []).map((m) => ({ id: m.id, label: m.name ?? "", hint: "" })),
      },
    ],
    [transactions.data, accounts.data, cards.data, investments.data, members.data],
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Buscar...</span>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar lançamentos, contas, cartões, investimentos..." />
        <CommandList>
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={`${group.label}-${item.id}`}
                  value={`${item.label} ${group.label}`}
                  onSelect={() => {
                    setOpen(false);
                    navigate({ to: group.to });
                  }}
                >
                  <span className="truncate">{item.label}</span>
                  {item.hint ? (
                    <span className="ml-auto text-xs text-muted-foreground">{item.hint}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
