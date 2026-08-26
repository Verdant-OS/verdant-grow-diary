import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import type { GrowRow } from "@/lib/db";
import type { User } from "@supabase/supabase-js";
import {
  confirmHierarchyCreateAttemptRow,
  type HierarchyCreateAttempt,
} from "@/lib/hierarchyCreatePersistence";
import {
  HierarchyCreateOutcomeRecoveryCoordinator,
  type HierarchyCreateVisibleListReceipt,
} from "@/hooks/useHierarchyCreateOutcomeRecoveryCoordinator";

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

type PublishedGrowRead =
  { status: "published"; rows: Grow[] } | { status: "stale" | "unavailable" };

/**
 * Active-grow selection is private per authenticated account. The legacy
 * unscoped key is intentionally not read: it cannot be safely attributed to
 * a user and must never carry an old account's grow id into a new session.
 */
function activeGrowStorageKey(ownerId: string | null): string | null {
  return ownerId ? `verdant.activeGrow.${ownerId}` : null;
}

function readActiveGrowId(ownerId: string | null): string | null {
  const storageKey = activeGrowStorageKey(ownerId);
  return storageKey ? localStorage.getItem(storageKey) : null;
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
  const storageKey = activeGrowStorageKey(ownerId);
  const [grows, setGrows] = useState<Grow[]>([]);
  const [activeGrowId, _setActive] = useState<string | null>(() => readActiveGrowId(ownerId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const growReadGenerationRef = useRef(0);

  const setActiveGrowId = (id: string | null) => {
    _setActive(id);
    if (!storageKey) return;
    if (id) localStorage.setItem(storageKey, id);
    else localStorage.removeItem(storageKey);
  };

  /**
   * Only the latest all-grow request may publish state. A prior route's empty
   * read must never overwrite the post-confirmation recovery receipt.
   */
  const readAndPublishGrows = useCallback(
    async (canPublish: () => boolean = () => true): Promise<PublishedGrowRead> => {
      const requestGeneration = ++growReadGenerationRef.current;
      if (!user) {
        setGrows([]);
        setLoading(false);
        setError(null);
        return { status: "unavailable" };
      }
      if (!canPublish()) return { status: "stale" };

      setLoading(true);
      try {
        const { data, error: qErr } = await supabase
          .from("grows")
          .select("*")
          .eq("is_archived", false)
          .order("created_at", { ascending: false });
        if (!canPublish() || requestGeneration !== growReadGenerationRef.current) {
          return { status: "stale" };
        }

        if (qErr) {
          console.error("GrowsProvider.refresh error:", qErr.message);
          setGrows([]);
          setError(qErr.message);
          return { status: "unavailable" };
        }

        const rows = (data as Grow[] | null) ?? [];
        setGrows(rows);
        setError(null);
        return { status: "published", rows };
      } catch (caught) {
        if (!canPublish() || requestGeneration !== growReadGenerationRef.current) {
          return { status: "stale" };
        }
        const message = caught instanceof Error ? caught.message : "Unable to load grows";
        console.error("GrowsProvider.refresh error:", message);
        setGrows([]);
        setError(message);
        return { status: "unavailable" };
      } finally {
        if (canPublish() && requestGeneration === growReadGenerationRef.current) setLoading(false);
      }
    },
    [user],
  );

  const refresh = useCallback(async () => {
    await readAndPublishGrows();
  }, [readAndPublishGrows]);

  const refreshGrowsForRecovery = useCallback(
    async (
      attempt: Extract<HierarchyCreateAttempt, { entity: "grow" }>,
      isCurrentOwner: () => boolean,
    ): Promise<HierarchyCreateVisibleListReceipt> => {
      if (!user || attempt.ownerId !== user.id || !isCurrentOwner())
        return { status: "unavailable" };
      const result = await readAndPublishGrows(isCurrentOwner);
      if (!isCurrentOwner() || result.status !== "published") return { status: "unavailable" };
      return result.rows.some((row) => confirmHierarchyCreateAttemptRow(row, attempt))
        ? { status: "visible" }
        : { status: "not_visible" };
    },
    [readAndPublishGrows, user],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-select first grow if none selected
  useEffect(() => {
    if (!activeGrowId && grows.length > 0) setActiveGrowId(grows[0].id);
    if (activeGrowId && grows.length > 0 && !grows.find((g) => g.id === activeGrowId))
      setActiveGrowId(grows[0].id);
  }, [grows, activeGrowId]);

  const activeGrow = grows.find((g) => g.id === activeGrowId) ?? null;

  return (
    <GrowsCtx.Provider
      value={{ grows, activeGrowId, setActiveGrowId, activeGrow, refresh, loading, error }}
    >
      <HierarchyCreateOutcomeRecoveryCoordinator
        ownerId={ownerId}
        refreshGrowsForRecovery={refreshGrowsForRecovery}
      />
      {children}
    </GrowsCtx.Provider>
  );
}
export const useGrows = () => useContext(GrowsCtx);
