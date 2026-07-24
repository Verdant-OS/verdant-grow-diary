/**
 * QuickLogAllActivitiesSection — shared, mountable Quick Log activity
 * surface for Verdant V0 (One-Tent Loop).
 *
 * Wires:
 *   QuickLogActivityPicker  (shared UI, shared taxonomy)
 *   useQuickLogActivitySave (shared safe RPC routing)
 *   buildDailyCheckSavedItems (shared "What was saved" labels)
 *
 * Presenter-focused. No duplicate activity taxonomy. No local
 * activity/label arrays. Business rules stay in src/lib/* and
 * src/constants/*.
 *
 * Safety fences:
 *   - Harvest is stage-gated in the picker and re-checked immediately
 *     before save. Missing, stale, or ineligible context never reaches RPC.
 *   - Manual sensor snapshot is intentionally deferred to the existing
 *     ManualSensorReadingCard path — this section shows the shared
 *     safety copy and links out; it does NOT persist a reading itself.
 *   - Unsaved draft selections never appear in "What was saved".
 *   - Failed saves never dispatch a timeline refresh and never render a
 *     confirmation card.
 *   - No recommendation, no health inference, no "safe to feed / train
 *     / defoliate", no harvest readiness, no diagnosis language.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import QuickLogActivityPicker from "@/components/QuickLogActivityPicker";
import { useQuickLogActivitySave } from "@/hooks/useQuickLogActivitySave";
import { useAuth } from "@/store/auth";
import { supabase } from "@/integrations/supabase/client";
import { createQuickLogPhotoDiaryEntry } from "@/lib/quickLogPhotoDiaryEntry";
import { validatePlantProfilePhotoFile } from "@/lib/plantProfilePhotoFileRules";
import { dispatchQuickLogV2EntryCreated } from "@/lib/quickLogV2EntryCreatedEvent";
import { trackQuickLogSuccess } from "@/lib/quickLogSuccessTelemetry";
import {
  QUICK_LOG_ACTIVITY_DEFINITIONS,
  QUICK_LOG_WEIGHT_UNITS,
  type QuickLogActivityDefinition,
  type QuickLogActivityId,
  type QuickLogWeightUnit,
} from "@/constants/quickLogActivityTypes";
import { buildHarvestDetailsPayload, validateHarvestWeightInput } from "@/lib/harvestDetailsRules";
import {
  getQuickLogActivityDetailFields,
  sanitizeQuickLogActivityDetails,
  validateQuickLogDetailNumberInput,
  QUICK_LOG_DETAIL_TEXT_MAX,
} from "@/lib/quickLogActivityDetailFields";
import {
  buildQuickLogSubmissionTimestamps,
  seedLoggedAtIso,
  validateOccurredAtInput,
} from "@/lib/quickLogTimestampRules";
import {
  buildDailyCheckSavedItems,
  type DailyCheckSavedItem,
  type DailyCheckSavedSource,
} from "@/lib/dailyCheckPostSubmitRules";
import {
  bindQuickLogActivityDraft,
  buildQuickLogTargetIdentity,
  buildQuickLogTargetKey,
  evaluateQuickLogActivityAvailability,
  evaluateQuickLogPrePersistenceGate,
  QUICK_LOG_HARVEST_STAGE_DISABLED_REASON,
  type QuickLogActivityDraftBinding,
} from "@/lib/quickLogActivityRules";
import {
  QUICK_LOG_V2_OPEN_EVENT,
  buildQuickLogV2OpenIntent,
} from "@/lib/quickLogV2OpenIntent";

export interface QuickLogAllActivitiesSectionProps {
  growId: string | null | undefined;
  tentId?: string | null;
  plantId?: string | null;
  /** Current selected-plant stage. Harvest fails closed when this is missing. */
  plantStage?: unknown;
  /** Optional heading override for the section. */
  heading?: string;
  /** Optional testid prefix. Defaults to "quick-log-all-activities". */
  testIdPrefix?: string;
  /** Parent-owned synchronous guard shared with the canonical Quick Log form. */
  onSaveStart?: (target: QuickLogAllActivitiesSaveTarget) => boolean;
  /** Releases the parent-owned guard after either success or failure. */
  onSaveEnd?: () => void;
  /** Presenter lock while either the parent or this section owns the guard. */
  saveBlocked?: boolean;
  /** Reads the same parent-owned synchronous guard used to acquire a save. */
  isSaveBlocked?: () => boolean;
  /** Parent-owned close/reset seam used before handing Water to Quick Log v2. */
  onBeforeStructuredWaterOpen?: () => void;
  /** Caller-owned fail-closed reason that must prevent every persistence path. */
  externalPersistenceBlockReason?: string | null;
  /**
   * "Captured" seed from the launching surface (Fast Add preset click).
   * When absent, the section seeds its own form-open time.
   */
  defaultLoggedAtIso?: string | null;
}

export interface QuickLogAllActivitiesSaveTarget {
  readonly growId: string;
  readonly tentId: string | null;
  readonly plantId: string | null;
}

/** Map a QuickLogActivityId to the "What was saved" DailyCheck source. */
function toSavedSource(id: QuickLogActivityId): DailyCheckSavedSource | null {
  switch (id) {
    case "note":
      return "note";
    case "photo":
      return "photo";
    case "watering":
      return "watering";
    case "feeding":
      return "feeding";
    case "environment_check":
      return "environment_check";
    case "training":
      return "training";
    case "defoliation":
      return "defoliation";
    case "issue_observation":
      return "issue_observation";
    case "manual_sensor_snapshot":
      return "sensor";
    case "harvest":
      return "harvest";
    default:
      return null;
  }
}

function newIdempotencyKey(activityId: QuickLogActivityId): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `qla-${activityId}-${Date.now()}-${rand}`;
}

interface SavedRecord {
  id: string;
  activityId: QuickLogActivityId;
  item: DailyCheckSavedItem;
  target: QuickLogAllActivitiesSaveTarget;
}

export default function QuickLogAllActivitiesSection({
  growId,
  tentId = null,
  plantId = null,
  plantStage = null,
  heading = "All quick actions",
  testIdPrefix = "quick-log-all-activities",
  onSaveStart,
  onSaveEnd,
  saveBlocked = false,
  isSaveBlocked,
  onBeforeStructuredWaterOpen,
  externalPersistenceBlockReason = null,
  defaultLoggedAtIso = null,
}: QuickLogAllActivitiesSectionProps) {
  const currentTarget = useMemo(
    () => buildQuickLogTargetIdentity({ growId, tentId, plantId }),
    [growId, plantId, tentId],
  );
  const currentTargetKey = useMemo(
    () => buildQuickLogTargetKey(currentTarget),
    [currentTarget],
  );
  const previousTargetKeyRef = useRef(currentTargetKey);
  const [selectedDraft, setSelectedDraft] =
    useState<QuickLogActivityDraftBinding | null>(null);
  const selected = selectedDraft
    ? QUICK_LOG_ACTIVITY_DEFINITIONS[selectedDraft.activityId]
    : null;
  const [note, setNote] = useState("");
  const [harvestWet, setHarvestWet] = useState("");
  const [harvestDry, setHarvestDry] = useState("");
  const [harvestUnit, setHarvestUnit] = useState<QuickLogWeightUnit>("g");
  // Generic per-activity structured detail values (e.g. training technique),
  // keyed by field spec key. Sanitized before persistence.
  const [detailValues, setDetailValues] = useState<Record<string, string>>({});
  // Dual timestamps (founder-locked model): occurredAtLocal = backdatable
  // "when it happened" (datetime-local; blank = "now" → server stamps commit
  // time); loggedAtIso = "Captured" — seeded when the activity form OPENS,
  // overridable, persisted as details.logged_at (the report/calendar grouping
  // key). Both are frozen at submit beside the idempotency key (#317 hash).
  const [occurredAtLocal, setOccurredAtLocal] = useState("");
  const [loggedAtIso, setLoggedAtIso] = useState("");
  // Photo activity: a real image is REQUIRED before Save — a photo entry with
  // no image must never be confirmable. Uploaded to the private diary-photos
  // bucket; the diary row's photo_url column carries the bare storage path.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const photoDiaryInFlightRef = useRef(false);
  const { user } = useAuth();
  const [saved, setSaved] = useState<SavedRecord[]>([]);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [errorForActivity, setErrorForActivity] = useState<QuickLogActivityId | null>(null);
  const [structuredWaterError, setStructuredWaterError] = useState<string | null>(null);
  const { save, saving } = useQuickLogActivitySave();
  const localSaveInFlightRef = useRef(false);

  useEffect(() => {
    if (previousTargetKeyRef.current === currentTargetKey) return;
    previousTargetKeyRef.current = currentTargetKey;

    // Drafts and receipts are target-specific. Never carry plant A's state
    // into plant B's Quick Log surface.
    setSelectedDraft(null);
    setNote("");
    setHarvestWet("");
    setHarvestDry("");
    setHarvestUnit("g");
    setDetailValues({});
    setOccurredAtLocal("");
    setLoggedAtIso("");
    setPhotoFile(null);
    setErrorReason(null);
    setErrorForActivity(null);
    setStructuredWaterError(null);
    setSaved([]);
  }, [currentTargetKey]);

  const canPersistManualSensor = false; // Deferred to ManualSensorReadingCard.

  const harvestWetValidation = useMemo(
    () => validateHarvestWeightInput(harvestWet),
    [harvestWet],
  );
  const harvestDryValidation = useMemo(
    () => validateHarvestWeightInput(harvestDry),
    [harvestDry],
  );
  const harvestWeightsInvalid =
    !harvestWetValidation.ok || !harvestDryValidation.ok;
  // Blocking validation for number detail fields (e.g. manual env readings):
  // an out-of-band value must stop the save with an inline error — never be
  // silently dropped while the grower sees a success receipt.
  const detailNumberValidations = useMemo(() => {
    if (!selected) return [] as { key: string; ok: boolean; error: string | null }[];
    return getQuickLogActivityDetailFields(selected.id)
      .filter((f) => f.kind === "number")
      .map((f) => ({ key: f.key, ...validateQuickLogDetailNumberInput(f, detailValues[f.key]) }));
  }, [selected, detailValues]);
  const detailNumbersInvalid = detailNumberValidations.some((v) => !v.ok);
  const firstDetailNumberError =
    detailNumberValidations.find((v) => !v.ok)?.error ?? null;
  // Blocking gate for the backdatable happened-at field (unparseable or
  // future values must block, never silently reinterpret).
  const occurredAtValidation = useMemo(
    () => validateOccurredAtInput(occurredAtLocal, Date.now()),
    [occurredAtLocal],
  );
  const selectedAvailability = useMemo(
    () =>
      selected
        ? evaluateQuickLogActivityAvailability(selected.id, plantStage)
        : null,
    [plantStage, selected],
  );

  const requiresNote = useMemo(() => {
    if (!selected) return false;
    return (
      selected.id === "note" ||
      selected.id === "feeding" ||
      selected.id === "training" ||
      selected.id === "defoliation" ||
      selected.id === "issue_observation" ||
      selected.id === "environment_check"
    );
  }, [selected]);

  const mutationBlocked = saving || saveBlocked;
  const isMutationBlocked = useCallback(
    () =>
      mutationBlocked || (onSaveStart ? isSaveBlocked?.() === true : localSaveInFlightRef.current),
    [isSaveBlocked, mutationBlocked, onSaveStart],
  );

  const handleSelect = useCallback(
    (a: QuickLogActivityDefinition) => {
      if (isMutationBlocked()) return;
      setErrorReason(null);
      setErrorForActivity(null);
      setStructuredWaterError(null);
      if (a.id === "watering") {
        if (externalPersistenceBlockReason) {
          setStructuredWaterError(externalPersistenceBlockReason);
          return;
        }
        if (!growId) {
          setStructuredWaterError("Missing grow context. Nothing opened.");
          return;
        }
        const intent = buildQuickLogV2OpenIntent({ plantId, tentId, action: "water" });
        if (!intent || typeof window === "undefined") {
          setStructuredWaterError("Choose a plant or tent before logging Water.");
          return;
        }
        onBeforeStructuredWaterOpen?.();
        window.dispatchEvent(new CustomEvent(QUICK_LOG_V2_OPEN_EVENT, { detail: intent }));
        return;
      }
      setSelectedDraft(bindQuickLogActivityDraft(a.id, currentTarget));
      setNote("");
      setHarvestWet("");
      setHarvestDry("");
      setHarvestUnit("g");
      setDetailValues({});
      setOccurredAtLocal("");
      // "Captured" seeds from the launcher click when provided (Fast Add),
      // else at the moment the capture surface opens.
      setLoggedAtIso(defaultLoggedAtIso ?? seedLoggedAtIso(Date.now()));
      setPhotoFile(null);
    },
    [
      currentTarget,
      defaultLoggedAtIso,
      externalPersistenceBlockReason,
      growId,
      isMutationBlocked,
      onBeforeStructuredWaterOpen,
      plantId,
      tentId,
    ],
  );

  const handleSave = useCallback(async () => {
    if (isMutationBlocked()) return;
    if (externalPersistenceBlockReason) {
      setErrorReason(externalPersistenceBlockReason);
      setErrorForActivity(selected?.id ?? null);
      return;
    }
    if (!selected || !selectedDraft) return;
    // Re-evaluate against CURRENT context immediately before persistence.
    // This is independent of the picker/reset effect so a stale selection
    // cannot write after the grow, tent, plant, or stage changes.
    const persistenceGate = evaluateQuickLogPrePersistenceGate({
      activityId: selected.id,
      currentPlantStage: plantStage,
      selectedTarget: selectedDraft.target,
      currentTarget,
    });
    if (!persistenceGate.allowed) {
      setErrorReason(
        persistenceGate.blockedReason ??
          selected.disabledReason ??
          "This activity is not available.",
      );
      setErrorForActivity(selected.id);
      return;
    }
    if (!growId) {
      setErrorReason("Missing grow context. Nothing saved.");
      setErrorForActivity(selected.id);
      return;
    }
    // Manual sensor snapshot fence — deferred to existing card path.
    if (selected.id === "manual_sensor_snapshot" && !canPersistManualSensor) {
      setErrorReason(
        "Use the Manual Sensor Snapshot card to save readings. This section does not persist readings.",
      );
      setErrorForActivity(selected.id);
      return;
    }
    if (requiresNote && note.trim().length === 0) {
      setErrorReason("Add a short note before saving.");
      setErrorForActivity(selected.id);
      return;
    }
    // Harvest inline validation fence — never persist negative or
    // malformed weights, even if the shared sanitizer would drop them.
    if (selected.id === "harvest" && harvestWeightsInvalid) {
      setErrorReason(
        harvestWetValidation.error ??
          harvestDryValidation.error ??
          "Fix harvest weight fields before saving.",
      );
      setErrorForActivity(selected.id);
      return;
    }
    // Out-of-band number detail (e.g. manual temp/RH) blocks the save so the
    // grower's entry is corrected, not discarded behind a success receipt.
    if (detailNumbersInvalid) {
      setErrorReason(firstDetailNumberError ?? "Fix the highlighted field before saving.");
      setErrorForActivity(selected.id);
      return;
    }
    if (!occurredAtValidation.ok) {
      setErrorReason(occurredAtValidation.error ?? "Fix the happened-at field before saving.");
      setErrorForActivity(selected.id);
      return;
    }

    // Harvest optional weight details — sanitized in the shared rules
    // module. Empty / invalid / negative values are dropped, never sent.
    const extraDetails: Record<string, unknown> = {};
    let harvestDetailsForBreakdown: {
      wetWeight?: string | null;
      dryWeight?: string | null;
      weightUnit?: string | null;
    } | null = null;
    if (selected.id === "harvest") {
      const harvestPayload = buildHarvestDetailsPayload({
        wetWeight: harvestWet,
        dryWeight: harvestDry,
        weightUnit: harvestUnit,
      });
      if (harvestPayload) {
        extraDetails.harvest = harvestPayload;
        harvestDetailsForBreakdown = {
          wetWeight: harvestPayload.wetWeight ?? null,
          dryWeight: harvestPayload.dryWeight ?? null,
          weightUnit: harvestPayload.weightUnit ?? null,
        };
      }
    }

    // Generic structured activity detail (e.g. training technique). Sanitized
    // to the closed spec — out-of-set, blank, reserved-identity, and over-long
    // values are dropped, never persisted.
    const activityDetails = sanitizeQuickLogActivityDetails(selected.id, detailValues);
    if (activityDetails) {
      Object.assign(extraDetails, activityDetails);
    }

    const capturedTarget = Object.freeze({
      growId,
      tentId: tentId ?? null,
      plantId: plantId ?? null,
    });
    const acquired = onSaveStart ? onSaveStart(capturedTarget) : !localSaveInFlightRef.current;
    if (!acquired) return;
    if (!onSaveStart) localSaveInFlightRef.current = true;

    try {
      const idempotencyKey = newIdempotencyKey(selected.id);
      // Freeze BOTH timestamps once per logical submission, beside the key
      // (#317: the event route hashes p_occurred_at + p_details for dedupe).
      const submissionTimestamps = buildQuickLogSubmissionTimestamps({
        loggedAtRaw: loggedAtIso,
        occurredAtRaw: occurredAtLocal,
        now: Date.now(),
      });
      if (selected.id === "photo") {
        // Photo goes diary-only through the proven QuickLog photo-attachment
        // path (upload to the private diary-photos bucket, then one
        // diary_entries row whose photo_url COLUMN carries the bare storage
        // path — the only shape Timeline signs and renders). The event-route
        // RPC is a dead end here: it stores p_photo_url only inside details,
        // which no photo surface reads, so it would confirm an invisible photo.
        if (!user) {
          setErrorReason("Sign in to attach photos.");
          setErrorForActivity(selected.id);
          return;
        }
        if (!photoFile) {
          setErrorReason("Choose a photo before saving.");
          setErrorForActivity(selected.id);
          return;
        }
        if (photoDiaryInFlightRef.current) return;
        photoDiaryInFlightRef.current = true;
        // Tracks a successful upload so a LATER rejection (e.g. the diary
        // insert dying mid-network) can clean up the orphaned object.
        let uploadedPath: string | null = null;
        try {
          const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
          // RLS: the first path segment MUST be the uploader's auth.uid().
          const path = `${user.id}/${capturedTarget.growId}/${Date.now()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("diary-photos")
            .upload(path, photoFile, { contentType: photoFile.type, upsert: false });
          if (uploadError) {
            setErrorReason(`Photo upload failed: ${uploadError.message}`);
            setErrorForActivity(selected.id);
            return;
          }
          uploadedPath = path;
          // Structured photo detail (subject/caption) rides the same diary row.
          const photoExtraDetails: Record<string, string> = {};
          for (const [k, v] of Object.entries(extraDetails)) {
            if (typeof v === "string") photoExtraDetails[k] = v;
          }
          photoExtraDetails.logged_at = submissionTimestamps.loggedAtIso;
          const entryResult = await createQuickLogPhotoDiaryEntry({
            growId: capturedTarget.growId,
            tentId: capturedTarget.tentId,
            plantId: capturedTarget.plantId,
            photoPath: path,
            noteRaw: note,
            action: "photo",
            // Displayable type: the standalone Photo activity badges as Photo
            // on Timeline/Recent Activity (allow-listed), unlike the V2-sheet
            // attachment marker the plant-memory episodes key on.
            eventType: "photo",
            extraDetails:
              Object.keys(photoExtraDetails).length > 0 ? photoExtraDetails : null,
            // entry_at honors a backdated happened-at; defaults to now.
            now: () =>
              new Date(submissionTimestamps.occurredAtIso ?? Date.now()),
          });
          if (!entryResult.ok) {
            // (strictNullChecks is off in this app config, so cast the failure
            // branch explicitly rather than relying on discriminant narrowing.)
            const failure = entryResult as { ok: false; message: string };
            // Best-effort orphan cleanup; the entry is the source of truth.
            try {
              await supabase.storage.from("diary-photos").remove([path]);
            } catch {
              // Swallow — an orphaned object is harmless next to a false receipt.
            }
            setErrorReason(failure.message);
            setErrorForActivity(selected.id);
            return;
          }
          // Replicate the orchestration save() provides on the RPC path:
          // timeline refresh + funnel telemetry, only after confirmed success.
          dispatchQuickLogV2EntryCreated({
            createdAt: new Date().toISOString(),
            growEventId: null,
            source: "quick_log_v2",
          });
          trackQuickLogSuccess("photo", { reused: false });
        } catch {
          // A REJECTED promise (network interruption) must never escape the
          // click handler as a silent nothing: surface the failure and clean
          // up an already-uploaded object so no orphan is left behind.
          if (uploadedPath) {
            try {
              await supabase.storage.from("diary-photos").remove([uploadedPath]);
            } catch {
              // Best-effort only.
            }
          }
          setErrorReason("Photo save failed. Nothing was saved.");
          setErrorForActivity(selected.id);
          return;
        } finally {
          photoDiaryInFlightRef.current = false;
        }
      } else {
        const result = await save({
          activityId: selected.id,
          growId: capturedTarget.growId,
          tentId: capturedTarget.tentId,
          plantId: capturedTarget.plantId,
          note: note.trim().length > 0 ? note.trim() : null,
          idempotencyKey,
          extraDetails: Object.keys(extraDetails).length > 0 ? extraDetails : null,
          occurredAt: submissionTimestamps.occurredAtIso,
          loggedAt: submissionTimestamps.loggedAtIso,
        });

        if (!result.ok) {
          setErrorReason(
            result.reason === "save_failed"
              ? "Save failed. Nothing was saved."
              : (result.disabledReason ?? "Save was refused."),
          );
          setErrorForActivity(selected.id);
          return;
        }
      }

      // Success path — build saved-item using the SHARED helper so no
      // local label array can drift out of sync.
      const source = toSavedSource(selected.id);
      if (source) {
        const items = buildDailyCheckSavedItems({
          source,
          submittedAt: Date.now(),
          harvestDetails: source === "harvest" ? harvestDetailsForBreakdown : null,
        });
        if (items.length > 0) {
          setSaved((prev) => [
            ...prev,
            {
              id: `${idempotencyKey}-saved`,
              activityId: selected.id,
              item: items[0],
              target: capturedTarget,
            },
          ]);
        }
      }
      setNote("");
      setHarvestWet("");
      setHarvestDry("");
      setHarvestUnit("g");
      setDetailValues({});
      setOccurredAtLocal("");
      setLoggedAtIso("");
      setPhotoFile(null);
      setSelectedDraft(null);
      setErrorReason(null);
      setErrorForActivity(null);
    } finally {
      if (onSaveStart) onSaveEnd?.();
      else localSaveInFlightRef.current = false;
    }
  }, [
    selected,
    selectedDraft,
    currentTarget,
    growId,
    tentId,
    plantId,
    plantStage,
    note,
    requiresNote,
    save,
    canPersistManualSensor,
    harvestWet,
    harvestDry,
    harvestUnit,
    harvestWeightsInvalid,
    harvestWetValidation,
    harvestDryValidation,
    detailValues,
    detailNumbersInvalid,
    firstDetailNumberError,
    occurredAtValidation,
    occurredAtLocal,
    loggedAtIso,
    user,
    photoFile,
    onSaveStart,
    onSaveEnd,
    isMutationBlocked,
    externalPersistenceBlockReason,
  ]);

  const noContext = !growId;

  return (
    <section
      aria-label={heading}
      data-testid={testIdPrefix}
      className="rounded-2xl border border-border/60 bg-background/40 p-3 sm:p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold">{heading}</h3>
        <p
          className="text-[11px] text-muted-foreground"
          data-testid={`${testIdPrefix}-safety-hint`}
        >
          Logs are grower memory, not diagnosis.
        </p>
      </div>

      {noContext && (
        <p
          role="note"
          className="text-xs text-muted-foreground"
          data-testid={`${testIdPrefix}-no-grow`}
        >
          Select a grow to enable Quick Log actions.
        </p>
      )}

      {externalPersistenceBlockReason && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg border border-border/60 bg-secondary/30 p-2.5 text-xs text-muted-foreground"
          data-testid={`${testIdPrefix}-persistence-block`}
        >
          {externalPersistenceBlockReason}
        </p>
      )}

      <QuickLogActivityPicker
        onSelect={handleSelect}
        disabled={mutationBlocked}
        selectedId={selected?.id ?? null}
        plantStage={plantStage}
        testIdPrefix={`${testIdPrefix}-picker`}
      />

      {structuredWaterError && (
        <p
          role="alert"
          className="text-xs text-destructive"
          data-testid={`${testIdPrefix}-structured-water-error`}
        >
          {structuredWaterError}
        </p>
      )}

      {selected && selected.enabled && (
        <div
          className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-2.5"
          data-testid={`${testIdPrefix}-form`}
          data-activity-id={selected.id}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-medium">{selected.label}</p>
            <p className="text-[11px] text-muted-foreground">{selected.safetyNote}</p>
          </div>

          {selected.id === "harvest" && selectedAvailability?.disabled && (
            <p
              role="note"
              className="text-xs text-muted-foreground"
              data-testid={`${testIdPrefix}-harvest-stage-blocked`}
            >
              {selectedAvailability.disabledReason ??
                QUICK_LOG_HARVEST_STAGE_DISABLED_REASON}
            </p>
          )}

          {getQuickLogActivityDetailFields(selected.id).length > 0 && (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              data-testid={`${testIdPrefix}-detail-fields`}
            >
              {getQuickLogActivityDetailFields(selected.id).map((field) => (
                <div key={field.key} className="space-y-1">
                  <Label
                    htmlFor={`${testIdPrefix}-detail-${field.key}`}
                    className="text-[11px] text-muted-foreground"
                  >
                    {field.label}
                    {field.unit ? ` (${field.unit})` : ""} (optional)
                  </Label>
                  {field.kind === "select" ? (
                    <select
                      id={`${testIdPrefix}-detail-${field.key}`}
                      data-testid={`${testIdPrefix}-detail-${field.key}`}
                      value={detailValues[field.key] ?? ""}
                      onChange={(e) => {
                        if (isMutationBlocked()) return;
                        const v = e.target.value;
                        setDetailValues((prev) => ({ ...prev, [field.key]: v }));
                      }}
                      disabled={mutationBlocked}
                      className="w-full text-sm h-9 rounded-md border border-input bg-background px-2"
                    >
                      <option value="">Not recorded</option>
                      {(field.options ?? []).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <Input
                        id={`${testIdPrefix}-detail-${field.key}`}
                        data-testid={`${testIdPrefix}-detail-${field.key}`}
                        value={detailValues[field.key] ?? ""}
                        onChange={(e) => {
                          if (isMutationBlocked()) return;
                          const v = e.target.value;
                          setDetailValues((prev) => ({ ...prev, [field.key]: v }));
                        }}
                        disabled={mutationBlocked}
                        inputMode={field.kind === "number" ? "decimal" : undefined}
                        // Text detail is capped at the persistence limit IN the
                        // input, so nothing a grower types is ever silently
                        // truncated behind a success receipt.
                        maxLength={field.kind === "text" ? QUICK_LOG_DETAIL_TEXT_MAX : undefined}
                        aria-invalid={
                          field.kind === "number"
                            ? !(detailNumberValidations.find((v) => v.key === field.key)?.ok ?? true)
                            : undefined
                        }
                        placeholder={field.placeholder}
                        className="text-sm"
                      />
                      {field.kind === "number" &&
                        (() => {
                          const v = detailNumberValidations.find((x) => x.key === field.key);
                          return v && !v.ok ? (
                            <p
                              role="alert"
                              className="text-[11px] text-destructive"
                              data-testid={`${testIdPrefix}-detail-${field.key}-error`}
                            >
                              {v.error}
                            </p>
                          ) : null;
                        })()}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {selected.id === "training" && (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              data-testid={`${testIdPrefix}-timestamps`}
            >
              <div className="space-y-1">
                <Label
                  htmlFor={`${testIdPrefix}-occurred-at`}
                  className="text-[11px] text-muted-foreground"
                >
                  Happened at (optional — blank means now)
                </Label>
                <Input
                  id={`${testIdPrefix}-occurred-at`}
                  data-testid={`${testIdPrefix}-occurred-at`}
                  type="datetime-local"
                  value={occurredAtLocal}
                  onChange={(e) => {
                    if (isMutationBlocked()) return;
                    setOccurredAtLocal(e.target.value);
                  }}
                  disabled={mutationBlocked}
                  aria-invalid={!occurredAtValidation.ok}
                  className="text-sm"
                />
                {occurredAtValidation.error && (
                  <p
                    role="alert"
                    className="text-[11px] text-destructive"
                    data-testid={`${testIdPrefix}-occurred-at-error`}
                  >
                    {occurredAtValidation.error}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor={`${testIdPrefix}-logged-at`}
                  className="text-[11px] text-muted-foreground"
                >
                  Captured (when you logged this)
                </Label>
                <Input
                  id={`${testIdPrefix}-logged-at`}
                  data-testid={`${testIdPrefix}-logged-at`}
                  type="datetime-local"
                  // Seeded at form open as ISO; datetime-local wants the
                  // local wall-clock minute slice — derive it for display and
                  // store the grower's override back as the raw local string
                  // (the freeze point converts faithfully at submit).
                  value={
                    loggedAtIso.includes("T") && loggedAtIso.endsWith("Z")
                      ? (() => {
                          const d = new Date(loggedAtIso);
                          const pad = (n: number) => String(n).padStart(2, "0");
                          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
                            d.getDate(),
                          )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        })()
                      : loggedAtIso
                  }
                  onChange={(e) => {
                    if (isMutationBlocked()) return;
                    setLoggedAtIso(e.target.value);
                  }}
                  disabled={mutationBlocked}
                  className="text-sm"
                />
              </div>
            </div>
          )}

          {selected.id === "photo" && (
            <div className="space-y-1" data-testid={`${testIdPrefix}-photo-picker`}>
              <Label
                htmlFor={`${testIdPrefix}-photo-file`}
                className="text-[11px] text-muted-foreground"
              >
                Photo (required)
              </Label>
              <Input
                id={`${testIdPrefix}-photo-file`}
                data-testid={`${testIdPrefix}-photo-file`}
                type="file"
                accept="image/*"
                disabled={mutationBlocked}
                onChange={(e) => {
                  if (isMutationBlocked()) return;
                  const file = e.target.files?.[0] ?? null;
                  if (!file) {
                    setPhotoFile(null);
                    return;
                  }
                  const check = validatePlantProfilePhotoFile(file);
                  if (!check.ok) {
                    const failure = check as { ok: false; message: string };
                    setPhotoFile(null);
                    setErrorReason(failure.message);
                    setErrorForActivity("photo");
                    return;
                  }
                  setErrorReason(null);
                  setErrorForActivity(null);
                  setPhotoFile(file);
                }}
                className="text-sm"
              />
              {photoFile ? (
                <p
                  className="text-[11px] text-muted-foreground"
                  data-testid={`${testIdPrefix}-photo-selected`}
                >
                  Selected: {photoFile.name}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  A photo entry needs an actual image — Save stays disabled until one is chosen.
                </p>
              )}
            </div>
          )}

          {selected.id === "manual_sensor_snapshot" ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid={`${testIdPrefix}-manual-sensor-hint`}
            >
              Use the Manual Sensor Snapshot card on this page to record a reading. Manual snapshots
              stay labeled manual, not live.
            </p>
          ) : selected.id === "harvest" ? (
            <div className="space-y-2" data-testid={`${testIdPrefix}-harvest-fields`}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label
                    htmlFor={`${testIdPrefix}-harvest-wet`}
                    className="text-[11px] text-muted-foreground"
                  >
                    Wet weight (optional)
                  </Label>
                  <Input
                    id={`${testIdPrefix}-harvest-wet`}
                    data-testid={`${testIdPrefix}-harvest-wet`}
                    value={harvestWet}
                    onChange={(e) => {
                      if (isMutationBlocked()) return;
                      setHarvestWet(e.target.value);
                    }}
                    disabled={mutationBlocked}
                    inputMode="decimal"
                    placeholder="e.g. 120"
                    min={0}
                    aria-invalid={!harvestWetValidation.ok}
                    className="text-sm"
                  />
                  {harvestWetValidation.error && (
                    <p
                      role="alert"
                      className="text-[11px] text-destructive"
                      data-testid={`${testIdPrefix}-harvest-wet-error`}
                    >
                      {harvestWetValidation.error}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor={`${testIdPrefix}-harvest-dry`}
                    className="text-[11px] text-muted-foreground"
                  >
                    Dry weight (optional)
                  </Label>
                  <Input
                    id={`${testIdPrefix}-harvest-dry`}
                    data-testid={`${testIdPrefix}-harvest-dry`}
                    value={harvestDry}
                    onChange={(e) => {
                      if (isMutationBlocked()) return;
                      setHarvestDry(e.target.value);
                    }}
                    disabled={mutationBlocked}
                    inputMode="decimal"
                    placeholder="e.g. 22"
                    min={0}
                    aria-invalid={!harvestDryValidation.ok}
                    className="text-sm"
                  />
                  {harvestDryValidation.error && (
                    <p
                      role="alert"
                      className="text-[11px] text-destructive"
                      data-testid={`${testIdPrefix}-harvest-dry-error`}
                    >
                      {harvestDryValidation.error}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor={`${testIdPrefix}-harvest-unit`}
                    className="text-[11px] text-muted-foreground"
                  >
                    Weight unit
                  </Label>
                  <select
                    id={`${testIdPrefix}-harvest-unit`}
                    data-testid={`${testIdPrefix}-harvest-unit`}
                    value={harvestUnit}
                    onChange={(e) => {
                      if (isMutationBlocked()) return;
                      setHarvestUnit(e.target.value as QuickLogWeightUnit);
                    }}
                    disabled={mutationBlocked}
                    className="w-full text-sm h-9 rounded-md border border-input bg-background px-2"
                  >
                    {QUICK_LOG_WEIGHT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor={`${testIdPrefix}-note`}
                  className="text-[11px] text-muted-foreground"
                >
                  Note (optional)
                </Label>
                <Textarea
                  id={`${testIdPrefix}-note`}
                  data-testid={`${testIdPrefix}-note`}
                  value={note}
                  onChange={(e) => {
                    if (isMutationBlocked()) return;
                    setNote(e.target.value);
                  }}
                  disabled={mutationBlocked}
                  placeholder="Removed main cola, lower branches…"
                  className="min-h-[64px] text-sm"
                />
              </div>
            </div>
          ) : requiresNote ? (
            <div className="space-y-1">
              <Label htmlFor={`${testIdPrefix}-note`} className="text-[11px] text-muted-foreground">
                Note
              </Label>
              <Textarea
                id={`${testIdPrefix}-note`}
                data-testid={`${testIdPrefix}-note`}
                value={note}
                onChange={(e) => {
                  if (isMutationBlocked()) return;
                  setNote(e.target.value);
                }}
                disabled={mutationBlocked}
                placeholder="Short observation…"
                className="min-h-[64px] text-sm"
              />
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Save to record this action on the plant timeline.
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={
                mutationBlocked ||
                !!externalPersistenceBlockReason ||
                noContext ||
                selectedAvailability?.disabled ||
                selected.id === "manual_sensor_snapshot" ||
                (requiresNote && note.trim().length === 0) ||
                (selected.id === "harvest" && harvestWeightsInvalid) ||
                (selected.id === "photo" && !photoFile) ||
                detailNumbersInvalid ||
                !occurredAtValidation.ok
              }
              data-testid={`${testIdPrefix}-save`}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                if (isMutationBlocked()) return;
                setSelectedDraft(null);
                setNote("");
                setErrorReason(null);
                setErrorForActivity(null);
              }}
              disabled={mutationBlocked}
              data-testid={`${testIdPrefix}-cancel`}
            >
              Cancel
            </Button>
          </div>

          {errorReason && errorForActivity === selected.id && (
            <p
              role="alert"
              className="text-xs text-destructive"
              data-testid={`${testIdPrefix}-error`}
            >
              {errorReason}
            </p>
          )}
        </div>
      )}

      {saved.length > 0 && (
        <div
          className="rounded-lg border border-primary/30 bg-primary/[0.04] p-2.5 space-y-1.5"
          data-testid={`${testIdPrefix}-saved`}
          aria-live="polite"
        >
          <p className="text-[11px] uppercase tracking-wide text-primary/80">What was saved</p>
          <ul className="text-xs space-y-0.5">
            {saved.map((s) => (
              <li
                key={s.id}
                data-testid={`${testIdPrefix}-saved-item`}
                data-saved-activity-id={s.activityId}
                data-saved-key={s.item.key}
                data-target-grow-id={s.target.growId}
                data-target-tent-id={s.target.tentId ?? undefined}
                data-target-plant-id={s.target.plantId ?? undefined}
              >
                {s.item.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// Re-export a helper so callers/tests can reason about visible activity ids
// without duplicating taxonomy.
export const QUICK_LOG_ALL_ACTIVITIES_VISIBLE_IDS = Object.freeze(
  Object.keys(QUICK_LOG_ACTIVITY_DEFINITIONS) as QuickLogActivityId[],
);
