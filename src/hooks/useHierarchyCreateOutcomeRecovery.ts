import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HIERARCHY_CREATE_OUTCOME_RECOVERY_RUNTIME_EPOCH,
  adoptLegacyHierarchyCreateOutcomeRecoveryAttempts,
  clearHierarchyCreateOutcomeRecoveryAttempt,
  getHierarchyCreateOutcomeRecoveryAttempts,
  getHierarchyCreateOutcomeRecoveryRevision,
  markHierarchyCreateOutcomeRecoveryAttemptReconciled,
  recordHierarchyCreateOutcomeRecoveryAttempt,
  subscribeHierarchyCreateOutcomeRecovery,
} from "@/lib/hierarchyCreateOutcomeRecovery";
import {
  reconcileHierarchyCreateAttempt,
  type HierarchyCreateAttempt,
} from "@/lib/hierarchyCreatePersistence";

interface Props {
  readonly ownerId: string | null | undefined;
  readonly client: Pick<SupabaseClient, "from">;
}

/**
 * Holds every hierarchy creator for an owner behind one retry fence. A record
 * created in this page runtime is never reconciled here: its original form
 * might still be mounted elsewhere. Only a record inherited from a different
 * page runtime receives one exact owner-scoped RLS re-read.
 */
export function useHierarchyCreateOutcomeRecovery({ ownerId, client }: Props) {
  useSyncExternalStore(
    subscribeHierarchyCreateOutcomeRecovery,
    getHierarchyCreateOutcomeRecoveryRevision,
    getHierarchyCreateOutcomeRecoveryRevision,
  );
  // This subscription re-renders every mounted creator when another surface
  // records or clears the shared owner fence.
  const attempts = getHierarchyCreateOutcomeRecoveryAttempts(ownerId);
  const createOutcomeUnknown = attempts.length > 0;

  const recordUnknownCreateOutcome = useCallback(
    (attempt: HierarchyCreateAttempt) => {
      if (attempt.ownerId !== ownerId) return;
      recordHierarchyCreateOutcomeRecoveryAttempt(attempt);
    },
    [ownerId],
  );

  useEffect(() => {
    if (!ownerId || !attempts.some((record) => record.runtimeEpoch === null)) return;
    adoptLegacyHierarchyCreateOutcomeRecoveryAttempts(ownerId);
  }, [attempts, ownerId]);

  useEffect(() => {
    if (!ownerId) return;

    for (const record of attempts) {
      // A same-runtime attempt stays locked even if a different route or
      // surface remounts. A legacy record is adopted by the effect above.
      if (
        record.runtimeEpoch === null ||
        record.runtimeEpoch === HIERARCHY_CREATE_OUTCOME_RECOVERY_RUNTIME_EPOCH ||
        !markHierarchyCreateOutcomeRecoveryAttemptReconciled(record.attempt)
      ) {
        continue;
      }

      void reconcileHierarchyCreateAttempt(client, record.attempt).then((result) => {
        if (result.status === "confirmed") {
          // This callback intentionally has no mount/active guard. Exact RLS
          // confirmation is durable, and a navigation cannot make clearing a
          // different exact record safe or unsafe.
          clearHierarchyCreateOutcomeRecoveryAttempt(record.attempt);
        }
      });
    }
  }, [attempts, client, ownerId]);

  return { createOutcomeUnknown, recordUnknownCreateOutcome };
}
