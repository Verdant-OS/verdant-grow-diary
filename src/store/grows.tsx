import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import type { GrowRow } from "@/lib/db";
import type { User } from "@supabase/supabase-js";
import {
  readScopedActiveGrowId,
  writeActiveGrowId,
  resolveActiveGrowAfterLoad,
} from "@/lib/activeGrowStorageRules";

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

function browserStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * A keyed inner provider resets all grow state during the same render that
 * exposes a new auth identity. That prevents a prior account's grow names or
 * active id from reaching Dashboard, Coach, or scoped routes while B's RLS
 * refresh is still in flight.
 */
export function GrowsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <GrowsProviderForOwner key={user?.id ?? "signed-out"} user={user}>
      {children}
    </GrowsProviderForOwner>
  );
}

function GrowsProviderForOwner({ children, user }: { children: ReactNode; user: User | null }) {
  const ownerId = user?.id ?? null;
  const [grows, setGrows] = useState<Grow[]>([]);
  const [activeGrowId, _setActive] = useState<string | null>(() =>
    readScopedActiveGrowId(ownerId, browserStorage()),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setActiveGrowId = useCallback(
    (id: string | null) => {
      _setActive(id);
      writeActiveGrowId({
        userId: ownerId,
        growId: id,
        storage: browserStorage(),
      });
    },
    [ownerId],
  );

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
    void refresh();
  }, [refresh]);

  // Auto-select / migrate bare key / drop stale ids once grows load.
  useEffect(() => {
    if (loading) return;
    const next = resolveActiveGrowAfterLoad({
      userId: ownerId,
      ownedGrowIds: grows.map((g) => g.id),
      currentActiveGrowId: activeGrowId,
      storage: browserStorage(),
    });
    if (next !== activeGrowId) {
      setActiveGrowId(next);
    } else if (next) {
      // Ensure bare legacy key is scrubbed even when scoped id is already correct.
      writeActiveGrowId({
        userId: ownerId,
        growId: next,
        storage: browserStorage(),
      });
    }
  }, [grows, activeGrowId, ownerId, loading, setActiveGrowId]);

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
