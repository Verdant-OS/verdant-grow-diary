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
}

export function createSensorsPageSessionController(
  client: QueryClient,
  ownerId: string | null | undefined,
): SensorsPageSessionController | null {
  if (typeof ownerId !== "string" || !ownerId.trim()) return null;
  const key = ["sensors-page-session", ownerId.trim()] as const;
  const keyText = JSON.stringify(key);
  let initial = client.getQueryData<SensorsPageSession>(key);
  if (!initial) {
    const generation = (clientGenerations.get(client) ?? 0) + 1;
    clientGenerations.set(client, generation);
    // This cache contains local work, not a server query. An inactive-query
    // timeout must not discard unsaved fields or an unresolved write identity.
    // Keep our frozen record/claim references intact. React Query's structural
    // sharing would rebuild changed plain objects outside these boundaries.
    client.setQueryDefaults(key, { gcTime: Infinity, structuralSharing: false });
    initial = createSensorsPageSession(generation);
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
  return {
    getSnapshot,
    subscribe: (listener) =>
      client.getQueryCache().subscribe((event) => {
        if (JSON.stringify(event.query.queryKey) === keyText) listener();
      }),
    reconcileSelection: (input) => {
      update((session) => reconcileSensorsSelection(session, input));
    },
    selectTent: (tentId, intentKey, tents) => {
      update((session) => selectSensorsTent(session, tentId, intentKey, tents));
    },
    getOrInitializeDraft: (input) => {
      const result = update((session) => initializeSensorsDraft(session, input));
      const draft = result?.draft;
      return draft?.identity.epoch === input.epoch &&
        draft.correctionIdentity === input.correctionIdentity
        ? draft
        : null;
    },
    updateDraft: (identity, apply) =>
      matchingDraft(
        identity,
        update((session) => updateSensorsDraft(session, identity, apply)),
      ),
    changeDraftTarget: (identity, input) => {
      if (!matchingDraft(identity)) return null;
      const result = update((session) => changeSensorsDraftTarget(session, identity, input));
      return result?.draft?.tentId === input.tentId &&
        result.draft.correctionIdentity === input.correctionIdentity
        ? result.draft
        : null;
    },
    claimSave: (identity, payloads) => {
      let result: SensorsSaveClaimResult = { status: "stale" };
      const accepted = update((session) => {
        const claimed = claimSensorsSave(session, identity, payloads);
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
        return next;
      });
      return accepted !== null && settled;
    },
  };
}

export function useSensorsPageSession(
  ownerId: string | null | undefined,
): SensorsPageSessionController | null {
  const client = useQueryClient();
  return useMemo(() => createSensorsPageSessionController(client, ownerId), [client, ownerId]);
}
