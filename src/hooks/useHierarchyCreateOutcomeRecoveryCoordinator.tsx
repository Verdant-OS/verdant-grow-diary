import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getHierarchyCreateOutcomeRecoveryRuntimeEpoch,
  adoptLegacyHierarchyCreateOutcomeRecoveryAttempts,
  clearHierarchyCreateOutcomeRecoveryAttempt,
  decideHierarchyCreateOutcomeAbsence,
  getHierarchyCreateOutcomeRecoveryAttempts,
  getHierarchyCreateOutcomeRecoveryRevision,
  hierarchyCreateOutcomeRecoveryKey,
  hierarchyCreateOutcomeRecoveryNotice,
  markHierarchyCreateOutcomeRecoveryAttemptReconciled,
  shouldRecheckHierarchyCreateOutcomeRecovery,
  subscribeHierarchyCreateOutcomeRecovery,
  unmarkHierarchyCreateOutcomeRecoveryAttemptReconciled,
  type HierarchyCreateOutcomeRecoveryRecord,
} from "@/lib/hierarchyCreateOutcomeRecovery";
import {
  confirmHierarchyCreateAttemptRow,
  reconcileHierarchyCreateAttempt,
  type HierarchyCreateAttempt,
  type HierarchyCreateReconciliationResult,
} from "@/lib/hierarchyCreatePersistence";
import { fetchPlants, PLANTS_QUERY_KEY } from "@/hooks/use-plants";
import { fetchTents, TENTS_QUERY_KEY } from "@/hooks/use-tents";

/** A post-confirmation canonical list read that is safe to expose as the receipt. */
export type HierarchyCreateVisibleListReceipt =
  { status: "visible" } | { status: "not_visible" | "unavailable" };

interface Props {
  readonly ownerId: string | null | undefined;
  /**
   * Grows are provider state rather than a React Query cache. This reader must
   * publish its own generation-protected canonical result before returning a
   * visible receipt.
   */
  readonly refreshGrowsForRecovery: (
    attempt: Extract<HierarchyCreateAttempt, { entity: "grow" }>,
    isCurrentOwner: () => boolean,
  ) => Promise<HierarchyCreateVisibleListReceipt>;
}

interface RecoverPreviousRuntimeHierarchyCreateAttemptOptions {
  readonly attempt: HierarchyCreateAttempt;
  readonly ownerId: string | null | undefined;
  /** Re-check this after every await so a prior account/runtime cannot clear. */
  readonly isCurrentOwner: () => boolean;
  readonly reconcile: (
    attempt: HierarchyCreateAttempt,
  ) => Promise<HierarchyCreateReconciliationResult>;
  readonly refreshVisibleList: (
    attempt: HierarchyCreateAttempt,
    isCurrentOwner: () => boolean,
  ) => Promise<HierarchyCreateVisibleListReceipt>;
  readonly clear: (attempt: HierarchyCreateAttempt) => boolean;
}

/**
 * A confirmed insert alone is not a recovery receipt: the count-bearing
 * visible list can still hold an older empty result. The caller supplies the
 * one canonical list refresh for the relevant entity and clears only after it
 * has published an exact row match.
 */
export async function recoverPreviousRuntimeHierarchyCreateAttempt({
  attempt,
  ownerId,
  isCurrentOwner,
  reconcile,
  refreshVisibleList,
  clear,
}: RecoverPreviousRuntimeHierarchyCreateAttemptOptions): Promise<boolean> {
  if (!ownerId || ownerId !== attempt.ownerId || !isCurrentOwner()) return false;

  const reconciliation = await reconcile(attempt);
  if (
    !isCurrentOwner() ||
    reconciliation.status !== "confirmed" ||
    reconciliation.confirmed.row.id !== attempt.rowId
  ) {
    return false;
  }

  const receipt = await refreshVisibleList(attempt, isCurrentOwner);
  if (!isCurrentOwner() || receipt.status !== "visible") return false;

  return clear(attempt);
}

function visibleReceiptFromRows(
  rows: readonly unknown[],
  attempt: HierarchyCreateAttempt,
): HierarchyCreateVisibleListReceipt {
  return rows.some((row) => confirmHierarchyCreateAttemptRow(row, attempt))
    ? { status: "visible" }
    : { status: "not_visible" };
}

function invalidateGrowScopedVariants(queryClient: QueryClient, entity: "tent" | "plant"): void {
  // The canonical cache is already the visual receipt. Mark scoped variants
  // stale only afterwards; do not start a second asynchronous fetch that could
  // overwrite the receipt before consumers have seen it.
  void queryClient.invalidateQueries({
    queryKey: ["grow", entity === "tent" ? "tents" : "plants"],
    refetchType: "none",
  });
}

export async function refreshTentListForRecovery(
  queryClient: QueryClient,
  attempt: Extract<HierarchyCreateAttempt, { entity: "tent" }>,
  isCurrentOwner: () => boolean,
): Promise<HierarchyCreateVisibleListReceipt> {
  try {
    // A read started before exact confirmation is not a receipt. Cancel the
    // canonical observer request before this direct post-confirmation read so
    // it cannot later replace this published result.
    if (!isCurrentOwner()) return { status: "unavailable" };
    await queryClient.cancelQueries({ queryKey: TENTS_QUERY_KEY, exact: true });
    if (!isCurrentOwner()) return { status: "unavailable" };
    const rows = await fetchTents();
    if (!isCurrentOwner()) return { status: "unavailable" };
    const receipt = visibleReceiptFromRows(rows, attempt);
    if (receipt.status !== "visible") return receipt;
    if (!isCurrentOwner()) return { status: "unavailable" };
    queryClient.setQueryData(TENTS_QUERY_KEY, rows);
    if (!isCurrentOwner()) return { status: "unavailable" };
    invalidateGrowScopedVariants(queryClient, "tent");
    return receipt;
  } catch {
    return { status: "unavailable" };
  }
}

export async function refreshPlantListForRecovery(
  queryClient: QueryClient,
  attempt: Extract<HierarchyCreateAttempt, { entity: "plant" }>,
  isCurrentOwner: () => boolean,
): Promise<HierarchyCreateVisibleListReceipt> {
  try {
    // See the Tent equivalent: a direct read guarantees this starts after the
    // exact RLS confirmation instead of joining an older observer fetch.
    if (!isCurrentOwner()) return { status: "unavailable" };
    await queryClient.cancelQueries({ queryKey: PLANTS_QUERY_KEY, exact: true });
    if (!isCurrentOwner()) return { status: "unavailable" };
    const rows = await fetchPlants();
    if (!isCurrentOwner()) return { status: "unavailable" };
    const receipt = visibleReceiptFromRows(rows, attempt);
    if (receipt.status !== "visible") return receipt;
    if (!isCurrentOwner()) return { status: "unavailable" };
    queryClient.setQueryData(PLANTS_QUERY_KEY, rows);
    if (!isCurrentOwner()) return { status: "unavailable" };
    invalidateGrowScopedVariants(queryClient, "plant");
    return receipt;
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * One provider-level coordinator owns prior-runtime recovery. Creator hooks
 * intentionally stay passive: a same-runtime or BFCache-restored form keeps
 * the durable fence, while a later runtime can reconcile once and then obtain
 * a canonical visual-list receipt before it releases the exact attempt.
 */
export function HierarchyCreateOutcomeRecoveryCoordinator({
  ownerId,
  refreshGrowsForRecovery,
}: Props) {
  const queryClient = useQueryClient();
  const ownerLifetimeRef = useRef({ ownerId, active: false });
  if (ownerLifetimeRef.current.ownerId !== ownerId) {
    ownerLifetimeRef.current = { ownerId, active: false };
  }
  const revision = useSyncExternalStore(
    subscribeHierarchyCreateOutcomeRecovery,
    getHierarchyCreateOutcomeRecoveryRevision,
    getHierarchyCreateOutcomeRecoveryRevision,
  );
  const attempts = getHierarchyCreateOutcomeRecoveryAttempts(ownerId);
  const [notice, setNotice] = useState<string | null>(null);
  const [recheckGeneration, setRecheckGeneration] = useState(0);
  const retryableRef = useRef(new Map<string, HierarchyCreateAttempt>());
  const inFlightRef = useRef(new Map<string, HierarchyCreateAttempt>());
  const releasedAbsentEntityRef = useRef<HierarchyCreateAttempt["entity"] | null>(null);
  const recheckPendingRef = useRef(false);
  const seenOwnerRef = useRef(ownerId);
  if (seenOwnerRef.current !== ownerId) {
    seenOwnerRef.current = ownerId;
    releasedAbsentEntityRef.current = null;
    retryableRef.current.clear();
    recheckPendingRef.current = false;
  }

  useEffect(() => {
    if (!ownerId || !attempts.some((record) => record.runtimeEpoch === null)) return;
    adoptLegacyHierarchyCreateOutcomeRecoveryAttempts(ownerId);
  }, [attempts, ownerId]);

  const refreshVisibleList = useCallback(
    async (
      attempt: HierarchyCreateAttempt,
      isCurrentOwner: () => boolean,
    ): Promise<HierarchyCreateVisibleListReceipt> => {
      if (attempt.entity === "grow") return refreshGrowsForRecovery(attempt, isCurrentOwner);
      if (attempt.entity === "tent")
        return refreshTentListForRecovery(queryClient, attempt, isCurrentOwner);
      return refreshPlantListForRecovery(queryClient, attempt, isCurrentOwner);
    },
    [queryClient, refreshGrowsForRecovery],
  );

  useEffect(() => {
    const lifetime = ownerLifetimeRef.current;
    lifetime.active = true;
    return () => {
      lifetime.active = false;
    };
  }, [ownerId]);

  const requestRecheck = useCallback(() => {
    recheckPendingRef.current = true;
    if (retryableRef.current.size === 0) return;
    recheckPendingRef.current = false;
    for (const attempt of retryableRef.current.values()) {
      unmarkHierarchyCreateOutcomeRecoveryAttemptReconciled(attempt);
    }
    retryableRef.current.clear();
    setRecheckGeneration((generation) => generation + 1);
  }, []);

  useEffect(() => {
    if (!ownerId || typeof window === "undefined") return;

    const onOnline = () => {
      if (shouldRecheckHierarchyCreateOutcomeRecovery("online", document.visibilityState)) {
        requestRecheck();
      }
    };
    const onVisibilityChange = () => {
      if (
        shouldRecheckHierarchyCreateOutcomeRecovery("visibilitychange", document.visibilityState)
      ) {
        requestRecheck();
      }
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [ownerId, requestRecheck]);

  useEffect(() => {
    if (!ownerId) {
      setNotice(null);
      return;
    }

    let cancelled = false;
    const inFlight = inFlightRef.current;
    const isCurrentOwner = () => {
      if (cancelled) return false;
      const lifetime = ownerLifetimeRef.current;
      return lifetime.active && lifetime.ownerId === ownerId;
    };
    const priorAttempts = (records: readonly HierarchyCreateOutcomeRecoveryRecord[]) => {
      const epoch = getHierarchyCreateOutcomeRecoveryRuntimeEpoch();
      return records.filter(
        (record) => record.runtimeEpoch !== null && record.runtimeEpoch !== epoch,
      );
    };
    const publishNotice = () => {
      if (!isCurrentOwner()) return;
      const open = priorAttempts(getHierarchyCreateOutcomeRecoveryAttempts(ownerId));
      if (open.length === 0) {
        if (getHierarchyCreateOutcomeRecoveryAttempts(ownerId).length > 0) {
          releasedAbsentEntityRef.current = null;
        }
        const absentEntity = releasedAbsentEntityRef.current;
        setNotice(
          absentEntity ? hierarchyCreateOutcomeRecoveryNotice("absent", absentEntity) : null,
        );
        return;
      }
      const unreachable = open.find((record) =>
        retryableRef.current.has(hierarchyCreateOutcomeRecoveryKey(record.attempt)),
      );
      const checking = open.find((record) =>
        inFlight.has(hierarchyCreateOutcomeRecoveryKey(record.attempt)),
      );
      const entity = (unreachable ?? checking ?? open[0]).attempt.entity;
      const phase = unreachable ? "unavailable" : checking ? "checking" : "paused";
      setNotice(hierarchyCreateOutcomeRecoveryNotice(phase, entity));
    };

    const open = priorAttempts(getHierarchyCreateOutcomeRecoveryAttempts(ownerId));
    for (const record of open) {
      // Same-runtime records (including legacy records adopted above) must
      // remain locked. Only an earlier page runtime is eligible to reconcile.
      const key = hierarchyCreateOutcomeRecoveryKey(record.attempt);
      if (!markHierarchyCreateOutcomeRecoveryAttemptReconciled(record.attempt)) continue;
      retryableRef.current.delete(key);
      inFlight.set(key, record.attempt);

      void (async () => {
        const reconciliation = await reconcileHierarchyCreateAttempt(supabase, record.attempt);
        if (!isCurrentOwner()) return;
        const decision = decideHierarchyCreateOutcomeAbsence(reconciliation.status);
        if (decision === "release_absent") {
          // The confirmed-receipt helper keeps a not_found fence. Absence is
          // a finished read, so this coordinator releases that exact attempt.
          releasedAbsentEntityRef.current = record.attempt.entity;
          inFlight.delete(key);
          const cleared = clearHierarchyCreateOutcomeRecoveryAttempt(record.attempt);
          if (!isCurrentOwner()) return;
          if (!cleared) {
            releasedAbsentEntityRef.current = null;
            unmarkHierarchyCreateOutcomeRecoveryAttemptReconciled(record.attempt);
            retryableRef.current.set(key, record.attempt);
            publishNotice();
            if (recheckPendingRef.current) requestRecheck();
            return;
          }
          publishNotice();
          return;
        }
        if (decision === "retry_later") {
          inFlight.delete(key);
          retryableRef.current.set(key, record.attempt);
          if (!isCurrentOwner()) return;
          publishNotice();
          if (recheckPendingRef.current) requestRecheck();
          return;
        }
        inFlight.delete(key);
        const released = await recoverPreviousRuntimeHierarchyCreateAttempt({
          attempt: record.attempt,
          ownerId,
          isCurrentOwner,
          reconcile: async () => reconciliation,
          refreshVisibleList,
          clear: clearHierarchyCreateOutcomeRecoveryAttempt,
        });
        if (!isCurrentOwner()) return;
        if (released) releasedAbsentEntityRef.current = null;
        publishNotice();
      })();
    }
    publishNotice();

    return () => {
      cancelled = true;
      for (const attempt of inFlight.values()) {
        unmarkHierarchyCreateOutcomeRecoveryAttemptReconciled(attempt);
      }
      inFlight.clear();
    };
  }, [ownerId, refreshVisibleList, requestRecheck, recheckGeneration, revision]);

  if (!notice) return null;
  return (
    <p
      role="status"
      data-testid="hierarchy-create-outcome-recovery-notice"
      className="mx-4 mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground"
    >
      {notice}
    </p>
  );
}
