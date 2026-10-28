/**
 * PlantQuickLog — Gate 1 fast manual logging surface.
 *
 * Opens from Plant Detail. Slide-up bottom sheet on mobile / centered modal on
 * desktop. Single scrolling view:
 *   1) Plant context
 *   2) What changed: grow action chips + optional note detail
 *   3) Response after last change: Better/Same/Worse when this is a follow-up
 *   4) Optional photo + manual readings
 *   5) Sticky mobile-safe "Save log" button
 *
 * Safety contract is enforced by src/test/plant-quick-log.test.ts — persist
 * goes through useQuickLogV2Save → quicklog_save_manual. Photo bytes still
 * upload to diary-photos; the successful RPC persists the companion
 * details.photo_url reference, while the top-level photo_url normalization is
 * best-effort. Manual sensor values stay under
 * details.manual_sensor_snapshot with source "manual".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { rememberRecentQuickLogTarget } from "@/lib/quickLogRecentTargetStore";
import { QUICK_LOG_MANUAL_READINGS_NOTE } from "@/constants/quickLogGeneratedNoteCopy";
import { applyQuickLogV2Refresh } from "@/lib/quickLogV2RefreshRules";
import {
  buildManualSensorSnapshot,
  parseOptionalNumber,
  type QuickLogSensorInput,
} from "@/lib/quickLogRules";
import {
  PLANT_QUICK_LOG_EC_SAVE_BLOCKED_HELPER,
  plantQuickLogEcError,
} from "@/lib/plantQuickLogSensorInputRules";
import {
  computeChronologyDelta,
  type ChronologyDelta,
} from "@/lib/manualSensorChronologyDeltaRules";
import type { ManualSensorMetric } from "@/lib/manualSensorFreshnessRules";
import { usePlantManualSensorLogs } from "@/hooks/usePlantManualSensorHistory";
import { buildQuickLogPhotoGateState } from "@/lib/quickLogPhotoGateRules";
import { useTemperatureUnitPreference } from "@/hooks/useTemperatureUnitPreference";
import {
  TEMPERATURE_UNIT_SYMBOL,
  temperatureInputUnitFromPreference,
  toFahrenheitInputString,
} from "@/lib/sensorInputUnitConversion";
import {
  QUICK_LOG_ACTION_CHIPS,
  RESPONSE_CHECK_STATUSES,
  hasQuickLogActionChip,
  toggleQuickLogActionChip,
  applyResponseCheck,
  hasResponseCheck,
  isPhotoOnlyQuickLogNote,
  type QuickLogActionChip,
  type ResponseCheckStatus,
} from "@/lib/tenSecondQuickCheckRules";
import {
  createQuickLogPhotoDiaryEntry,
  hasConfirmedQuickLogPhotoDiaryEntryForOwner,
} from "@/lib/quickLogPhotoDiaryEntry";
import {
  fileClaimsPng,
  inspectQuickLogPngClaimNow,
  validateQuickLogPngClaim,
} from "@/lib/quickLogPhotoContentRules";
import {
  QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_CHANGED_EVENT,
  claimQuickLogPhotoAttachmentRecoveryLock,
  completeQuickLogPhotoAttachmentAttempt,
  getQuickLogPhotoAttachmentRecoveryRecord,
  hasQuickLogPhotoAttachmentRecoveryLock,
  recordQuickLogPhotoAttachmentRecoveryLock,
  releaseQuickLogPhotoAttachmentRecoveryLockForEntry,
} from "@/lib/quickLogPhotoAttachmentRecovery";
import { dispatchQuickLogV2EntryCreated } from "@/lib/quickLogV2EntryCreatedEvent";
import { trackQuickLogSuccess } from "@/lib/quickLogSuccessTelemetry";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";
import { buildPlantQuickLogV2SavePayload } from "@/lib/plantQuickLogV2SaveAdapter";
import type { QuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { newQuickLogSaveKey } from "@/lib/quickLogIdempotencyKey";
import {
  buildQuickLogPhotoIdentity,
  buildQuickLogSaveSignature,
  resolveQuickLogSaveKey,
  type QuickLogSaveKeyState,
} from "@/lib/quickLogSaveKeyPolicy";
import {
  classifyQuickLogThrownSaveError,
  describeQuickLogSaveFailure,
} from "@/lib/quickLogSaveErrorMessage";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plantId: string;
  plantName?: string | null;
  growId: string | null;
  tentId?: string | null;
  onSaved?: () => void;
  /**
   * When true and the sheet opens, scroll to and focus the Better/Same/Worse
   * response section — used by the missed-log recovery / follow-up prompts so
   * a tired grower lands on the status chips. Focus only, never a selection.
   */
  focusResponseCheckOnOpen?: boolean;
}

const EMPTY_SENSORS: QuickLogSensorInput = { temp: "", humidity: "", ph: "", ec: "" };

/** One Photo only submission, captured when Save is pressed. */
interface PhotoOnlyAttempt {
  scope: { ownerId: string; growId: string; tentId: string | null; plantId: string };
  entryId: string;
  path: string;
  file: File;
  note: string;
  /** True when `path` was uploaded by this attempt and no insert references it yet. */
  freshUpload: boolean;
}
const SAVE_DETAIL_HELPER = "You can add more detail later from the timeline.";
const PHOTO_ATTACHMENT_UNCONFIRMED_MESSAGE =
  "Could not confirm the photo attachment; it may still appear in history.";
// Photo only needs the browser-session fence before anything is uploaded or
// inserted. Without it, an unmount and remount could save the photo twice.
const PHOTO_FENCE_UNAVAILABLE_MESSAGE =
  "Verdant could not reserve this photo save in this browser, so nothing was saved. Allow site storage and try again, or add a note to save the photo with your log.";

function buildTimelineNote(rawNote: string, hasPhoto: boolean, hasManualReadings: boolean): string {
  const note = rawNote.trim();
  if (note) return note;
  if (hasPhoto) return "Photo attached from Quick Log.";
  if (hasManualReadings) return QUICK_LOG_MANUAL_READINGS_NOTE;
  return "";
}

function blurActiveElement() {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

export default function PlantQuickLog({
  open,
  onOpenChange,
  plantId,
  plantName,
  growId,
  tentId,
  onSaved,
  focusResponseCheckOnOpen,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { save } = useQuickLogV2Save();
  // One idempotency key per LOGICAL submission (D-B2). Held in a ref, not
  // state: it is never rendered, and a stale render must never hand the
  // server a key that does not match the payload being sent.
  const saveKeyRef = useRef<QuickLogSaveKeyState | null>(null);
  const saveInFlightRef = useRef(false);
  const saveContextRevisionRef = useRef(0);
  const pendingPhotoSaveRef = useRef<{
    key: string;
    file: File;
    path: string;
    payload: QuickLogV2SavePayload;
  } | null>(null);
  const responseSectionRef = useRef<HTMLElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const libraryFileRef = useRef<HTMLInputElement | null>(null);
  const { data: logs } = usePlantManualSensorLogs(open ? plantId : null);
  const photoGate = useMemo(() => buildQuickLogPhotoGateState(), []);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sensors, setSensors] = useState<QuickLogSensorInput>(EMPTY_SENSORS);
  // Temperature is TYPED in the grower's preferred unit and converted to °F
  // exactly once before it reaches the payload, which keeps its canonical
  // `temp_f` key. The unit is always shown on the field — never inferred.
  const tempUnit = temperatureInputUnitFromPreference(useTemperatureUnitPreference());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoAttachmentUnconfirmed, setPhotoAttachmentUnconfirmed] = useState(false);
  const [photoChecking, setPhotoChecking] = useState(false);
  const photoValidationGenerationRef = useRef(0);
  const photoOnlyAttemptRef = useRef<{ entryId: string; path: string; file: File } | null>(null);
  // True while this sheet is locked only because the session fence for its
  // target is held (by an earlier or other attempt). Other locks, such as a
  // confirmed save whose photo patch failed, never clear from fence changes.
  const sessionFenceLockedRef = useRef(false);

  useEffect(() => {
    // A draft and its asynchronous save belong to one owner, target and open
    // session. Invalidate old continuations even if that context later returns.
    saveContextRevisionRef.current += 1;
    saveInFlightRef.current = false;
    saveKeyRef.current = null;
    pendingPhotoSaveRef.current = null;
    photoOnlyAttemptRef.current = null;
    photoValidationGenerationRef.current += 1;
    setPhotoFile(null);
    setPhotoPreview(null);
    setNote("");
    setSensors(EMPTY_SENSORS);
    setError(null);
    setBusy(false);
    setPhotoChecking(false);
    const recoveryLocked = hasQuickLogPhotoAttachmentRecoveryLock({
      ownerId: user?.id ?? null,
      growId,
      tentId: tentId ?? null,
      plantId,
    });
    sessionFenceLockedRef.current = recoveryLocked;
    setPhotoAttachmentUnconfirmed(recoveryLocked);
    if (recoveryLocked) {
      setError(PHOTO_ATTACHMENT_UNCONFIRMED_MESSAGE);
    }
    if (fileRef.current) fileRef.current.value = "";
    if (libraryFileRef.current) libraryFileRef.current.value = "";
    return () => {
      saveContextRevisionRef.current += 1;
    };
  }, [open, user?.id, plantId, growId, tentId]);

  // When the exact owner-scoped diary row is readable, clear the session
  // photo lock and release Save for this plant.
  useEffect(() => {
    if (!open) return;
    const scope = {
      ownerId: user?.id ?? null,
      growId,
      tentId: tentId ?? null,
      plantId,
    };
    const recovery = getQuickLogPhotoAttachmentRecoveryRecord(scope);
    const ownerId = scope.ownerId;
    if (!recovery?.diaryEntryId || typeof ownerId !== "string" || ownerId.trim() === "") return;

    let active = true;
    const entryId = recovery.diaryEntryId;
    void hasConfirmedQuickLogPhotoDiaryEntryForOwner(ownerId, entryId).then((confirmed) => {
      if (!active || !confirmed) return;
      // Settle only this exact attempt, and never clear a different attempt's
      // claim. The save's own response settles through the same gate, so
      // whichever path is first announces the row and the other does not.
      const announce = completeQuickLogPhotoAttachmentAttempt(scope, entryId);
      const stillLocked = hasQuickLogPhotoAttachmentRecoveryLock(scope);
      sessionFenceLockedRef.current = stillLocked;
      setPhotoAttachmentUnconfirmed(stillLocked);
      if (!stillLocked) {
        setError((current) => (current === PHOTO_ATTACHMENT_UNCONFIRMED_MESSAGE ? null : current));
      }
      if (!announce) return;
      dispatchQuickLogV2EntryCreated({
        createdAt: new Date().toISOString(),
        growEventId: null,
        source: "quick_log_v2",
        activityId: "photo",
      });
      trackQuickLogSuccess("photo", { reused: false });
    });
    return () => {
      active = false;
    };
  }, [open, user?.id, plantId, growId, tentId]);

  // A sheet locked by the session fence re-checks it whenever a fence is
  // released in this page. When the original save settles after this sheet's
  // one-shot lookup missed (the insert was still pending), Save is restored
  // without a close/reopen. The original save's own path announces the row.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const scope = {
      ownerId: user?.id ?? null,
      growId,
      tentId: tentId ?? null,
      plantId,
    };
    const onRecoveryChanged = () => {
      if (!sessionFenceLockedRef.current) return;
      if (hasQuickLogPhotoAttachmentRecoveryLock(scope)) return;
      sessionFenceLockedRef.current = false;
      setPhotoAttachmentUnconfirmed(false);
      setError((current) => (current === PHOTO_ATTACHMENT_UNCONFIRMED_MESSAGE ? null : current));
    };
    window.addEventListener(QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_CHANGED_EVENT, onRecoveryChanged);
    return () => {
      window.removeEventListener(
        QUICK_LOG_PHOTO_ATTACHMENT_RECOVERY_CHANGED_EVENT,
        onRecoveryChanged,
      );
    };
  }, [open, user?.id, plantId, growId, tentId]);

  // Focus a requested response check without pre-selecting a status.
  useEffect(() => {
    if (!open || !focusResponseCheckOnOpen) return;
    const el = responseSectionRef.current;
    if (!el || typeof window === "undefined") return;
    const raf = window.requestAnimationFrame(() => {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        /* noop */
      }
      try {
        el.focus({ preventScroll: true });
      } catch {
        /* noop */
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open, focusResponseCheckOnOpen]);

  const currentCapturedAt = useMemo(() => new Date().toISOString(), [open, logs]);

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  /**
   * Payload view of the typed readings: temperature converted from the
   * entry unit into the canonical °F the snapshot contract stores. Blank or
   * unparseable stays blank — never a fabricated zero.
   */
  const sensorsForPayload: QuickLogSensorInput = useMemo(
    () => ({ ...sensors, temp: toFahrenheitInputString(sensors.temp, tempUnit) }),
    [sensors, tempUnit],
  );
  const hasManualReadings = !!buildManualSensorSnapshot(sensorsForPayload);
  const ecError = plantQuickLogEcError(sensors.ec);
  const hasPhoto = !!photoFile;
  const hasPlantResponseCheck = hasResponseCheck(note);
  const timelineNote = buildTimelineNote(note, hasPhoto, hasManualReadings);
  const hasAnyContent = timelineNote.trim().length > 0;
  const canSave =
    hasAnyContent && !ecError && !busy && !photoAttachmentUnconfirmed && !photoChecking && !!growId;

  const saveHelper = !growId
    ? "Missing grow context. This plant needs a grow before saving."
    : photoAttachmentUnconfirmed
      ? "This log was saved, but its photo attachment needs a page refresh before another log."
      : busy
        ? "Saving this log to the timeline…"
        : !hasAnyContent
          ? "Tap what changed, add a photo, or add a manual reading."
          : ecError
            ? PLANT_QUICK_LOG_EC_SAVE_BLOCKED_HELPER
            : hasPlantResponseCheck
              ? "Ready to save this plant response follow-up."
              : hasPhoto
                ? "Ready to save this photo and log to the timeline."
                : hasManualReadings
                  ? "Ready to save these manual readings to the timeline."
                  : "Ready to save what changed to the timeline.";

  function deltaFor(metric: ManualSensorMetric, raw: string): ChronologyDelta | null {
    const current = parseOptionalNumber(raw);
    return computeChronologyDelta(metric, current, currentCapturedAt, logs ?? []);
  }

  function resetForm() {
    // Resetting ends the logical submission, so the key must not survive it.
    // The success path calls resetForm() and then onOpenChange(false); clearing
    // here means rotation does not depend on a parent actually honoring that
    // close, which is the only other thing that clears the key.
    saveKeyRef.current = null;
    pendingPhotoSaveRef.current = null;
    photoOnlyAttemptRef.current = null;
    setPhotoFile(null);
    setPhotoPreview(null);
    setNote("");
    setSensors(EMPTY_SENSORS);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
    if (libraryFileRef.current) libraryFileRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    if (busy || saveInFlightRef.current) return;
    onOpenChange(next);
    if (!next) resetForm();
  }

  function handleFileSelected(file: File | null) {
    if (file !== photoFile) {
      // Choosing another file is an edit even if its metadata is identical.
      // An uncertain prior upload may already be referenced; never delete it.
      saveKeyRef.current = null;
      pendingPhotoSaveRef.current = null;
      if (photoOnlyAttemptRef.current && photoOnlyAttemptRef.current.file !== file) {
        photoOnlyAttemptRef.current = null;
      }
    }
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
    setError(null);
  }

  function handlePhotoInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0] ?? null;
    e.currentTarget.value = "";
    if (!file) return;
    if (!fileClaimsPng(file)) {
      photoValidationGenerationRef.current += 1;
      setPhotoChecking(false);
      handleFileSelected(file);
      return;
    }
    const immediate = inspectQuickLogPngClaimNow(file);
    if (immediate) {
      photoValidationGenerationRef.current += 1;
      setPhotoChecking(false);
      if (!immediate.ok) {
        setPhotoFile(null);
        setPhotoPreview(null);
        setError(immediate.message);
        return;
      }
      handleFileSelected(file);
      return;
    }
    const generation = photoValidationGenerationRef.current + 1;
    photoValidationGenerationRef.current = generation;
    setPhotoChecking(true);
    setPhotoFile(null);
    setPhotoPreview(null);
    setError(null);
    void validateQuickLogPngClaim(file).then(
      (claim) => {
        if (generation !== photoValidationGenerationRef.current) return;
        setPhotoChecking(false);
        if (!claim.ok) {
          setError(claim.message);
          return;
        }
        handleFileSelected(file);
      },
      () => {
        if (generation !== photoValidationGenerationRef.current) return;
        setPhotoChecking(false);
        setError("That photo could not be read. Try a different file.");
      },
    );
  }

  function clearPhoto() {
    handleFileSelected(null);
    if (fileRef.current) fileRef.current.value = "";
    if (libraryFileRef.current) libraryFileRef.current.value = "";
  }

  function handleResponseCheck(status: ResponseCheckStatus) {
    setNote((prev) => applyResponseCheck(prev, status));
    setError(null);
  }

  function handleActionChip(chip: QuickLogActionChip) {
    if (chip === "Photo only" && !hasPhoto && !hasQuickLogActionChip(note, chip)) {
      setError("Add a photo before marking this as photo only.");
      return;
    }
    setNote((prev) => toggleQuickLogActionChip(prev, chip));
    setError(null);
  }

  async function handleSave() {
    if (
      busy ||
      saveInFlightRef.current ||
      photoAttachmentUnconfirmed ||
      hasQuickLogPhotoAttachmentRecoveryLock({
        ownerId: user?.id ?? null,
        growId,
        tentId: tentId ?? null,
        plantId,
      })
    ) {
      return;
    }
    blurActiveElement();
    setError(null);

    if (!growId) {
      setError("Missing grow context for this plant.");
      return;
    }

    if (!hasAnyContent) {
      setError("Add what changed, a photo, or a reading before saving.");
      return;
    }

    // #2159: the inline EC error names the field; never save a negative EC.
    if (ecError) return;

    if (photoFile && !user) {
      setError("Sign in to attach photos.");
      return;
    }

    saveInFlightRef.current = true;
    setBusy(true);
    const submissionRevision = saveContextRevisionRef.current;
    const canContinue = () => saveContextRevisionRef.current === submissionRevision;
    const resolvedSaveKey = resolveQuickLogSaveKey({
      current: saveKeyRef.current,
      signature: buildQuickLogSaveSignature({
        ownerId: user?.id ?? null,
        plantId,
        growId,
        tentId: tentId ?? null,
        note: timelineNote,
        sensors: sensorsForPayload,
        photo: buildQuickLogPhotoIdentity(photoFile),
      }),
      mint: newQuickLogSaveKey,
    });
    saveKeyRef.current = resolvedSaveKey.state;
    const pending = pendingPhotoSaveRef.current;
    const retry =
      pending?.key === resolvedSaveKey.state.key && pending.file === photoFile ? pending : null;
    const photoOnly =
      !!photoFile && !!user && !hasManualReadings && isPhotoOnlyQuickLogNote(timelineNote);
    const retainedPhotoOnly =
      photoOnly && photoOnlyAttemptRef.current?.file === photoFile
        ? photoOnlyAttemptRef.current
        : null;
    let photoOnlyEntryId = retainedPhotoOnly?.entryId ?? null;
    if (photoOnly && !photoOnlyEntryId) {
      const minted = globalThis.crypto?.randomUUID?.();
      photoOnlyEntryId = typeof minted === "string" && minted.trim() !== "" ? minted : null;
    }
    let uploadedPath: string | null = retry?.path ?? retainedPhotoOnly?.path ?? null;
    // A later rejection cannot disprove an earlier uncertain commit.
    let cleanupAllowed = !retry && !retainedPhotoOnly;
    let saveConfirmed = false;
    const photoOnlyScope =
      photoOnly && user ? { ownerId: user.id, growId, tentId: tentId ?? null, plantId } : null;
    // Set once this attempt holds the session fence before its upload. Until
    // the insert starts, no diary row can exist for this id, so a stop before
    // then releases the claim (persistPhotoOnlyEntry owns it after that).
    let photoOnlyEarlyClaim = false;
    let photoOnlyInsertStarted = false;
    const releaseEarlyPhotoOnlyClaim = () => {
      if (!photoOnlyEarlyClaim || photoOnlyInsertStarted || !photoOnlyScope || !photoOnlyEntryId) {
        return;
      }
      photoOnlyEarlyClaim = false;
      releaseQuickLogPhotoAttachmentRecoveryLockForEntry(photoOnlyScope, photoOnlyEntryId);
    };
    try {
      if (photoOnly && !photoOnlyEntryId) {
        setError("Verdant could not prepare a safe photo attachment. Refresh and try again.");
        return;
      }
      if (photoOnlyScope && photoOnlyEntryId && !retry && !retainedPhotoOnly) {
        // Claim the exact scope and id BEFORE uploading, so a sheet remounted
        // for the same plant mid-upload finds the fence and cannot start a
        // second upload or insert, however the two attempts interleave.
        const claim = claimQuickLogPhotoAttachmentRecoveryLock(
          photoOnlyScope,
          photoOnlyEntryId,
          "upload",
        );
        if (claim === "held_by_other") {
          if (!canContinue()) return;
          sessionFenceLockedRef.current = true;
          setPhotoAttachmentUnconfirmed(true);
          setError(PHOTO_ATTACHMENT_UNCONFIRMED_MESSAGE);
          return;
        }
        if (claim !== "claimed") {
          if (!canContinue()) return;
          setError(PHOTO_FENCE_UNAVAILABLE_MESSAGE);
          return;
        }
        photoOnlyEarlyClaim = true;
      }
      if (photoFile && user && !retry && !retainedPhotoOnly) {
        const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${user.id}/${growId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("diary-photos")
          .upload(path, photoFile, {
            contentType: photoFile.type,
            upsert: false,
          });
        if (upErr) {
          releaseEarlyPhotoOnlyClaim();
          if (canContinue()) {
            console.error("PlantQuickLog photo upload failed", upErr);
            setError(
              "Could not upload the photo, so nothing was saved. Check your connection and try again, or remove the photo and save the log without it.",
            );
          }
          return;
        }
        uploadedPath = path;
        if (!canContinue() && !photoOnly) return;
      }

      if (uploadedPath && user && photoFile && photoOnly && photoOnlyEntryId) {
        const freshUpload = cleanupAllowed;
        cleanupAllowed = false;
        photoOnlyInsertStarted = true;
        await persistPhotoOnlyEntry(
          {
            scope: { ownerId: user.id, growId, tentId: tentId ?? null, plantId },
            entryId: photoOnlyEntryId,
            path: uploadedPath,
            file: photoFile,
            note: timelineNote,
            freshUpload,
          },
          canContinue,
        );
        return;
      }

      // Reuse the first upload and payload together. A reused RPC key returns
      // the original event, so a newly uploaded replacement would disagree
      // with its already-persisted details.photo_url.
      const built = retry
        ? { ok: true as const, payload: retry.payload }
        : buildPlantQuickLogV2SavePayload({
            plantId,
            plantName,
            growId,
            tentId: tentId ?? null,
            note: timelineNote,
            sensors: sensorsForPayload,
            photoUrl: uploadedPath,
            idempotencyKey: resolvedSaveKey.state.key,
          });
      if (!built.ok) {
        if (uploadedPath && cleanupAllowed) {
          await supabase.storage
            .from("diary-photos")
            .remove([uploadedPath])
            .catch(() => {});
        }
        if (!canContinue()) return;
        setError("Add what changed, a photo, or a reading before saving.");
        return;
      }

      const prepared =
        photoFile && uploadedPath
          ? {
              key: resolvedSaveKey.state.key,
              file: photoFile,
              path: uploadedPath,
              payload: built.payload,
            }
          : null;
      pendingPhotoSaveRef.current = prepared;
      cleanupAllowed = false;
      const result = await save(built.payload, {
        telemetryIntent: "plant_quick_log",
        canContinueNote: canContinue,
      });
      if (!canContinue()) return;
      if (!result.ok) {
        console.error("PlantQuickLog quicklog_save_manual failed", result.reason);
        cleanupAllowed = result.definitiveRejected === true && !retry;
        if (uploadedPath && cleanupAllowed) {
          await supabase.storage
            .from("diary-photos")
            .remove([uploadedPath])
            .catch(() => {});
          if (!canContinue()) return;
          if (pendingPhotoSaveRef.current === prepared) pendingPhotoSaveRef.current = null;
        }
        const failure = describeQuickLogSaveFailure(result.reason);
        setError(
          uploadedPath && !cleanupAllowed
            ? `The photo save is unconfirmed. Your draft is still here. ${failure.recovery}`
            : `${failure.message} ${failure.recovery}`,
        );
        return;
      }
      saveConfirmed = true;

      const photoAttachmentFailed = !!uploadedPath && !result.growEventId;
      if (uploadedPath && result.growEventId) {
        // quicklog_save_manual has already durably mirrored details.photo_url
        // at this point. This only normalizes the legacy top-level column; a
        // failed or empty patch must not turn that confirmed photo save into a
        // retry lock because Timeline safely falls back to details.photo_url.
        try {
          const { data: patchedEntries, error: photoErr } = await supabase
            .from("diary_entries")
            .update({ photo_url: uploadedPath })
            .filter("details->>linked_grow_event_id", "eq", result.growEventId)
            .select("id");
          if (photoErr || !Array.isArray(patchedEntries) || patchedEntries.length !== 1) {
            console.warn("PlantQuickLog companion photo_url normalization did not complete");
          }
        } catch (photoErr) {
          console.warn(
            "PlantQuickLog companion photo_url normalization did not complete",
            photoErr,
          );
        }
      }
      if (!canContinue()) return;

      // D5: this is a confirmed plant-scoped save, so it is the most recent
      // target. Without this the remembered record goes stale here and an
      // unscoped Quick Log would offer an OLDER plant — a suggestion that is
      // valid but wrong, which is worse than offering nothing. Best-effort by
      // construction: the helper swallows storage failures so a speed
      // preference can never turn a confirmed save into a failure.
      if (growId) {
        rememberRecentQuickLogTarget(
          {
            plantId,
            growId,
            tentId: tentId ?? null,
            savedAt: new Date().toISOString(),
          },
          user?.id ?? null,
        );
      }
      applyQuickLogV2Refresh(queryClient, {
        targetType: "plant",
        targetId: plantId,
        tentId: tentId ?? null,
      });
      window.dispatchEvent(
        new CustomEvent("verdant:entry-created", {
          detail: { plantId, createdAt: new Date().toISOString() },
        }),
      );
      if (photoAttachmentFailed) {
        setPhotoAttachmentUnconfirmed(true);
        setError(
          "Your log was saved, but the photo could not be attached. Refresh before creating another log so you do not duplicate it.",
        );
        return;
      }
      announceSavedPlantQuickLog();
      resetForm();
      onOpenChange(false);
      onSaved?.();
    } catch (err: unknown) {
      if (!canContinue()) return;
      if (saveConfirmed) {
        console.warn("PlantQuickLog post-save refresh failed", err);
        return;
      }
      console.error("PlantQuickLog save failed", err);
      if (uploadedPath && cleanupAllowed) {
        await supabase.storage
          .from("diary-photos")
          .remove([uploadedPath])
          .catch(() => {});
      }
      if (!canContinue()) return;
      const failure = describeQuickLogSaveFailure(classifyQuickLogThrownSaveError(err));
      setError(
        uploadedPath && !cleanupAllowed
          ? `The photo save is unconfirmed. Your draft is still here. ${failure.recovery}`
          : `${failure.message} ${failure.recovery}`,
      );
    } finally {
      // Any stop before the insert (an upload that throws included) leaves no
      // diary row for this id. A no-op once persistPhotoOnlyEntry owns the claim.
      releaseEarlyPhotoOnlyClaim();
      if (canContinue()) {
        saveInFlightRef.current = false;
        setBusy(false);
      }
    }
  }

  // Photo only writes one exact, preallocated diary row (the standalone Photo
  // activity's path). Every outcome uses the scope captured when Save was
  // pressed, because the sheet may unmount or switch plants mid-insert.
  async function persistPhotoOnlyEntry(attempt: PhotoOnlyAttempt, canContinue: () => boolean) {
    const { scope, entryId, path, file } = attempt;
    const retainUnconfirmed = (message: string) => {
      // The session fence survives unmount, close and reload, so a reopened
      // sheet can neither re-upload nor mint a second diary id.
      recordQuickLogPhotoAttachmentRecoveryLock(scope, entryId);
      if (!canContinue()) return;
      photoOnlyAttemptRef.current = { entryId, path, file };
      setPhotoAttachmentUnconfirmed(true);
      setError(message);
    };
    // Claim the exact scope and id BEFORE awaiting the insert. A sheet that
    // unmounts and remounts for the same plant while this insert is pending
    // then finds the fence and cannot upload or insert a second id.
    // Normally this attempt already holds the claim from before its upload; the
    // call then confirms it. Insert only under a durable claim: `unavailable`
    // (storage could not persist the fence) must not fall through.
    const claim = claimQuickLogPhotoAttachmentRecoveryLock(scope, entryId, "insert");
    if (claim !== "claimed") {
      // Never insert without the fence. No insert has started for this id, so
      // its own upload reservation (if any) is released; a claim held by
      // another attempt is left alone. An object this attempt just uploaded
      // is referenced by nothing, so it alone may be removed.
      if (claim === "unavailable")
        releaseQuickLogPhotoAttachmentRecoveryLockForEntry(scope, entryId);
      if (attempt.freshUpload) {
        await supabase.storage
          .from("diary-photos")
          .remove([path])
          .catch(() => {});
      }
      if (!canContinue()) return;
      if (claim === "held_by_other") {
        // Another attempt for this exact target is pending or unconfirmed.
        sessionFenceLockedRef.current = true;
        setPhotoAttachmentUnconfirmed(true);
        setError(PHOTO_ATTACHMENT_UNCONFIRMED_MESSAGE);
      } else {
        setError(PHOTO_FENCE_UNAVAILABLE_MESSAGE);
      }
      return;
    }
    let entryResult: Awaited<ReturnType<typeof createQuickLogPhotoDiaryEntry>>;
    try {
      entryResult = await createQuickLogPhotoDiaryEntry({
        ownerId: scope.ownerId,
        growId: scope.growId,
        tentId: scope.tentId,
        plantId: scope.plantId,
        photoPath: path,
        noteRaw: attempt.note,
        action: "photo",
        eventType: "photo",
        entryId,
      });
    } catch {
      retainUnconfirmed(PHOTO_ATTACHMENT_UNCONFIRMED_MESSAGE);
      return;
    }
    if (!entryResult.ok) {
      const failure = entryResult as { message: string; ambiguous?: boolean };
      if (failure.ambiguous) {
        retainUnconfirmed(failure.message);
        return;
      }
      // Definitive non-commit: no row exists for this id, so release its claim.
      releaseQuickLogPhotoAttachmentRecoveryLockForEntry(scope, entryId);
      await supabase.storage
        .from("diary-photos")
        .remove([path])
        .catch(() => {});
      if (!canContinue()) return;
      setError(failure.message);
      return;
    }
    // Confirmed: the row is durable whether or not this sheet still shows its
    // plant. Telemetry, the recent target, the Timeline refresh and the single
    // entry-created signal therefore run for the captured plant even after an
    // unmount or target switch; only the sheet's own UI completion is gated.
    // If a remounted sheet's exact reconciliation already settled this row, it
    // already sent the success telemetry and entry-created signal; do not send
    // them a second time, even if the browser refused to remove the fence.
    const alreadyAnnounced = !completeQuickLogPhotoAttachmentAttempt(scope, entryId);
    try {
      if (!alreadyAnnounced) trackQuickLogSuccess("photo", { reused: false });
      rememberRecentQuickLogTarget(
        {
          plantId: scope.plantId,
          growId: scope.growId,
          tentId: scope.tentId,
          savedAt: new Date().toISOString(),
        },
        scope.ownerId,
      );
      applyQuickLogV2Refresh(queryClient, {
        targetType: "plant",
        targetId: scope.plantId,
        tentId: scope.tentId,
      });
      if (!alreadyAnnounced) {
        window.dispatchEvent(
          new CustomEvent("verdant:entry-created", {
            detail: { plantId: scope.plantId, createdAt: new Date().toISOString() },
          }),
        );
      }
    } catch (err) {
      console.warn("PlantQuickLog post-save refresh failed", err);
    }
    if (!canContinue()) return;
    announceSavedPlantQuickLog();
    resetForm();
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-background border-border/60 max-h-[92vh] overflow-y-auto rounded-t-2xl pb-0 sm:max-w-md sm:mx-auto"
        data-testid="plant-quick-log-sheet"
        aria-describedby="plant-quick-log-subtitle"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-base">Quick Log</SheetTitle>
          <p id="plant-quick-log-subtitle" className="text-sm text-muted-foreground">
            Capture what changed. Better/Same/Worse is for the plant response afterward.
          </p>
        </SheetHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
          className="grid gap-4 mt-4"
        >
          <section
            className="rounded-xl border border-border/50 bg-secondary/10 p-3"
            aria-labelledby="plant-quick-log-plant-heading"
            data-testid="plant-quick-log-plant-section"
          >
            <h3 id="plant-quick-log-plant-heading" className="text-sm font-semibold">
              1. Plant
            </h3>
            <p
              className="mt-1 text-sm text-foreground"
              aria-label="Selected plant for this Quick Log"
            >
              {plantName || "Selected plant"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This log will attach to the current plant timeline.
            </p>
          </section>

          <section
            className="grid gap-3"
            aria-labelledby="plant-quick-log-action-heading"
            data-testid="plant-quick-log-observation-section"
          >
            <div>
              <h3 id="plant-quick-log-action-heading" className="text-sm font-semibold">
                2. What changed?
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Tap the grow action. This is the thing the plant will respond to.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose any that apply. Tap again to remove.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Quick Log grow action">
              {QUICK_LOG_ACTION_CHIPS.map((chip) => (
                <Button
                  key={chip}
                  type="button"
                  variant={hasQuickLogActionChip(note, chip) ? "default" : "outline"}
                  aria-pressed={hasQuickLogActionChip(note, chip)}
                  aria-label={`Log action ${chip}`}
                  data-testid={`plant-quick-log-action-${chip
                    .toLowerCase()
                    .replace(/\s*\/\s*/g, "-")
                    .replace(/\s+/g, "-")}`}
                  onClick={() => handleActionChip(chip)}
                  className="min-h-11 rounded-xl px-2 text-sm font-semibold"
                >
                  {chip}
                </Button>
              ))}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="plant-quick-log-note" className="text-sm">
                Grower notes (optional)
              </Label>
              <Textarea
                id="plant-quick-log-note"
                data-testid="plant-quick-log-note"
                aria-label="Quick Log grow action note"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  setError(null);
                }}
                placeholder="Example: Watered 1 gal, raised light, spotted yellow tips..."
                rows={4}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">
                Quick Log captures what changed. Verdant can ask how she responded later.
              </p>
            </div>
          </section>

          <section
            ref={responseSectionRef}
            tabIndex={-1}
            className="grid gap-3 rounded-xl border border-border/50 bg-secondary/10 p-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            aria-labelledby="plant-quick-log-response-heading"
            data-testid="plant-quick-log-response-section"
          >
            <div>
              <h3 id="plant-quick-log-response-heading" className="text-sm font-semibold">
                3. Response follow-up
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Use this when you are checking how the plant responded after a previous change.
              </p>
            </div>
            <div
              className="grid grid-cols-3 gap-2"
              role="group"
              aria-label="Plant response after a previous change"
            >
              {RESPONSE_CHECK_STATUSES.map((status) => (
                <Button
                  key={status}
                  type="button"
                  variant="outline"
                  aria-label={`Response check ${status}`}
                  data-testid={`plant-response-check-${status.toLowerCase()}`}
                  onClick={() => handleResponseCheck(status)}
                  className="min-h-12 rounded-xl px-2 text-base font-semibold"
                >
                  {status}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Better/Same/Worse records the plant response, not the grow action.
            </p>
          </section>

          <section
            className="grid gap-4"
            aria-labelledby="plant-quick-log-optional-heading"
            data-testid="plant-quick-log-optional-section"
          >
            <div>
              <h3 id="plant-quick-log-optional-heading" className="text-sm font-semibold">
                4. Optional details
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Add a photo or manual readings only if they help.
              </p>
            </div>

            <div className="grid gap-2" data-testid="plant-quick-log-photo-zone">
              <Label className="text-sm">Photo</Label>
              {photoPreview ? (
                <div className="relative aspect-[4/3] w-full rounded-xl border-2 border-dashed border-border/60 overflow-hidden bg-secondary/30">
                  <img
                    src={photoPreview}
                    alt="Selected Quick Log photo preview"
                    className="h-full w-full object-cover"
                    data-testid="plant-quick-log-photo-preview"
                  />
                  <button
                    type="button"
                    onClick={clearPhoto}
                    aria-label="Remove photo"
                    data-testid="plant-quick-log-photo-remove"
                    className="absolute top-2 right-2 z-10 rounded-full bg-background/85 backdrop-blur p-1.5 border border-border/60 hover:bg-background"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileRef.current?.click()}
                      data-testid="plant-quick-log-take-photo-button"
                      aria-label={photoGate.takePhotoLabel}
                      aria-controls="plant-quick-log-photo-input"
                      className="h-12"
                    >
                      <Camera className="h-4 w-4 mr-2" aria-hidden="true" />
                      {photoGate.takePhotoLabel}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => libraryFileRef.current?.click()}
                      data-testid="plant-quick-log-choose-library-button"
                      aria-label={photoGate.chooseLibraryLabel}
                      aria-controls="plant-quick-log-photo-library-input"
                      className="h-12"
                    >
                      {photoGate.chooseLibraryLabel}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">A photo can be enough for today.</p>
                </div>
              )}
              <input
                ref={fileRef}
                id="plant-quick-log-photo-input"
                name="plant-quick-log-photo-camera"
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label={photoGate.cameraInputAriaLabel}
                tabIndex={-1}
                onChange={handlePhotoInputChange}
                data-testid="plant-quick-log-photo-input"
              />
              <input
                ref={libraryFileRef}
                id="plant-quick-log-photo-library-input"
                name="plant-quick-log-photo-library"
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label={photoGate.libraryInputAriaLabel}
                tabIndex={-1}
                onChange={handlePhotoInputChange}
                data-testid="plant-quick-log-photo-library-input"
              />
            </div>

            <fieldset
              className="grid grid-cols-2 gap-2 rounded-xl border border-border/50 bg-secondary/10 p-3"
              data-testid="plant-quick-log-sensors"
              aria-describedby="plant-quick-log-manual-readings-helper"
            >
              <legend className="col-span-2 mb-1 text-sm font-medium">Manual readings</legend>
              <p
                id="plant-quick-log-manual-readings-helper"
                className="col-span-2 mb-1 text-xs text-muted-foreground"
              >
                Optional. Manual readings are not live sensor data.
              </p>
              <SensorField
                id="plant-quick-log-temp"
                label={`Temp (${TEMPERATURE_UNIT_SYMBOL[tempUnit]})`}
                value={sensors.temp}
                onChange={(v) => {
                  setSensors((s) => ({ ...s, temp: v }));
                  setError(null);
                }}
                inputMode="decimal"
                step="any"
                delta={deltaFor("temp_f", sensorsForPayload.temp)}
              />
              <SensorField
                id="plant-quick-log-humidity"
                label="Humidity (%)"
                value={sensors.humidity}
                onChange={(v) => {
                  setSensors((s) => ({ ...s, humidity: v }));
                  setError(null);
                }}
                inputMode="decimal"
                step="any"
                delta={deltaFor("humidity_percent", sensors.humidity)}
              />
              <SensorField
                id="plant-quick-log-ph"
                label="pH"
                value={sensors.ph}
                onChange={(v) => {
                  setSensors((s) => ({ ...s, ph: v }));
                  setError(null);
                }}
                inputMode="decimal"
                step="0.1"
                delta={deltaFor("ph", sensors.ph)}
              />
              <SensorField
                id="plant-quick-log-ec"
                label="EC"
                value={sensors.ec}
                onChange={(v) => {
                  setSensors((s) => ({ ...s, ec: v }));
                  setError(null);
                }}
                inputMode="decimal"
                step="0.01"
                delta={deltaFor("ec", sensors.ec)}
                error={ecError}
              />
            </fieldset>
          </section>

          {error && (
            <p
              role="alert"
              aria-live="assertive"
              data-testid="plant-quick-log-error"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="sticky bottom-0 z-10 -mx-6 border-t border-border/50 bg-background/95 px-6 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
            <p
              id="plant-quick-log-save-helper"
              data-testid="plant-quick-log-save-helper"
              className="mb-1 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {saveHelper}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">{SAVE_DETAIL_HELPER}</p>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave}
              data-testid="plant-quick-log-save"
              aria-label="Save Quick Log"
              aria-describedby="plant-quick-log-save-helper"
              className={cn(
                "w-full h-12 text-base font-medium",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "transition-none",
              )}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save log"
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

interface SensorFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode: "decimal" | "numeric";
  step: string;
  delta: ChronologyDelta | null;
  error?: string | null;
}

function SensorField({
  id,
  label,
  value,
  onChange,
  inputMode,
  step,
  delta,
  error,
}: SensorFieldProps) {
  const errorId = `${id}-error`;
  const deltaTone =
    delta?.direction === "up"
      ? "text-primary"
      : delta?.direction === "down"
        ? "text-amber-400/90"
        : "text-muted-foreground";
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        data-testid={id}
        type="number"
        inputMode={inputMode}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="text-base"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <span id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
      {delta && (
        <span
          data-testid={`${id}-delta`}
          data-direction={delta.direction}
          className={cn("text-[10px] leading-tight", deltaTone)}
        >
          {delta.label}
        </span>
      )}
    </div>
  );
}

function announceSavedPlantQuickLog() {
  toast.success("Log saved to timeline.");
}
