import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useReducer,
  useState,
  useSyncExternalStore,
} from "react";
import type { SensorsPageSessionController } from "@/hooks/useSensorsPageSession";
import {
  createManualDraftValues,
  editManualDraftValues,
  reexpressManualDraftTemperature,
  STANDARD_MANUAL_CORRECTION_IDENTITY,
  type ManualDraftValues,
  type SensorsManualDraft,
  type SensorsSaveClaim,
} from "@/lib/sensorsPageSessionRules";
import { Link } from "@/lib/react-router-compat";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Gauge,
  History,
  Info,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useTemperatureUnitPreference } from "@/hooks/useTemperatureUnitPreference";
import {
  AIR_TEMP_PLACEHOLDER,
  celsiusToInputString,
  temperatureInputUnitFromPreference,
  TEMPERATURE_INPUT_UNITS,
  TEMPERATURE_UNIT_SYMBOL,
  toFahrenheitInputString,
  type TemperatureInputUnit,
} from "@/lib/sensorInputUnitConversion";
import { buildManualSaveSuccessLine } from "@/lib/manualSensorSaveConfirmation";
import { useInsertSensorReadings } from "@/hooks/useInsertSensorReadings";
import {
  buildManualReadingPayloads,
  manualEntryValueErrors,
  validateManualEntry,
  type ManualEntryInput,
  type ManualReadingMetric,
} from "@/lib/sensorReadingManualEntryRules";
import {
  getManualSensorDeviceOptions,
  normalizeManualSourceNote,
  MAX_MANUAL_DEVICE_NOTE_LEN,
} from "@/lib/manualSensorSourceLabel";
import { evaluateManualSnapshotAdvisor } from "@/lib/manualSensorSnapshotAdvisorRules";
import {
  applyManualEntryBlockingErrors,
  evaluateManualSensorSnapshotQuality,
  type ManualSensorSnapshotInput,
} from "@/lib/manualSensorSnapshotQualityRules";
import ManualSensorSnapshotQualityBadge from "@/components/ManualSensorSnapshotQualityBadge";
import ManualSensorSnapshotReviewPanel from "@/components/ManualSensorSnapshotReviewPanel";
import { reviewManualSensorSnapshot } from "@/lib/sensorSnapshotReviewRules";
import { reviewManualSensorCorrection } from "@/lib/manualSensorCorrectionReviewRules";
import DerivedVpdStatus from "@/components/DerivedVpdStatus";
import {
  validateManualSensorSnapshotFields,
  VPD_CONFLICT_THRESHOLD_KPA,
} from "@/lib/manualSensorSnapshotFieldValidation";
import FirstTentSetupEmptyState from "@/components/FirstTentSetupEmptyState";
import { shouldRequireFirstTentSetup } from "@/lib/firstTentSetupRules";
import { isUuid } from "@/lib/isUuid";
import {
  MANUAL_SENSOR_TRUTH_TITLE,
  MANUAL_SENSOR_TRUTH_SOURCE_LINE,
  MANUAL_SENSOR_TRUTH_NOT_DEVICE_CONTROL_LINE,
  MANUAL_SENSOR_TRUTH_NOT_DIAGNOSIS_LINE,
  MANUAL_SENSOR_TRUTH_MISSING_READINGS_LINE,
} from "@/constants/manualSensorTruthCopy";
import {
  encodeManualCorrectionHash,
  type ManualCorrectionContext,
} from "@/lib/manualSensorCorrectionContext";
import { useAuth } from "@/store/auth";
import { supabase } from "@/integrations/supabase/client";
import { buildManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";
import { createManualCorrectionJournal } from "@/lib/manualSensorCorrectionPendingStore";
import {
  getPendingCorrectionRecovery,
  restoreManualCorrectionDraft,
} from "@/lib/manualSensorCorrectionRecoveryRules";
import {
  submitPendingManualCorrection,
  type ManualCorrectionRpcClient,
} from "@/lib/manualSensorCorrectionService";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";

interface TentOption {
  id: string;
  name: string;
}

interface Props {
  tents: TentOption[];
  defaultTentId?: string;
  successMessage?: string;
  /** When provided, the post-save next-step links Alerts filtered to this grow. */
  growId?: string;
  onSaved?: (meta: { tentId: string; metricsSaved: number; createdAt: string }) => void;
  /**
   * When set, the card runs in correction mode: pre-fills original values,
   * shows a banner referencing the original captured_at, and on save
   * submits one atomic correction operation, retaining the original observation
   * time and MANUAL source. Original sensor_readings rows remain untouched.
   */
  correction?: ManualCorrectionContext | null;
  /** Account-bound runtime continuity supplied only by the Sensors page. */
  session?: SensorsPageSessionController;
}

const EMPTY: ManualEntryInput = {
  airTemp: "",
  humidityPct: "",
  vpdKpa: "",
  co2Ppm: "",
  soilMoisturePct: "",
  ppfd: "",
};

const STANDARD_TARGET_CONTEXT = STANDARD_MANUAL_CORRECTION_IDENTITY;
const subscribeWithoutSession = () => () => {};
const readWithoutSession = () => null;
const CORRECTION_SAVE_UNCONFIRMED_MESSAGE =
  "Manual correction save is unconfirmed. Your readings are still here. Retry the same correction to confirm it.";
const STANDARD_SAVE_UNCONFIRMED_MESSAGE =
  "Manual snapshot save is unconfirmed. Your readings are still here. Retry this snapshot to confirm it.";

function correctionToPrefill(
  ctx: ManualCorrectionContext | null | undefined,
  unit: TemperatureInputUnit,
): ManualEntryInput {
  if (!ctx) return { ...EMPTY, airTempUnit: unit };
  const v = ctx.originalValues;
  const out: ManualEntryInput = { ...EMPTY, airTempUnit: unit };
  if (typeof v.temperature_c === "number") {
    // Stored value is canonical Celsius; render it in the grower's entry unit.
    out.airTemp = celsiusToInputString(v.temperature_c, unit);
  }
  if (typeof v.humidity_pct === "number") out.humidityPct = String(v.humidity_pct);
  if (typeof v.vpd_kpa === "number") out.vpdKpa = String(v.vpd_kpa);
  if (typeof v.co2_ppm === "number") out.co2Ppm = String(v.co2_ppm);
  if (typeof v.soil_moisture_pct === "number") out.soilMoisturePct = String(v.soil_moisture_pct);
  if (typeof v.ppfd === "number") out.ppfd = String(v.ppfd);
  return out;
}

function correctionPrefillFromRestoredMetrics(
  correction: ManualCorrectionContext,
  metrics: ReadonlyArray<ManualReadingMetric>,
): ManualCorrectionContext {
  return {
    ...correction,
    originalValues: Object.fromEntries(metrics.map((row) => [row.metric, row.value])),
  };
}

/** Match standard snapshot restore: canonical °C digits + explicit C override. */
function recoveredCorrectionDraftValues(
  correction: ManualCorrectionContext,
  metrics: ReadonlyArray<ManualReadingMetric>,
): ManualDraftValues {
  return {
    ...createManualDraftValues(
      correctionToPrefill(correctionPrefillFromRestoredMetrics(correction, metrics), "C"),
      "C",
    ),
    hasEditedReading: true,
    saveUnconfirmed: true,
  };
}

export default function ManualSensorReadingCard({
  tents,
  defaultTentId,
  successMessage,
  growId,
  onSaved,
  correction,
  session,
}: Props) {
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;
  const correctionJournal = useMemo(() => createManualCorrectionJournal(), []);
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [, retryCorrectionRecovery] = useReducer((value: number) => value + 1, 0);
  const temperaturePreference = useTemperatureUnitPreference();
  const preferredUnit = temperatureInputUnitFromPreference(temperaturePreference);
  const initialTentId = correction?.tentId ?? defaultTentId ?? tents[0]?.id ?? "";
  const correctionIdentity = correction
    ? encodeManualCorrectionHash(correction)
    : STANDARD_TARGET_CONTEXT;
  const ownedTentIds = useMemo(() => tents.map((tent) => tent.id), [tents]);
  const readCorrectionRecovery = useCallback(() => {
    if (!correction) return null;
    const pending = correctionJournal.read(ownerId);
    if (pending.status !== "pending") return null;
    const restored = restoreManualCorrectionDraft(pending.operation, ownedTentIds);
    return restored && encodeManualCorrectionHash(restored.correction) === correctionIdentity
      ? restored
      : null;
  }, [correction, correctionIdentity, correctionJournal, ownerId, ownedTentIds]);
  const initialValues = useMemo(() => {
    const restored = readCorrectionRecovery();
    if (restored) return recoveredCorrectionDraftValues(restored.correction, restored.metrics);
    return createManualDraftValues(correctionToPrefill(correction, preferredUnit));
  }, [correction, preferredUnit, readCorrectionRecovery]);
  const [localDraft, setLocalDraft] = useState<SensorsManualDraft>(() => ({
    identity: { epoch: 0, id: 0 },
    tentId: initialTentId,
    correctionIdentity,
    values: initialValues,
  }));
  const localDraftRef = useRef(localDraft);
  const sessionState = useSyncExternalStore(
    session?.subscribe ?? subscribeWithoutSession,
    session?.getSnapshot ?? readWithoutSession,
    readWithoutSession,
  );
  const epoch = sessionState?.selection.draftEpoch ?? 0;
  const cachedDraft = sessionState?.draft;
  const draft = session
    ? cachedDraft?.identity.epoch === epoch &&
      cachedDraft.correctionIdentity === correctionIdentity &&
      ownedTentIds.includes(cachedDraft.tentId)
      ? cachedDraft
      : null
    : localDraft;
  const values = draft?.values ?? initialValues;
  const { form, hasEditedReading, devicePreset, deviceCustom, lastSaved, saveUnconfirmed } = values;
  const pendingCorrectionRecovery = ownerId
    ? getPendingCorrectionRecovery(correctionJournal.read(ownerId), ownedTentIds, correction)
    : { status: "none" as const };
  const tentId = draft?.tentId ?? initialTentId;
  // A restored reading carries its explicit unit; preference resolution must
  // not reinterpret the same numeric string after a protected-shell remount.
  const airTempUnit = values.tempUnitOverride ?? form.airTempUnit ?? preferredUnit;
  const [reviewOpen, setReviewOpen] = useState(false);
  const insertBatch = useInsertSensorReadings();
  const isSaving = correctionSaving || insertBatch.isPending || !!sessionState?.inFlight;
  const recoveryError = sessionState?.recoveryError;
  const isCorrection = !!correction;
  const saveInFlightRef = useRef(false);
  const requestedTargetContextRef = useRef(`${initialTentId}\n${correctionIdentity}`);
  const pendingDraft = values.pendingStandardSnapshot;
  const draftCapturedAt =
    correction?.originalCapturedAt ??
    (pendingDraft?.revision === values.revision
      ? pendingDraft.payloads[0]?.captured_at
      : undefined);

  const updateValues = useCallback(
    (update: (current: ManualDraftValues) => ManualDraftValues) => {
      if (session) {
        if (draft) session.updateDraft(draft.identity, update);
        return;
      }
      const next = { ...localDraftRef.current, values: update(localDraftRef.current.values) };
      localDraftRef.current = next;
      setLocalDraft(next);
    },
    [draft, session],
  );

  useLayoutEffect(() => {
    session?.getOrInitializeDraft({
      epoch,
      correctionIdentity,
      defaultTentId: initialTentId,
      ownedTentIds,
      initial: initialValues,
    });
  }, [session, epoch, correctionIdentity, initialTentId, ownedTentIds, initialValues]);

  const changeTentTarget = useCallback(
    (
      nextTentId: string,
      nextForm: ManualEntryInput,
      nextContext = STANDARD_TARGET_CONTEXT,
      restorePending = false,
    ) => {
      if (!draft || (draft.tentId === nextTentId && draft.correctionIdentity === nextContext))
        return;
      const nextValues = restorePending
        ? {
            ...createManualDraftValues({ ...nextForm, airTempUnit: "C" }, "C"),
            hasEditedReading: true,
            saveUnconfirmed: true,
          }
        : {
            ...createManualDraftValues({ ...nextForm, airTempUnit }, values.tempUnitOverride),
          };
      if (session) {
        session.changeDraftTarget(draft.identity, {
          tentId: nextTentId,
          correctionIdentity: nextContext,
          ownedTentIds,
          values: nextValues,
        });
      } else {
        const next = {
          identity: { epoch: 0, id: localDraftRef.current.identity.id + 1 },
          tentId: nextTentId,
          correctionIdentity: nextContext,
          values: nextValues,
        };
        localDraftRef.current = next;
        setLocalDraft(next);
      }
      setReviewOpen(false);
    },
    [airTempUnit, draft, ownedTentIds, session, values.tempUnitOverride],
  );

  useEffect(() => {
    if (session) return;
    const nextTentId = correction?.tentId ?? defaultTentId;
    if (!nextTentId) return;
    const requestedContext = `${nextTentId}\n${correctionIdentity}`;
    if (requestedTargetContextRef.current === requestedContext) return;
    requestedTargetContextRef.current = requestedContext;
    const restored = readCorrectionRecovery();
    const prefill = restored
      ? correctionPrefillFromRestoredMetrics(restored.correction, restored.metrics)
      : correction;
    changeTentTarget(
      nextTentId,
      correctionToPrefill(prefill, restored ? "C" : airTempUnit),
      correctionIdentity,
      !!restored,
    );
  }, [
    airTempUnit,
    changeTentTarget,
    correction,
    correctionIdentity,
    defaultTentId,
    readCorrectionRecovery,
    session,
  ]);

  useEffect(() => setReviewOpen(false), [draft?.identity.epoch, draft?.identity.id]);

  // Switching the entry unit re-expresses what the grower already typed
  // (24 °C becomes 75.2 °F) instead of silently re-reading the same number
  // in a different unit.
  const changeAirTempUnit = useCallback(
    (next: TemperatureInputUnit) => {
      updateValues((current) => reexpressManualDraftTemperature(current, next, airTempUnit));
      if (next !== airTempUnit) setReviewOpen(false);
    },
    [airTempUnit, updateValues],
  );

  useEffect(() => {
    if (
      !draft ||
      values.tempUnitOverride ||
      hasEditedReading ||
      pendingDraft ||
      form.airTempUnit === preferredUnit
    )
      return;
    updateValues((current) => ({
      ...current,
      form: { ...current.form, airTempUnit: preferredUnit },
    }));
  }, [
    draft,
    values.tempUnitOverride,
    hasEditedReading,
    pendingDraft,
    form.airTempUnit,
    preferredUnit,
    updateValues,
  ]);

  /**
   * Fahrenheit bridge for the advisor / snapshot review / derived-VPD
   * preview, which all speak the legacy °F contract. Converted exactly once
   * here; nothing downstream re-converts. Empty stays empty.
   */
  const airTempFBridge = useMemo(
    () => toFahrenheitInputString(form.airTemp, form.airTempUnit ?? airTempUnit),
    [form.airTemp, form.airTempUnit, airTempUnit],
  );

  const devicePresets = useMemo(() => getManualSensorDeviceOptions(), []);
  const deviceNote = useMemo(() => {
    if (devicePreset === "custom") return normalizeManualSourceNote(deviceCustom);
    if (devicePreset === "none" || !devicePreset) return null;
    const preset = devicePresets.find((p) => p.id === devicePreset);
    return preset ? normalizeManualSourceNote(preset.label) : null;
  }, [devicePreset, deviceCustom, devicePresets]);

  const validation = useMemo(() => validateManualEntry(form), [form]);
  const advisor = useMemo(
    () =>
      evaluateManualSnapshotAdvisor({
        ...form,
        airTemp: form.airTemp,
        airTempUnit: form.airTempUnit ?? airTempUnit,
      }),
    [form, airTempUnit],
  );
  const snapshotQuality = useMemo(() => {
    // Build a sanitized snapshot from validated metrics only. No raw_payload,
    // no vendor metadata, no tokens, no private IDs. A retry retains the
    // submitted observation time rather than making an older reading fresh.
    const fields: Record<string, number> = {};
    for (const m of validation.metrics) {
      if (m.metric === "temperature_c") fields.temperature_c = m.value;
      else if (m.metric === "humidity_pct") fields.humidity_pct = m.value;
      else if (m.metric === "vpd_kpa") fields.vpd_kpa = m.value;
      else if (m.metric === "soil_moisture_pct") fields.soil_moisture_pct = m.value;
    }
    // Percentages the grower typed but validation rejected (e.g. RH 101) must
    // still reach the quality check, or the badge grades the remaining metrics
    // as "Usable current reading" while the save is blocked (QA 2026-09-24,
    // BUG-017). These are unit-free, so the typed number is the value.
    for (const [raw, key] of [
      [form.humidityPct, "humidity_pct"],
      [form.soilMoisturePct, "soil_moisture_pct"],
    ] as const) {
      const typed = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (!(key in fields) && Number.isFinite(typed)) fields[key] = typed;
    }
    const snap: ManualSensorSnapshotInput = {
      source: "manual",
      captured_at: draftCapturedAt ?? new Date().toISOString(),
      ...fields,
    };
    // Any other blocking error (VPD -1, CO₂ -5, PPFD 5000, a malformed
    // temperature) drops its metric from validation.metrics, so it also
    // forces the badge to invalid while the save is blocked.
    return applyManualEntryBlockingErrors(
      evaluateManualSensorSnapshotQuality(snap),
      manualEntryValueErrors(validation),
    );
  }, [validation, draftCapturedAt, form.humidityPct, form.soilMoisturePct]);

  // Structured pre-save review (source: "manual", never live). Renders inside
  // the review prompt so the grower sees findings + normalized preview before
  // confirming. Blockers here also disable the Confirm button.
  const snapshotReview = useMemo(() => {
    const review = isCorrection ? reviewManualSensorCorrection : reviewManualSensorSnapshot;
    return review({
      tempF: airTempFBridge,
      humidity: form.humidityPct,
      vpdKpa: form.vpdKpa,
      soilWaterContent: form.soilMoisturePct,
      co2Ppm: form.co2Ppm,
      ppfd: form.ppfd,
      capturedAt: draftCapturedAt ?? new Date().toISOString(),
      tentId: tentId || null,
    });
  }, [form, airTempFBridge, tentId, draftCapturedAt, isCorrection]);

  // Entered VPD vs air-VPD estimate. Uses only sanitized numeric metrics —
  // never relabels source. If the grower entered a VPD that disagrees with
  // the temp/RH air estimate by more than `VPD_CONFLICT_THRESHOLD_KPA`, the
  // validator returns a warn hint on `vpdKpa`; we surface it inline.
  //
  // We only treat VPD as "entered" when the grower literally typed one in
  // the VPD field (form.vpdKpa is a non-empty string). A temp/RH air estimate
  // must NOT be treated as entered or persisted — that would suppress the
  // comparison and falsely upgrade its measurement basis.
  const fieldValidation = useMemo(() => {
    const fields: {
      temperatureC?: number;
      humidityPct?: number;
      vpdKpa?: number;
    } = {};
    for (const m of validation.metrics) {
      if (m.metric === "temperature_c") fields.temperatureC = m.value;
      else if (m.metric === "humidity_pct") fields.humidityPct = m.value;
    }
    const rawVpd = typeof form.vpdKpa === "string" ? form.vpdKpa.trim() : "";
    if (rawVpd.length > 0) {
      const n = Number(rawVpd);
      if (Number.isFinite(n)) fields.vpdKpa = n;
    }
    return validateManualSensorSnapshotFields({
      source: "manual",
      capturedAt: draftCapturedAt ?? new Date().toISOString(),
      ...fields,
    });
  }, [validation.metrics, form.vpdKpa, draftCapturedAt]);
  const enteredVpd =
    fieldValidation.derivedVpd.kind === "entered" ? fieldValidation.derivedVpd.vpdKpa : null;
  const derivedVpdFromTempRh = useMemo(() => {
    // Compute the air estimate independently so we can render entered vs estimate
    // side-by-side even when the grower typed a VPD.
    const t = validation.metrics.find((m) => m.metric === "temperature_c");
    const h = validation.metrics.find((m) => m.metric === "humidity_pct");
    if (!t || !h) return null;
    const fresh = validateManualSensorSnapshotFields({
      source: "manual",
      capturedAt: new Date().toISOString(),
      temperatureC: t.value,
      humidityPct: h.value,
    });
    return fresh.derivedVpd.kind === "derived" ? fresh.derivedVpd.vpdKpa : null;
  }, [validation.metrics]);
  const vpdConflictHint = fieldValidation.hints.find(
    (h) => h.field === "vpdKpa" && h.severity === "warn",
  );

  function update<K extends keyof ManualEntryInput>(key: K, value: string) {
    updateValues((current) =>
      editManualDraftValues(current, {
        hasEditedReading: true,
        form: { ...current.form, [key]: value },
      }),
    );
    // Any edit invalidates a previously-shown review prompt so it must be
    // re-triggered on the next save attempt against the new values.
    if (reviewOpen) setReviewOpen(false);
    // Editing after a save dismisses the prior confirmation so it never
    // confuses the grower about the current form state.
  }

  function updateDevicePreset(value: string) {
    updateValues((current) => editManualDraftValues(current, { devicePreset: value }));
    if (reviewOpen) setReviewOpen(false);
  }

  function updateDeviceCustom(value: string) {
    updateValues((current) => editManualDraftValues(current, { deviceCustom: value }));
    if (reviewOpen) setReviewOpen(false);
  }

  async function doSave() {
    // Belt-and-suspenders: even though Save buttons are disabled while
    // pending, guard against a second concurrent call from any path.
    if (isSaving || saveInFlightRef.current || !draft || recoveryError) return;
    const readCurrentDraft = () => (session ? session.getSnapshot()?.draft : localDraftRef.current);
    const currentDraft = readCurrentDraft();
    if (
      !currentDraft ||
      currentDraft.identity.epoch !== draft.identity.epoch ||
      currentDraft.identity.id !== draft.identity.id ||
      currentDraft.values.revision !== values.revision
    )
      return;
    const submissionOwner = ownerId;
    const submissionTentId = tentId;
    const submissionIdentity = draft.identity;
    const submissionRevision = values.revision;
    const submissionCorrection = correction;
    const capturedMetrics = validation.metrics;
    const pendingSnapshot = values.pendingStandardSnapshot;
    let payloads =
      !submissionCorrection && pendingSnapshot?.revision === submissionRevision
        ? pendingSnapshot.payloads
        : buildManualReadingPayloads({
            tentId: submissionTentId,
            metrics: capturedMetrics,
            deviceNote,
            ts: submissionCorrection?.originalCapturedAt,
          });
    let sessionClaim: SensorsSaveClaim | null = null;
    if (session) {
      const result = session.claimSave(submissionIdentity, payloads);
      if (result.status !== "claimed") return;
      sessionClaim = result.claim;
      payloads = result.claim.payloads;
    } else if (!submissionCorrection) {
      // Retrying an unchanged snapshot must retain its database identity and
      // observation time, including when the first reply was lost after commit.
      updateValues((current) => ({
        ...current,
        pendingStandardSnapshot: { revision: submissionRevision, payloads },
      }));
    }
    saveInFlightRef.current = true;
    if (submissionCorrection) setCorrectionSaving(true);
    const submissionStillOwnsDraft = () => {
      const current = readCurrentDraft();
      return (
        (!submissionCorrection || ownerRef.current === submissionOwner) &&
        current?.identity.epoch === submissionIdentity.epoch &&
        current.identity.id === submissionIdentity.id &&
        current.tentId === submissionTentId &&
        current.values.revision === submissionRevision
      );
    };
    try {
      let cleanupPending = false;
      let savedMetrics = capturedMetrics;
      if (submissionCorrection) {
        if (!ownedTentIds.includes(submissionTentId))
          throw new Error("Correction target unavailable");
        const pending = correctionJournal.read(submissionOwner);
        if (pending.status === "blocked") throw new Error("Correction recovery unavailable");
        const intent = buildManualCorrectionOperation({
          operationId:
            pending.status === "pending" ? pending.operation.operationId : crypto.randomUUID(),
          correction: submissionCorrection,
          metrics: capturedMetrics,
        });
        if (!intent.ok) throw new Error("Correction intent invalid");
        const result = await submitPendingManualCorrection(
          submissionOwner,
          intent.operation,
          supabase as unknown as ManualCorrectionRpcClient,
          correctionJournal,
        );
        if (result.status !== "confirmed") throw new Error("Correction unconfirmed");
        cleanupPending = result.cleanup === "pending";
        savedMetrics = intent.operation.changes.map(({ metric, value }) => ({ metric, value }));
      } else {
        // A snapshot is one logical write. The batch helper sends one
        // multi-row INSERT, so PostgreSQL either commits every metric or
        // rejects the whole snapshot.
        await insertBatch.mutateAsync(payloads);
      }
      const createdAt = submissionCorrection
        ? submissionCorrection.originalCapturedAt
        : (payloads[0]?.captured_at ?? new Date().toISOString());
      const successLine = buildManualSaveSuccessLine({ metrics: savedMetrics });
      const stillOwnsDraft = submissionStillOwnsDraft();
      const confirmedValues = (current: ManualDraftValues): ManualDraftValues => ({
        ...createManualDraftValues(
          { ...EMPTY, airTempUnit: current.form.airTempUnit },
          current.tempUnitOverride,
        ),
        revision: current.revision,
        lastSaved: { line: successLine, capturedAt: createdAt, tentId: submissionTentId },
      });
      if (session && sessionClaim) {
        session.settleSave(sessionClaim, { status: "success", update: confirmedValues });
      } else if (stillOwnsDraft) {
        updateValues(confirmedValues);
      }
      // Old callbacks may finish after logout or after the grower starts a
      // different draft. They must not announce success for the visible draft.
      const showConfirmation = submissionCorrection ? stillOwnsDraft : !session || stillOwnsDraft;
      if (showConfirmation) toast.success(successMessage ?? successLine);
      if (showConfirmation && cleanupPending) {
        toast.warning(
          "Correction saved. Local recovery cleanup is pending; retrying this correction will only confirm the same save.",
        );
      }
      if (showConfirmation)
        onSaved?.({ tentId: submissionTentId, metricsSaved: savedMetrics.length, createdAt });
      if (stillOwnsDraft) setReviewOpen(false);
    } catch (err) {
      // Preserve entered values (we don't clear the form on failure) and
      // surface a safe operator-facing error. Never echo raw internals.
      const msg = submissionCorrection
        ? CORRECTION_SAVE_UNCONFIRMED_MESSAGE
        : STANDARD_SAVE_UNCONFIRMED_MESSAGE;
      const stillOwnsDraft = submissionStillOwnsDraft();
      if (session && sessionClaim) {
        session.settleSave(sessionClaim, { status: "unconfirmed" });
      } else if (stillOwnsDraft) {
        updateValues((current) => ({ ...current, saveUnconfirmed: true }));
      }
      if (!submissionCorrection && stillOwnsDraft) {
        toast.error(msg);
      }
      if (submissionCorrection && stillOwnsDraft) toast.error(msg);
      // Developer-safe diagnostic: console only, not in UI.

      console.warn("[manual-sensor-save] failed");
    } finally {
      saveInFlightRef.current = false;
      if (submissionCorrection) setCorrectionSaving(false);
    }
  }

  async function onSave() {
    if (recoveryError) return;
    if (!tentId) {
      toast.error("Pick a tent first.");
      return;
    }
    if (!isUuid(tentId)) {
      toast.error("Select a real tent before saving a manual sensor reading.");
      return;
    }
    if (!validation.ok) {
      toast.error(validation.errors[0] ?? "Reading is invalid.");
      return;
    }
    // Every manual snapshot must go through the review gate before insert.
    // Normal, warning, and blocker cases all open the review panel; only
    // confirming from within the panel actually calls the insert path.
    if (!reviewOpen) {
      setReviewOpen(true);
      return;
    }
    await doSave();
  }

  const tentSetupRequired = shouldRequireFirstTentSetup(
    tents.map((t) => ({ id: t.id, is_archived: false })),
  );

  // Cache removal at an account boundary fails closed. Initialization occurs
  // in the layout effect, and a stale controller cannot repopulate the cache.
  if (session && !sessionState) return null;

  return (
    <Card
      className="glass"
      data-testid="manual-sensor-reading-card"
      data-correction-mode={isCorrection ? "true" : "false"}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-display">
          <Gauge className="h-4 w-4" />
          {isCorrection ? "Correct Manual Sensor Reading" : "Add Manual Sensor Reading"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pendingCorrectionRecovery.status !== "none" && (
          <div
            role="status"
            data-testid="manual-reading-pending-correction"
            className="space-y-2 text-sm"
          >
            {pendingCorrectionRecovery.status === "available" ? (
              <>
                <p>
                  An earlier manual correction is still unconfirmed. Reopen it to retry the original
                  save.
                </p>
                <Button asChild variant="outline" size="sm" disabled={isSaving}>
                  <Link
                    to={pendingCorrectionRecovery.href}
                    onClick={(event) => {
                      if (isSaving) event.preventDefault();
                    }}
                  >
                    Reopen pending correction
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <p>
                  {pendingCorrectionRecovery.status === "blocked"
                    ? "Could not check for an unconfirmed correction. Keep this tab open and retry recovery."
                    : "An earlier manual correction is still unconfirmed, but its original tent is unavailable. Keep this tab open until that tent is available."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                  onClick={retryCorrectionRecovery}
                >
                  Retry correction recovery
                </Button>
              </>
            )}
          </div>
        )}
        {recoveryError && (
          <div
            role="alert"
            data-testid="manual-reading-recovery-error"
            className="space-y-2 text-sm"
          >
            <p>{recoveryError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => session?.retryRecovery()}
              disabled={isSaving}
            >
              Retry recovery
            </Button>
          </div>
        )}
        {isCorrection && correction && (
          <div
            className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs"
            data-testid="manual-reading-correction-banner"
            role="status"
          >
            <History className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <p>
              Correcting manual reading captured at{" "}
              <strong>{formatSnapshotTimestamp(correction.originalCapturedAt)}</strong>. The
              original stays in history; Verdant saves linked corrections.
            </p>
          </div>
        )}
        {tentSetupRequired ? (
          <FirstTentSetupEmptyState
            surface="manual_sensor"
            testId="manual-reading-first-tent-setup"
          />
        ) : (
          <>
            <div
              className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/40 p-2 text-xs text-muted-foreground"
              data-testid="manual-reading-helper"
            >
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p>
                  <strong>{MANUAL_SENSOR_TRUTH_TITLE}</strong> — {MANUAL_SENSOR_TRUTH_SOURCE_LINE}
                </p>
                <p data-testid="manual-reading-helper-not-device-control">
                  {MANUAL_SENSOR_TRUTH_NOT_DEVICE_CONTROL_LINE}
                </p>
                <p data-testid="manual-reading-helper-not-diagnosis">
                  {MANUAL_SENSOR_TRUTH_NOT_DIAGNOSIS_LINE}
                </p>
                {validation.metrics.length === 0 && (
                  <p data-testid="manual-reading-helper-missing-readings">
                    {MANUAL_SENSOR_TRUTH_MISSING_READINGS_LINE}
                  </p>
                )}
                <p className="text-[11px] opacity-80">
                  Good for handheld tools and EcoWitt console/app readouts (e.g. WH45 CO₂/THP, WH31
                  temp/RH, WH51 soil).
                </p>
              </div>
            </div>

            {tents.length > 0 && (
              <div className="space-y-1" data-testid="manual-reading-tent-row">
                <Label htmlFor="manual-reading-tent" className="text-xs">
                  Tent
                </Label>
                <Select
                  value={tentId}
                  onValueChange={(nextTentId) => changeTentTarget(nextTentId, EMPTY)}
                  disabled={isCorrection || isSaving || !draft}
                >
                  <SelectTrigger id="manual-reading-tent" data-testid="manual-reading-tent-select">
                    <SelectValue placeholder="Select tent" />
                  </SelectTrigger>
                  <SelectContent>
                    {tents.map((t) => (
                      <SelectItem
                        key={t.id}
                        value={t.id}
                        data-testid={`manual-reading-tent-option-${t.id}`}
                      >
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Saving to: <strong>{tents.find((t) => t.id === tentId)?.name ?? "—"}</strong>
                </p>
              </div>
            )}

            <div className="space-y-1" data-testid="manual-reading-device-row">
              <Label htmlFor="manual-reading-device" className="text-xs">
                Reading source / device <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Select value={devicePreset} onValueChange={updateDevicePreset}>
                <SelectTrigger
                  id="manual-reading-device"
                  data-testid="manual-reading-device-select"
                >
                  <SelectValue placeholder="Where did this reading come from?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" data-testid="manual-reading-device-option-none">
                    Not specified
                  </SelectItem>
                  {devicePresets.map((opt) => (
                    <SelectItem
                      key={opt.id}
                      value={opt.id}
                      data-testid={`manual-reading-device-option-${opt.id}`}
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom" data-testid="manual-reading-device-option-custom">
                    Other (type a short note)
                  </SelectItem>
                </SelectContent>
              </Select>
              {devicePreset === "custom" && (
                <Input
                  id="manual-reading-device-custom"
                  data-testid="manual-reading-device-custom"
                  value={deviceCustom}
                  onChange={(e) => updateDeviceCustom(e.target.value)}
                  maxLength={MAX_MANUAL_DEVICE_NOTE_LEN}
                  placeholder="e.g. SensorPush HT.w"
                  className="mt-1"
                />
              )}
              <p
                className="text-[11px] text-muted-foreground"
                data-testid="manual-reading-device-hint"
              >
                Optional note about where this reading came from. Stays labeled as a manual,
                user-entered reading — not a connected device.
              </p>
            </div>

            <Section title="Air" testId="manual-reading-section-air">
              <div className="space-y-1">
                <Field
                  id="m-air-temp"
                  label="Air temp"
                  unit={TEMPERATURE_UNIT_SYMBOL[airTempUnit]}
                  value={form.airTemp as string}
                  onChange={(v) => update("airTemp", v)}
                  placeholder={AIR_TEMP_PLACEHOLDER[airTempUnit]}
                />
                <div
                  className="flex items-center gap-1"
                  role="group"
                  aria-label="Temperature entry unit"
                  data-testid="manual-reading-temp-unit-toggle"
                  data-active-unit={airTempUnit}
                >
                  {TEMPERATURE_INPUT_UNITS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => changeAirTempUnit(u)}
                      aria-pressed={airTempUnit === u}
                      data-testid={`manual-reading-temp-unit-${u}`}
                      className={`min-h-11 min-w-11 rounded-md border px-3 text-xs font-medium transition-colors ${
                        airTempUnit === u
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground hover:bg-secondary/40"
                      }`}
                    >
                      {TEMPERATURE_UNIT_SYMBOL[u]}
                    </button>
                  ))}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    Entered in {TEMPERATURE_UNIT_SYMBOL[airTempUnit]} — saved as Celsius.
                  </span>
                </div>
              </div>
              <Field
                id="m-humidity"
                label="Humidity"
                unit="%"
                value={form.humidityPct as string}
                onChange={(v) => update("humidityPct", v)}
                placeholder="55"
              />
              <Field
                id="m-co2"
                label="CO₂"
                unit="ppm"
                value={form.co2Ppm as string}
                onChange={(v) => update("co2Ppm", v)}
                placeholder="e.g. 800 from EcoWitt WH45 CO₂ Monitor"
              />
              <Field
                id="m-vpd"
                label="VPD"
                unit="kPa"
                value={form.vpdKpa as string}
                onChange={(v) => update("vpdKpa", v)}
                placeholder="enter measured VPD (optional)"
              />
            </Section>

            <Section title="Root zone" testId="manual-reading-section-root">
              <Field
                id="m-soil"
                label="Soil water"
                unit="%"
                value={form.soilMoisturePct as string}
                onChange={(v) => update("soilMoisturePct", v)}
                placeholder="45"
              />
            </Section>

            <Section title="Light" testId="manual-reading-section-light">
              <Field
                id="m-ppfd"
                label="PPFD"
                unit="µmol/m²/s"
                value={form.ppfd as string}
                onChange={(v) => update("ppfd", v)}
                placeholder="e.g. 650"
              />
            </Section>
            <p className="text-[11px] text-muted-foreground" data-testid="manual-reading-ppfd-hint">
              Enter PPFD from a PAR/quantum meter. Do not estimate from light percentage or watts.
            </p>

            <p
              className="text-[11px] text-muted-foreground"
              data-testid="manual-reading-out-of-scope-hint"
            >
              pH, EC/TDS, water temp, and DLI from pens like the Spider Farmer pH/EC combo aren't
              stored as sensor metrics yet — log them as a Quick Log feeding or observation note for
              now.
            </p>

            <DerivedVpdStatus
              testId="manual-reading-derived-vpd"
              airTempF={airTempFBridge}
              humidityPct={form.humidityPct as string}
            />
            {advisor.derivedVpdKpa !== null && (
              <p
                className="text-[11px] text-muted-foreground"
                data-testid="manual-reading-derived-vpd-hint"
              >
                Air estimate only — not saved as verified VPD. Enter a measured VPD only when its
                basis is known.
              </p>
            )}

            {(enteredVpd !== null || derivedVpdFromTempRh !== null) && (
              <div
                className="rounded-md border border-border/40 bg-secondary/10 p-2 text-xs"
                data-testid="manual-reading-vpd-comparison"
                data-vpd-conflict={vpdConflictHint ? "true" : "false"}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    className="tabular-nums"
                    data-testid="manual-reading-vpd-entered"
                    data-value={enteredVpd ?? ""}
                  >
                    <span className="text-muted-foreground">Entered VPD:</span>{" "}
                    {enteredVpd !== null ? `${enteredVpd.toFixed(2)} kPa` : "—"}
                  </span>
                  <span
                    className="tabular-nums"
                    data-testid="manual-reading-vpd-derived"
                    data-value={derivedVpdFromTempRh ?? ""}
                  >
                    <span className="text-muted-foreground">Air VPD estimate (temp + RH):</span>{" "}
                    {derivedVpdFromTempRh !== null ? `${derivedVpdFromTempRh.toFixed(2)} kPa` : "—"}
                  </span>
                </div>
                {vpdConflictHint && (
                  <p
                    className="mt-1 flex items-start gap-1.5 text-amber-600 dark:text-amber-400"
                    data-testid="manual-reading-vpd-conflict-warning"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{vpdConflictHint.message}</span>
                  </p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Manual entry — the air estimate is preview-only, is not saved as verified VPD, and
                  never relabels this reading as live. Conflict threshold:{" "}
                  {VPD_CONFLICT_THRESHOLD_KPA.toFixed(2)} kPa.
                </p>
              </div>
            )}

            {advisor.warnings.length > 0 && (
              <ul className="space-y-1" data-testid="manual-reading-advisor-warnings">
                {advisor.warnings.map((w, i) => (
                  <li
                    key={`adv-${i}`}
                    className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}

            {validation.warnings.length > 0 && (
              <ul className="space-y-1" data-testid="manual-reading-warnings">
                {validation.warnings.map((w, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
            {(isCorrection || hasEditedReading) && validation.errors.length > 0 && (
              <ul className="space-y-1" data-testid="manual-reading-errors">
                {validation.errors.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            )}

            {reviewOpen &&
              (() => {
                const hasBlocker = !snapshotReview.canSave;
                const hasWarning =
                  !hasBlocker &&
                  (advisor.warnings.length > 0 ||
                    snapshotReview.findings.some((f) => f.severity === "warning"));
                const gateMessage = hasBlocker
                  ? "Resolve blockers before saving this snapshot."
                  : hasWarning
                    ? "Review warnings before saving."
                    : "Confirm to save this manual snapshot to plant history.";
                return (
                  <div
                    className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-3"
                    data-testid="manual-reading-review-prompt"
                    role="alertdialog"
                    aria-label="Review manual snapshot before saving"
                    aria-describedby="manual-sensor-review-gate"
                  >
                    <ManualSensorSnapshotReviewPanel result={snapshotReview} />
                    <p
                      id="manual-sensor-review-gate"
                      data-testid="manual-sensor-review-gate"
                      data-state={hasBlocker ? "blocker" : hasWarning ? "warning" : "ok"}
                      className="text-xs font-medium"
                    >
                      {gateMessage}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReviewOpen(false)}
                        data-testid="manual-sensor-review-back"
                      >
                        Back to edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={doSave}
                        disabled={isSaving || hasBlocker || !draft || !!recoveryError}
                        data-testid="manual-sensor-review-confirm"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving
                          </>
                        ) : (
                          "Confirm manual snapshot"
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })()}

            <section
              className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-2"
              data-testid="manual-reading-snapshot-quality"
              aria-label="Snapshot quality"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Snapshot quality
                </h3>
              </div>
              <ManualSensorSnapshotQualityBadge evaluation={snapshotQuality} />
              <p className="text-[11px] text-muted-foreground">
                This check helps AI Doctor decide whether the reading can support current-room
                guidance.
              </p>
            </section>

            {saveUnconfirmed && (
              <p
                role="status"
                className="text-xs text-muted-foreground"
                data-testid="manual-reading-save-unconfirmed"
              >
                {isCorrection
                  ? CORRECTION_SAVE_UNCONFIRMED_MESSAGE
                  : STANDARD_SAVE_UNCONFIRMED_MESSAGE}
              </p>
            )}
            {saveUnconfirmed && isCorrection && (
              <Button
                variant="outline"
                size="sm"
                disabled={isSaving}
                onClick={() => {
                  const restored = readCorrectionRecovery();
                  if (!restored) {
                    toast.error(
                      "The pending correction cannot be restored for this observation. Keep this tab open and retry recovery when its tent is available.",
                    );
                    return;
                  }
                  updateValues(() =>
                    recoveredCorrectionDraftValues(restored.correction, restored.metrics),
                  );
                  setReviewOpen(false);
                }}
              >
                Restore pending correction
              </Button>
            )}

            {lastSaved && (
              <div
                className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-2"
                data-testid="manual-reading-saved-confirmation"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div className="space-y-1">
                    <p
                      className="text-xs font-medium text-emerald-700 dark:text-emerald-300"
                      data-testid="manual-reading-saved-line"
                    >
                      {lastSaved.line}
                    </p>
                    <p
                      className="text-[11px] text-muted-foreground"
                      data-testid="manual-reading-saved-captured-at"
                    >
                      Captured {new Date(lastSaved.capturedAt).toLocaleString()}. Now available for
                      snapshot and alert evaluation.
                    </p>
                    <Link
                      to={growId ? `/alerts?growId=${encodeURIComponent(growId)}` : "/alerts"}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
                      data-testid="manual-reading-next-step-alerts"
                    >
                      Next: open Alerts to check this snapshot against current targets
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-[11px] text-muted-foreground">
                {validation.metrics.length > 0
                  ? `${validation.metrics.length} metric${validation.metrics.length === 1 ? "" : "s"} ready`
                  : "No metrics entered yet"}
              </p>
              <Button
                onClick={onSave}
                disabled={!validation.ok || !tentId || isSaving || !draft || !!recoveryError}
                data-testid="manual-reading-save"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Save Reading"
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  unit,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs flex items-center justify-between gap-2">
        <span>{label}</span>
        {unit ? (
          <span className="text-[10px] font-normal text-muted-foreground">{unit}</span>
        ) : null}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
