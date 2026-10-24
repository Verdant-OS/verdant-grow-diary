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
import { partitionGrowsByArchive } from "@/lib/archivedGrowQuickLogRules";
import {
  confirmHierarchyCreateAttemptRow,
  type HierarchyCreateAttempt,
} from "@/lib/hierarchyCreatePersistence";
import {
  HierarchyCreateOutcomeRecoveryCoordinator,
  type HierarchyCreateVisibleListReceipt,
} from "@/hooks/useHierarchyCreateOutcomeRecoveryCoordinator";
import { reportErrorWhenReady } from "@/lib/errorReporter";
import {
  AUTH_SETTLE_WAIT_MS,
  GROW_READ_ATTEMPT_DEADLINE_MS,
  GROW_READ_BUDGET_MS,
  GrowReadCancelledError,
  classifyGrowReadFailure,
  readWithGrowRetry,
  withTrackedDeadline,
  type GrowReadFailure,
} from "@/lib/growsReadRetryRules";

export type Grow = GrowRow;

interface Ctx {
  grows: Grow[];
  /** Present after the archived-grow partition. Older harnesses omit it. */
  archivedGrows?: Grow[];
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

function publishGrowReadFailure(failure: GrowReadFailure): void {
  console.error("GrowsProvider.refresh error:", failure.kind, failure.code);
  void reportErrorWhenReady(new Error("grows_read_failed"), {
    source: "grows_provider",
    handled: true,
    failureKind: failure.kind,
    failureCode: failure.code,
  });
}

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
  const { user, loading } = useAuth();
  return (
    <GrowsProviderForOwner key={user?.id ?? "signed-out"} user={user} authLoading={loading}>
      {children}
    </GrowsProviderForOwner>
  );
}

function GrowsProviderForOwner({
  children,
  user,
  authLoading,
}: {
  children: ReactNode;
  user: User | null;
  authLoading: boolean;
}) {
  const ownerId = user?.id ?? null;
  const storageKey = activeGrowStorageKey(ownerId);
  const [grows, setGrows] = useState<Grow[]>([]);
  const [archivedGrows, setArchivedGrows] = useState<Grow[]>([]);
  const [activeGrowId, _setActive] = useState<string | null>(() => readActiveGrowId(ownerId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authWaitExpired, setAuthWaitExpired] = useState(false);
  const growReadGenerationRef = useRef(0);
  const retryCancelsRef = useRef<Array<() => void>>([]);

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
        setArchivedGrows([]);
        setLoading(false);
        setError(null);
        return { status: "unavailable" };
      }
      if (!canPublish()) return { status: "stale" };

      setLoading(true);
      const stillCurrent = () =>
        canPublish() && requestGeneration === growReadGenerationRef.current;
      const startedAt = Date.now();
      try {
        const outcome = await readWithGrowRetry(
          async () => {
            if (!stillCurrent()) return { ok: true, value: null };
            const remaining = GROW_READ_BUDGET_MS - (Date.now() - startedAt);
            if (remaining <= 0) {
              return {
                ok: false,
                failure: { kind: "timeout", code: "critical_read_deadline" } as const,
              };
            }
            try {
              const { data, error: qErr } = await withTrackedDeadline(
                supabase.from("grows").select("*").order("created_at", { ascending: false }),
                Math.min(GROW_READ_ATTEMPT_DEADLINE_MS, remaining),
                (cancel) => {
                  retryCancelsRef.current.push(cancel);
                },
              );
              if (qErr) return { ok: false, failure: classifyGrowReadFailure(qErr) };
              return { ok: true, value: (data as Grow[] | null) ?? [] };
            } catch (caught) {
              if (caught instanceof GrowReadCancelledError || !stillCurrent()) {
                return { ok: true, value: null };
              }
              return { ok: false, failure: classifyGrowReadFailure(caught) };
            }
          },
          {
            shouldStop: () => !stillCurrent(),
            onDelay: (cancel) => {
              retryCancelsRef.current.push(cancel);
            },
          },
        );
        if (!stillCurrent()) return { status: "stale" };
        if (!outcome.ok) {
          if (outcome.stopped) return { status: "stale" };
          publishGrowReadFailure(outcome.failure);
          setGrows([]);
          setArchivedGrows([]);
          setError(
            outcome.failure.kind === "timeout" ? "critical_read_deadline" : "Unable to load grows",
          );
          return { status: "unavailable" };
        }
        if (outcome.value === null) return { status: "stale" };
        const partitioned = partitionGrowsByArchive(outcome.value);
        setGrows(partitioned.active);
        setArchivedGrows(partitioned.archived);
        setError(null);
        return { status: "published", rows: partitioned.active };
      } finally {
        if (stillCurrent()) setLoading(false);
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
    if (!authLoading) {
      setAuthWaitExpired(false);
      return;
    }
    const timer = setTimeout(() => setAuthWaitExpired(true), AUTH_SETTLE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [authLoading]);

  useEffect(() => {
    if (authLoading && !authWaitExpired) return;
    void refresh();
    return () => {
      growReadGenerationRef.current += 1;
      for (const cancel of retryCancelsRef.current) cancel();
      retryCancelsRef.current = [];
    };
  }, [authLoading, authWaitExpired, refresh]);

  // Auto-select first grow if none selected; clear after a successful read with no active grows
  useEffect(() => {
    if (!activeGrowId && grows.length > 0) setActiveGrowId(grows[0].id);
    if (activeGrowId && grows.length > 0 && !grows.find((g) => g.id === activeGrowId))
      setActiveGrowId(grows[0].id);
    if (activeGrowId && !loading && !error && grows.length === 0) setActiveGrowId(null);
  }, [grows, activeGrowId, loading, error]);

  const activeGrow = grows.find((g) => g.id === activeGrowId) ?? null;

  return (
    <GrowsCtx.Provider
      value={{
        grows,
        archivedGrows,
        activeGrowId,
        setActiveGrowId,
        activeGrow,
        refresh,
        loading,
        error,
      }}
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
