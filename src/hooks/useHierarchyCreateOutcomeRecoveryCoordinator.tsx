import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  HIERARCHY_CREATE_OUTCOME_RECOVERY_RUNTIME_EPOCH,
  adoptLegacyHierarchyCreateOutcomeRecoveryAttempts,
  clearHierarchyCreateOutcomeRecoveryAttempt,
  getHierarchyCreateOutcomeRecoveryAttempts,
  getHierarchyCreateOutcomeRecoveryRevision,
  markHierarchyCreateOutcomeRecoveryAttemptReconciled,
  subscribeHierarchyCreateOutcomeRecovery,
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
  useSyncExternalStore(
    subscribeHierarchyCreateOutcomeRecovery,
    getHierarchyCreateOutcomeRecoveryRevision,
    getHierarchyCreateOutcomeRecoveryRevision,
  );
  const attempts = getHierarchyCreateOutcomeRecoveryAttempts(ownerId);

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

  useEffect(() => {
    if (!ownerId) return;

    const isCurrentOwner = () => {
      const lifetime = ownerLifetimeRef.current;
      return lifetime.active && lifetime.ownerId === ownerId;
    };

    for (const record of attempts) {
      // Same-runtime records (including legacy records adopted above) must
      // remain locked. Only an earlier page runtime is eligible to reconcile.
      if (
        record.runtimeEpoch === null ||
        record.runtimeEpoch === HIERARCHY_CREATE_OUTCOME_RECOVERY_RUNTIME_EPOCH ||
        !markHierarchyCreateOutcomeRecoveryAttemptReconciled(record.attempt)
      ) {
        continue;
      }

      void recoverPreviousRuntimeHierarchyCreateAttempt({
        attempt: record.attempt,
        ownerId,
        isCurrentOwner,
        reconcile: (attempt) => reconcileHierarchyCreateAttempt(supabase, attempt),
        refreshVisibleList,
        clear: clearHierarchyCreateOutcomeRecoveryAttempt,
      });
    }
  }, [attempts, ownerId, refreshVisibleList]);

  return null;
}
