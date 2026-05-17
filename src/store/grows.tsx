import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import type { GrowRow } from "@/lib/db";

export type Grow = GrowRow;

interface Ctx {
  grows: Grow[];
  activeGrowId: string | null;
  setActiveGrowId: (id: string | null) => void;
  activeGrow: Grow | null;
  refresh: () => Promise<void>;
  loading: boolean;
}
const GrowsCtx = createContext<Ctx>({} as Ctx);

export function GrowsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [grows, setGrows] = useState<Grow[]>([]);
  const [activeGrowId, _setActive] = useState<string | null>(() => localStorage.getItem("verdant.activeGrow"));
  const [loading, setLoading] = useState(true);

  const setActiveGrowId = (id: string | null) => {
    _setActive(id);
    if (id) localStorage.setItem("verdant.activeGrow", id);
    else localStorage.removeItem("verdant.activeGrow");
  };

  const refresh = useCallback(async () => {
    if (!user) { setGrows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("grows")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: false });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("GrowsProvider.refresh error:", error.message);
      setGrows([]);
    } else {
      setGrows(data ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-select first grow if none selected
  useEffect(() => {
    if (!activeGrowId && grows.length > 0) setActiveGrowId(grows[0].id);
    if (activeGrowId && grows.length > 0 && !grows.find((g) => g.id === activeGrowId)) setActiveGrowId(grows[0].id);
  }, [grows, activeGrowId]);

  const activeGrow = grows.find((g) => g.id === activeGrowId) ?? null;

  return (
    <GrowsCtx.Provider value={{ grows, activeGrowId, setActiveGrowId, activeGrow, refresh, loading }}>
      {children}
    </GrowsCtx.Provider>
  );
}
export const useGrows = () => useContext(GrowsCtx);
