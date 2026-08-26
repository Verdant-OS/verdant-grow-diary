import { useCallback, useSyncExternalStore } from "react";
import {
  getHierarchyCreateOutcomeRecoveryAttempts,
  getHierarchyCreateOutcomeRecoveryRevision,
  recordHierarchyCreateOutcomeRecoveryAttempt,
  subscribeHierarchyCreateOutcomeRecovery,
} from "@/lib/hierarchyCreateOutcomeRecovery";
import type { HierarchyCreateAttempt } from "@/lib/hierarchyCreatePersistence";

interface Props {
  readonly ownerId: string | null | undefined;
}

/**
 * Exposes the shared owner-wide fence to every hierarchy creator. It is
 * deliberately passive: prior-runtime reconciliation belongs to the one
 * provider-level coordinator, so a creator remount can never release a form
 * whose original page runtime may still be alive through BFCache.
 */
export function useHierarchyCreateOutcomeRecovery({ ownerId }: Props) {
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

  return { createOutcomeUnknown, recordUnknownCreateOutcome };
}
