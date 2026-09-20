import type {
  ManualEntryInput,
  buildManualReadingPayloads,
} from "@/lib/sensorReadingManualEntryRules";
import {
  convertTemperatureInputString,
  type TemperatureInputUnit,
} from "@/lib/sensorInputUnitConversion";
import {
  normalizePersistedGrowTentId,
  type GrowTentSelectionCandidate,
} from "@/lib/growTentSelectionRules";
import {
  resolveSensorsTentRouteSelection,
  type SensorsTentRouteIntent,
} from "@/lib/sensorRouteTentIntentRules";

export const STANDARD_MANUAL_CORRECTION_IDENTITY = "manual-reading-standard";
export type ManualSnapshotPayloads = ReturnType<typeof buildManualReadingPayloads>;

export interface ManualDraftValues {
  form: ManualEntryInput;
  tempUnitOverride: TemperatureInputUnit | null;
  devicePreset: string;
  deviceCustom: string;
  hasEditedReading: boolean;
  revision: number;
  pendingStandardSnapshot: { revision: number; payloads: ManualSnapshotPayloads } | null;
  saveUnconfirmed: boolean;
  lastSaved: { line: string; capturedAt: string; tentId: string } | null;
}

export interface SensorsDraftIdentity {
  epoch: number;
  id: number;
}
export interface SensorsManualDraft {
  identity: SensorsDraftIdentity;
  tentId: string;
  correctionIdentity: string;
  values: ManualDraftValues;
}
export interface SensorsPageSelection {
  tentId: string | null;
  appliedIntentKey: string | null;
  explicitSelection: { intentKey: string; tentId: string } | null;
  draftEpoch: number;
}
export interface SensorsSaveClaim {
  generation: number;
  id: number;
  identity: SensorsDraftIdentity;
  revision: number;
  tentId: string;
  correctionIdentity: string;
  payloads: ManualSnapshotPayloads;
}
export interface SensorsPageSession {
  generation: number;
  /** Client recovery storage failures must be visible and block a new write. */
  recoveryError?: string;
  selection: SensorsPageSelection;
  draft: SensorsManualDraft | null;
  inFlight: SensorsSaveClaim | null;
  nextDraftId: number;
  nextSaveId: number;
}
export interface ReconcileSensorsSelectionInput {
  intent: SensorsTentRouteIntent | null | undefined;
  intentKey: string;
  tents?: readonly (GrowTentSelectionCandidate | null | undefined)[] | null;
  tentsLoaded: boolean;
}
export interface InitializeSensorsDraftInput {
  epoch: number;
  correctionIdentity: string;
  defaultTentId: string;
  ownedTentIds: readonly string[];
  initial: ManualDraftValues;
}
export interface ChangeSensorsDraftTargetInput {
  tentId: string;
  correctionIdentity: string;
  ownedTentIds: readonly string[];
  values: ManualDraftValues;
}
export type SensorsDraftUpdater = (values: ManualDraftValues) => ManualDraftValues;
export interface SettleSensorsSaveInput {
  status: "success" | "unconfirmed";
  update?: SensorsDraftUpdater;
}
export type SensorsSaveClaimResult =
  { status: "claimed"; claim: SensorsSaveClaim } | { status: "busy" | "stale" };

/** Copy plain client state at the boundary; callers cannot mutate cached payloads. */
function immutableCopy<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy)) as T;
  if (value !== null && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableCopy(item)])),
    ) as T;
  }
  return value;
}

function ownedTentId(
  value: unknown,
  tents: ReconcileSensorsSelectionInput["tents"],
): string | null {
  const id = normalizePersistedGrowTentId(value);
  return id !== null && (tents ?? []).some((tent) => normalizePersistedGrowTentId(tent?.id) === id)
    ? id
    : null;
}

function sameIdentity(left: SensorsDraftIdentity, right: SensorsDraftIdentity): boolean {
  return left.epoch === right.epoch && left.id === right.id;
}

function matchingDraft(
  session: SensorsPageSession,
  identity: SensorsDraftIdentity,
): SensorsManualDraft | null {
  const draft = session.draft;
  return draft &&
    draft.identity.epoch === session.selection.draftEpoch &&
    sameIdentity(draft.identity, identity)
    ? draft
    : null;
}

export function createManualDraftValues(
  form: ManualEntryInput,
  tempUnitOverride: TemperatureInputUnit | null = null,
): ManualDraftValues {
  return immutableCopy({
    form,
    tempUnitOverride,
    devicePreset: "none",
    deviceCustom: "",
    hasEditedReading: false,
    revision: 0,
    pendingStandardSnapshot: null,
    saveUnconfirmed: false,
    lastSaved: null,
  });
}

export function editManualDraftValues(
  values: ManualDraftValues,
  patch: Partial<ManualDraftValues>,
): ManualDraftValues {
  return immutableCopy({
    ...values,
    ...patch,
    revision: values.revision + 1,
    pendingStandardSnapshot: null,
    saveUnconfirmed: false,
    lastSaved: null,
  });
}

/** Changing display units is not a new observation or a new retry identity. */
export function reexpressManualDraftTemperature(
  values: ManualDraftValues,
  next: TemperatureInputUnit,
  currentUnit: TemperatureInputUnit,
): ManualDraftValues {
  const from = values.form.airTempUnit ?? currentUnit;
  if (from === next) return values;
  return Object.freeze({
    ...values,
    tempUnitOverride: next,
    form: immutableCopy({
      ...values.form,
      airTempUnit: next,
      airTemp: convertTemperatureInputString(
        typeof values.form.airTemp === "string"
          ? values.form.airTemp
          : String(values.form.airTemp ?? ""),
        from,
        next,
      ),
    }),
  });
}

export function createSensorsPageSession(generation: number): SensorsPageSession {
  return immutableCopy({
    generation,
    selection: { tentId: null, appliedIntentKey: null, explicitSelection: null, draftEpoch: 0 },
    draft: null,
    inFlight: null,
    nextDraftId: 1,
    nextSaveId: 1,
  });
}

/** Reconcile only a successfully read owned list. URL IDs remain untrusted intent. */
export function reconcileSensorsSelection(
  session: SensorsPageSession,
  input: ReconcileSensorsSelectionInput,
): SensorsPageSession {
  if (!input.tentsLoaded) return session;
  const previous = session.selection;
  const intentChanged = previous.appliedIntentKey !== input.intentKey;
  const explicitSelection = intentChanged ? null : previous.explicitSelection;
  const explicitId =
    explicitSelection?.intentKey === input.intentKey ? explicitSelection.tentId : null;
  const intent =
    input.intent?.requireExactMatch === true
      ? { tentId: explicitId ?? input.intent.tentId, requireExactMatch: true }
      : intentChanged
        ? input.intent
        : null;
  const tentId = resolveSensorsTentRouteSelection({
    intent,
    currentTentId: previous.tentId,
    tents: input.tents,
  });
  const newTargetIntent =
    intentChanged &&
    (input.intent?.requireExactMatch === true ||
      normalizePersistedGrowTentId(input.intent?.tentId) !== null);
  const targetEvent = tentId !== previous.tentId || newTargetIntent;
  const resetDraft =
    targetEvent && (session.draft ? session.draft.tentId !== tentId : tentId !== previous.tentId);
  if (
    !intentChanged &&
    tentId === previous.tentId &&
    !resetDraft &&
    explicitSelection === previous.explicitSelection
  )
    return session;
  return Object.freeze({
    ...session,
    selection: Object.freeze({
      tentId,
      appliedIntentKey: input.intentKey,
      explicitSelection,
      draftEpoch: previous.draftEpoch + (resetDraft ? 1 : 0),
    }),
    draft: resetDraft ? null : session.draft,
  });
}

/** A chip click is conscious replacement of the current route's requested tent. */
export function selectSensorsTent(
  session: SensorsPageSession,
  rawTentId: string,
  intentKey: string,
  tents: ReconcileSensorsSelectionInput["tents"],
): SensorsPageSession {
  const tentId = ownedTentId(rawTentId, tents);
  if (!tentId || session.selection.appliedIntentKey !== intentKey) return session;
  const targetChanged = tentId !== session.selection.tentId;
  const resetDraft = targetChanged && (!session.draft || session.draft.tentId !== tentId);
  return Object.freeze({
    ...session,
    selection: Object.freeze({
      ...session.selection,
      tentId,
      explicitSelection: Object.freeze({ intentKey, tentId }),
      draftEpoch: session.selection.draftEpoch + (resetDraft ? 1 : 0),
    }),
    draft: resetDraft ? null : session.draft,
  });
}

/** Manual dropdown state is distinct from page chips; restore its own validated tent. */
export function initializeSensorsDraft(
  session: SensorsPageSession,
  input: InitializeSensorsDraftInput,
): SensorsPageSession {
  if (input.epoch !== session.selection.draftEpoch) return session;
  const owned = (input.ownedTentIds ?? []).map((id) => ({ id }));
  const existing = session.draft;
  if (
    existing &&
    existing.identity.epoch === input.epoch &&
    existing.correctionIdentity === input.correctionIdentity &&
    ownedTentId(existing.tentId, owned)
  )
    return session;
  const tentId = ownedTentId(input.defaultTentId, owned);
  if (!tentId) return existing ? Object.freeze({ ...session, draft: null }) : session;
  return Object.freeze({
    ...session,
    nextDraftId: session.nextDraftId + 1,
    draft: immutableCopy({
      identity: { epoch: input.epoch, id: session.nextDraftId },
      tentId,
      correctionIdentity: input.correctionIdentity,
      values: input.initial,
    }),
  });
}

export function changeSensorsDraftTarget(
  session: SensorsPageSession,
  identity: SensorsDraftIdentity,
  input: ChangeSensorsDraftTargetInput,
): SensorsPageSession {
  const existing = matchingDraft(session, identity);
  const tentId = ownedTentId(
    input.tentId,
    (input.ownedTentIds ?? []).map((id) => ({ id })),
  );
  if (!existing || !tentId) return session;
  if (existing.tentId === tentId && existing.correctionIdentity === input.correctionIdentity)
    return session;
  return Object.freeze({
    ...session,
    nextDraftId: session.nextDraftId + 1,
    draft: immutableCopy({
      identity: { epoch: identity.epoch, id: session.nextDraftId },
      tentId,
      correctionIdentity: input.correctionIdentity,
      values: input.values,
    }),
  });
}

export function updateSensorsDraft(
  session: SensorsPageSession,
  identity: SensorsDraftIdentity,
  update: SensorsDraftUpdater,
): SensorsPageSession {
  const existing = matchingDraft(session, identity);
  if (!existing) return session;
  const values = update(existing.values);
  if (
    values === existing.values ||
    !Number.isSafeInteger(values.revision) ||
    values.revision < existing.values.revision
  )
    return session;
  return Object.freeze({
    ...session,
    draft: Object.freeze({ ...existing, values: immutableCopy(values) }),
  });
}

export function claimSensorsSave(
  session: SensorsPageSession,
  identity: SensorsDraftIdentity,
  requestedPayloads: ManualSnapshotPayloads,
): { session: SensorsPageSession; result: SensorsSaveClaimResult } {
  if (session.inFlight) return { session, result: { status: "busy" } };
  const draft = matchingDraft(session, identity);
  if (!draft) return { session, result: { status: "stale" } };
  const standard = draft.correctionIdentity === STANDARD_MANUAL_CORRECTION_IDENTITY;
  const pending = draft.values.pendingStandardSnapshot;
  const payloads =
    standard && pending?.revision === draft.values.revision ? pending.payloads : requestedPayloads;
  if (
    !Array.isArray(payloads) ||
    payloads.length === 0 ||
    payloads.some((row) => row.tent_id !== draft.tentId)
  )
    return { session, result: { status: "stale" } };
  const claim = immutableCopy({
    generation: session.generation,
    id: session.nextSaveId,
    identity: draft.identity,
    revision: draft.values.revision,
    tentId: draft.tentId,
    correctionIdentity: draft.correctionIdentity,
    payloads,
  });
  return {
    session: Object.freeze({
      ...session,
      nextSaveId: session.nextSaveId + 1,
      inFlight: claim,
      draft: Object.freeze({
        ...draft,
        values: Object.freeze({
          ...draft.values,
          pendingStandardSnapshot: standard
            ? Object.freeze({ revision: draft.values.revision, payloads: claim.payloads })
            : null,
          saveUnconfirmed: false,
        }),
      }),
    }),
    result: { status: "claimed", claim },
  };
}

/** A completion owns the global claim, but can change only its exact unchanged draft. */
export function settleSensorsSave(
  session: SensorsPageSession,
  claim: SensorsSaveClaim,
  result: SettleSensorsSaveInput,
): SensorsPageSession {
  if (session.generation !== claim.generation || session.inFlight !== claim) return session;
  const current = matchingDraft(session, claim.identity);
  let draft = session.draft;
  if (
    current &&
    current.values.revision === claim.revision &&
    current.tentId === claim.tentId &&
    current.correctionIdentity === claim.correctionIdentity
  ) {
    const values = result.update?.(current.values) ?? current.values;
    draft = Object.freeze({
      ...current,
      values: immutableCopy({
        ...values,
        pendingStandardSnapshot:
          result.status === "success" ? null : current.values.pendingStandardSnapshot,
        saveUnconfirmed:
          result.status === "unconfirmed" &&
          claim.correctionIdentity === STANDARD_MANUAL_CORRECTION_IDENTITY,
      }),
    });
  }
  return Object.freeze({ ...session, inFlight: null, draft });
}
