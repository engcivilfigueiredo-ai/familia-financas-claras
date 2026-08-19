import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ScopeView = "mine" | "family";

interface ScopeCtx {
  view: ScopeView;
  setView: (v: ScopeView) => void;
  memberId: string | null;
  setMemberId: (id: string | null) => void;
  /** True when the row belongs to the current scope. */
  matches: (familyMemberId: string | null | undefined) => boolean;
}

const Ctx = createContext<ScopeCtx | null>(null);

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ScopeView>("family");
  const [memberId, setMemberId] = useState<string | null>(null);

  useEffect(() => {
    const savedView = window.localStorage.getItem("cff:view");
    const savedMember = window.localStorage.getItem("cff:member");
    if (savedView === "mine" || savedView === "family") setView(savedView);
    if (savedMember) setMemberId(savedMember);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("cff:view", view);
  }, [view]);

  useEffect(() => {
    if (memberId) window.localStorage.setItem("cff:member", memberId);
  }, [memberId]);

  const value = useMemo<ScopeCtx>(
    () => ({
      view,
      setView,
      memberId,
      setMemberId,
      matches: (familyMemberId) => {
        if (view === "family") return true;
        if (!memberId) return true;
        return familyMemberId === memberId;
      },
    }),
    [view, memberId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScope(): ScopeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useScope precisa estar dentro de ScopeProvider");
  return ctx;
}
