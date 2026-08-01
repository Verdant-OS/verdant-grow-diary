import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import type { GrowRow } from "@/lib/db";
import { ENTRY_CREATED_EVENT } from "@/lib/dailyCheckRefreshRules";
import { growIdFromEntryCreatedDetail } from "@/lib/quickLogPostSaveScopeRules";
import { getStoredActiveGrowId, setStoredActiveGrowId } from "@/lib/activeGrowPreferences";

export type Grow = GrowRow;

interface Ctx {
  grows: Grow[];
  activeGrowId: string | null;
  setActiveGrowId: (id: string | null) => void;
  activeGrow: Grow | null;
  refresh: () => Promise<void>;
  loading: boolean;
  error: string | null;
}
const GrowsCtx = createContext<Ctx>({} as Ctx);

export function GrowsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [grows, setGrows] = useState<Grow[]>([]);
  // Start null until user id is known — never read bare shared key without scoping.
  const [activeGrowId, _setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setActiveGrowId = useCallback(
    (id: string | null) => {
      _setActive(id);
      if (user?.id) {
        setStoredActiveGrowId(user.id, id);
      }
    },
    [user?.id],
  );

  // Load / clear per-user active grow when auth identity changes.
  useEffect(() => {
    if (!user?.id) {
      _setActive(null);
      return;
    }
    _setActive(getStoredActiveGrowId(user.id));
  }, [user?.id]);

  const refresh = useCallback(async () => {
    if (!user) {
      setGrows([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    const { data, error: qErr } = await supabase
      .from("grows")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: false });
    if (qErr) {
      console.error("GrowsProvider.refresh error:", qErr.message);
      setGrows([]);
      setError(qErr.message);
    } else {
      setGrows(data ?? []);
      setError(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-select first grow if none selected (or stored grow is gone).
  useEffect(() => {
    if (!user?.id) return;
    if (!activeGrowId && grows.length > 0) setActiveGrowId(grows[0].id);
    if (activeGrowId && grows.length > 0 && !grows.find((g) => g.id === activeGrowId))
      setActiveGrowId(grows[0].id);
  }, [user?.id, grows, activeGrowId, setActiveGrowId]);

  // After Quick Log (any surface), pin active grow to the grow that received
  // the log so /logs and dashboard scope show the new entry immediately.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onEntry = (event: Event) => {
      const growId = growIdFromEntryCreatedDetail((event as CustomEvent).detail);
      if (!growId) return;
      if (!grows.some((g) => g.id === growId)) return;
      setActiveGrowId(growId);
    };
    window.addEventListener(ENTRY_CREATED_EVENT, onEntry);
    return () => window.removeEventListener(ENTRY_CREATED_EVENT, onEntry);
  }, [grows, setActiveGrowId]);

  const activeGrow = grows.find((g) => g.id === activeGrowId) ?? null;

  return (
    <GrowsCtx.Provider
      value={{ grows, activeGrowId, setActiveGrowId, activeGrow, refresh, loading, error }}
    >
      {children}
    </GrowsCtx.Provider>
  );
}
export const useGrows = () => useContext(GrowsCtx);
