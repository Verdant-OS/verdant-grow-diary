import { useMemo } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  createSensorsPageSession,
  reconcileSensorsSelection,
  selectSensorsTent,
  initializeSensorsDraft,
  updateSensorsDraft,
  changeSensorsDraftTarget,
  claimSensorsSave,
  settleSensorsSave,
  STANDARD_MANUAL_CORRECTION_IDENTITY,
  type SensorsPageSession,
  type ReconcileSensorsSelectionInput,
  type InitializeSensorsDraftInput,
  type ChangeSensorsDraftTargetInput,
  type SensorsDraftIdentity,
  type SensorsDraftUpdater,
  type SensorsManualDraft,
  type ManualSnapshotPayloads,
  type SensorsSaveClaim,
  type SensorsSaveClaimResult,
  type SettleSensorsSaveInput,
} from "@/lib/sensorsPageSessionRules";
import {
  readPendingManualSnapshot,
  claimPendingManualSnapshot,
  clearPendingManualSnapshot,
  restoreManualSnapshotValues,
  MANUAL_RECOVERY_STORAGE_ERROR,
  MANUAL_RECOVERY_PREVIOUS_PENDING,
  MANUAL_RECOVERY_CLEAR_ERROR,
  type PendingManualSnapshot,
} from "@/lib/manualSensorPendingSnapshotStore";

// Counter lifetime follows the router QueryClient, not a mounted protected page.
// A clear/new same-owner session can never match a detached controller's epoch.
const clientGenerations = new WeakMap<QueryClient, number>();

export interface SensorsPageSessionController {
  getSnapshot: () => SensorsPageSession | null;
  subscribe: (listener: () => void) => () => void;
  reconcileSelection: (input: ReconcileSensorsSelectionInput) => void;
  selectTent: (
    tentId: string,
    intentKey: string,
    tents: ReconcileSensorsSelectionInput["tents"],
  ) => void;
  getOrInitializeDraft: (input: InitializeSensorsDraftInput) => SensorsManualDraft | null;
  updateDraft: (
    identity: SensorsDraftIdentity,
    update: SensorsDraftUpdater,
  ) => SensorsManualDraft | null;
  changeDraftTarget: (
    identity: SensorsDraftIdentity,
    input: ChangeSensorsDraftTargetInput,
  ) => SensorsManualDraft | null;
  claimSave: (
    identity: SensorsDraftIdentity,
    payloads: ManualSnapshotPayloads,
  ) => SensorsSaveClaimResult;
  settleSave: (claim: SensorsSaveClaim, result: SettleSensorsSaveInput) => boolean;
  retryRecovery: () => void;
}

export function createSensorsPageSessionController(
  client: QueryClient,
  ownerId: string | null | undefined,
): SensorsPageSessionController | null {
  if (typeof ownerId !== "string" || !ownerId.trim()) return null;
  const key = ["sensors-page-session", ownerId.trim()] as const;
  const keyText = JSON.stringify(key);
  let initial = client.getQueryData<SensorsPageSession>(key);
  let pendingToRestore: PendingManualSnapshot | null = null;
  let confirmedToClear: PendingManualSnapshot | null = null;
  if (!initial) {
    const generation = (clientGenerations.get(client) ?? 0) + 1;
    clientGenerations.set(client, generation);
    // This cache contains local work, not a server query. An inactive-query
    // timeout must not discard unsaved fields or an unresolved write identity.
    // Keep our frozen record/claim references intact. React Query's structural
    // sharing would rebuild changed plain objects outside these boundaries.
    client.setQueryDefaults(key, { gcTime: Infinity, structuralSharing: false });
    initial = createSensorsPageSession(generation);
    const recovery = readPendingManualSnapshot(ownerId);
    if (recovery.status === "blocked")
      initial = { ...initial, recoveryError: MANUAL_RECOVERY_STORAGE_ERROR };
    if (recovery.status === "pending") pendingToRestore = recovery.record;
    client.setQueryData(key, initial);
  }
  const generation = initial.generation;
  const getSnapshot = (): SensorsPageSession | null => {
    const current = client.getQueryData<SensorsPageSession>(key);
    return current?.generation === generation ? current : null;
  };
  const update = (
    apply: (session: SensorsPageSession) => SensorsPageSession,
  ): SensorsPageSession | null => {
    const before = getSnapshot();
    if (!before) return null;
    const next = apply(before);
    if (next === before) return getSnapshot() === before ? before : null;
    // Never resurrect a key removed by the synchronous auth identity fence.
    // Checking exact record identity also fences an updater that triggered a
    // nested update/clear before it returned.
    let accepted = false;
    client.setQueryData<SensorsPageSession>(key, (current) => {
      if (current !== before || current.generation !== generation) return current;
      accepted = true;
      return next;
    });
    return accepted ? getSnapshot() : null;
  };
  const matchingDraft = (
    identity: SensorsDraftIdentity,
    snapshot = getSnapshot(),
  ): SensorsManualDraft | null => {
    const draft = snapshot?.draft;
    return draft && draft.identity.epoch === identity.epoch && draft.identity.id === identity.id
      ? draft
      : null;
  };
  const recordFor = (payloads: ManualSnapshotPayloads): PendingManualSnapshot => ({
    version: 1,
    ownerId,
    payloads,
  });
  // Preserve the existing explicit edit/target-change behavior. Only an idle
  // draft deliberately replaced by the grower can retire its stored identity.
  // An in-flight operation remains recoverable until its receipt settles.
  const updateDraftContext = (apply: (session: SensorsPageSession) => SensorsPageSession) =>
    update((session) => {
      const next = apply(session);
      const pending = session.draft?.values.pendingStandardSnapshot;
      const nextPending =
        next.draft?.values.pendingStandardSnapshot?.revision === next.draft?.values.revision
          ? next.draft?.values.pendingStandardSnapshot
          : undefined;
      if (
        next !== session &&
        !session.inFlight &&
        pending &&
        JSON.stringify(pending.payloads) !== JSON.stringify(nextPending?.payloads)
      ) {
        const stored = readPendingManualSnapshot(ownerId);
        if (stored.status !== "empty" && !clearPendingManualSnapshot(recordFor(pending.payloads)))
          return { ...session, recoveryError: MANUAL_RECOVERY_STORAGE_ERROR };
      }
      return next;
    });
  return {
    getSnapshot,
    subscribe: (listener) =>
      client.getQueryCache().subscribe((event) => {
        if (JSON.stringify(event.query.queryKey) === keyText) listener();
      }),
    reconcileSelection: (input) => {
      updateDraftContext((session) => reconcileSensorsSelection(session, input));
    },
    selectTent: (tentId, intentKey, tents) => {
      updateDraftContext((session) => selectSensorsTent(session, tentId, intentKey, tents));
    },
    getOrInitializeDraft: (input) => {
      const recovery = pendingToRestore;
      // Resolve the initial page intent first. Otherwise its mount effect
      // could replace a just-restored original tent with the URL's new tent.
      if (recovery && getSnapshot()?.selection.appliedIntentKey === null) return null;
      if (
        recovery &&
        (input.correctionIdentity !== STANDARD_MANUAL_CORRECTION_IDENTITY ||
          !input.ownedTentIds.includes(recovery.payloads[0].tent_id))
      ) {
        update((session) =>
          session.recoveryError
            ? session
            : {
                ...session,
                recoveryError:
                  "The unconfirmed manual snapshot's original tent is unavailable here. Return to its owned tent before retrying recovery.",
              },
        );
        return null;
      }
      const result = updateDraftContext((session) =>
        initializeSensorsDraft(
          session,
          recovery
            ? {
                ...input,
                defaultTentId: recovery.payloads[0].tent_id,
                initial: restoreManualSnapshotValues(recovery),
              }
            : input,
        ),
      );
      const draft = result?.draft;
      if (recovery && draft?.values.pendingStandardSnapshot) pendingToRestore = null;
      return draft?.identity.epoch === input.epoch &&
        draft.correctionIdentity === input.correctionIdentity
        ? draft
        : null;
    },
    updateDraft: (identity, apply) =>
      matchingDraft(
        identity,
        updateDraftContext((session) => updateSensorsDraft(session, identity, apply)),
      ),
    changeDraftTarget: (identity, input) => {
      if (!matchingDraft(identity)) return null;
      const result = updateDraftContext((session) =>
        changeSensorsDraftTarget(session, identity, input),
      );
      return result?.draft?.tentId === input.tentId &&
        result.draft.correctionIdentity === input.correctionIdentity
        ? result.draft
        : null;
    },
    claimSave: (identity, payloads) => {
      let result: SensorsSaveClaimResult = { status: "stale" };
      const accepted = update((session) => {
        if (session.recoveryError) return session;
        const claimed = claimSensorsSave(session, identity, payloads);
        if (
          claimed.result.status === "claimed" &&
          claimed.result.claim.correctionIdentity === STANDARD_MANUAL_CORRECTION_IDENTITY
        ) {
          const stored = claimPendingManualSnapshot(recordFor(claimed.result.claim.payloads));
          if (stored.status !== "claimed")
            return {
              ...session,
              recoveryError:
                stored.status === "pending"
                  ? MANUAL_RECOVERY_PREVIOUS_PENDING
                  : MANUAL_RECOVERY_STORAGE_ERROR,
            };
        }
        result = claimed.result;
        return claimed.session;
      });
      return accepted ? result : { status: "stale" };
    },
    settleSave: (claim, result) => {
      let settled = false;
      const accepted = update((session) => {
        const next = settleSensorsSave(session, claim, result);
        settled = next !== session;
        if (
          settled &&
          result.status === "success" &&
          claim.correctionIdentity === STANDARD_MANUAL_CORRECTION_IDENTITY
        ) {
          const record = recordFor(claim.payloads);
          if (!clearPendingManualSnapshot(record)) {
            confirmedToClear = record;
            return { ...next, recoveryError: MANUAL_RECOVERY_CLEAR_ERROR };
          }
        }
        return next;
      });
      return accepted !== null && settled;
    },
    retryRecovery: () => {
      const current = getSnapshot();
      if (!current || current.inFlight) return;
      const stored = readPendingManualSnapshot(ownerId);
      if (confirmedToClear) {
        if (stored.status !== "empty" && !clearPendingManualSnapshot(confirmedToClear)) return;
        confirmedToClear = null;
        update((session) => ({ ...session, recoveryError: undefined }));
        return;
      }
      if (stored.status === "blocked") return;
      if (stored.status === "empty") {
        update((session) => ({ ...session, recoveryError: undefined }));
        return;
      }
      pendingToRestore = stored.status === "pending" ? stored.record : null;
      update((session) => ({
        ...session,
        recoveryError: undefined,
        draft: null,
        selection: { ...session.selection, draftEpoch: session.selection.draftEpoch + 1 },
      }));
    },
  };
}

export function useSensorsPageSession(
  ownerId: string | null | undefined,
): SensorsPageSessionController | null {
  const client = useQueryClient();
  return useMemo(() => createSensorsPageSessionController(client, ownerId), [client, ownerId]);
}
