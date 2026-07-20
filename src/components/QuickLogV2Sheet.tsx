import { useState, useEffect, useMemo, useRef, type ChangeEvent } from "react";
import { newQuickLogSaveKey } from "@/lib/quickLogIdempotencyKey";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useInRouterContext, useNavigate } from "react-router-dom";
import {
  buildQuickLogTimelineNavTarget,
  QUICK_LOG_TIMELINE_CTA_LABEL,
} from "@/lib/quickLogTimelineNavigationTarget";
import { navigateToTimelineAnchor } from "@/lib/timelineAnchorNavigation";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { usePlants } from "@/hooks/use-plants";
import { useTents } from "@/hooks/use-tents";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";

import {
  buildQuickLogV2TargetOptions,
  resolveQuickLogV2Target,
  EMPTY_QUICKLOG_V2_FORM,
  type QuickLogV2FormState,
  type QuickLogV2Action,
  type ResolvedQuickLogV2Target,
} from "@/lib/quickLogV2Rules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { applyQuickLogV2Refresh } from "@/lib/quickLogV2RefreshRules";
import { createQuickLogPhotoDiaryEntry } from "@/lib/quickLogPhotoDiaryEntry";
import { createQuickLogVideoDiaryEntry } from "@/lib/quickLogVideoDiaryEntry";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  createBrowserVideoDurationProber,
  validateVideoAttachment,
} from "@/lib/videoAttachmentRules";
import { buildQuickLogTargetPanel } from "@/lib/quickLogTargetPanelViewModel";
import QuickLogTargetPanel from "@/components/QuickLogTargetPanel";
import { useGrows } from "@/store/grows";
import { dispatchQuickLogV2EntryCreated } from "@/lib/quickLogV2EntryCreatedEvent";
import { buildQuickLogPhotoGateState } from "@/lib/quickLogPhotoGateRules";
import {
  EMPTY_QUICKLOG_FEEDING_FORM,
  FEEDING_SAVE_FAILURE_MESSAGE,
  FEEDING_SAVE_SUCCESS_MESSAGE,
  buildFeedingFormPayload,
  feedingFormReasonToHelper,
  isFeedingFormPristine,
  type QuickLogFeedingFormState,
} from "@/lib/quickLogFeedingFormViewModel";
import { writeFeedingTypedEvent } from "@/lib/writeFeedingTypedEvent";
import QuickLogFeedingForm from "@/components/QuickLogFeedingForm";
import QuickLogWateringForm from "@/components/QuickLogWateringForm";
import {
  EMPTY_QUICKLOG_WATERING_FORM,
  WATERING_SAVE_FAILURE_MESSAGE,
  WATERING_SAVE_SUCCESS_MESSAGE,
  buildWateringFormPayload,
  wateringFormReasonToHelper,
  type QuickLogWateringFormState,
} from "@/lib/quickLogWateringFormViewModel";
import {
  writeQuickLogWateringTypedEvent,
  type WateringTypedEventInput,
} from "@/lib/writeQuickLogWateringTypedEvent";
import { buildQuickLogWateringContext } from "@/lib/quickLogWateringContextViewModel";
import QuickLogMaturityEvidenceFields from "@/components/QuickLogMaturityEvidenceFields";
import {
  buildFeedingDefaults,
  applyFeedingDefaultsToForm,
  FEEDING_DEFAULTS_LABEL,
} from "@/lib/feedingDefaultsViewModel";
import { useRecentFeedingsForDefaults } from "@/hooks/useRecentFeedingsForDefaults";
import {
  EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM,
  buildQuickLogMaturityEvidenceDetails,
  quickLogMaturityEvidenceReasonToMessage,
  type QuickLogMaturityEvidenceFormState,
} from "@/lib/quickLogMaturityEvidenceRules";
import { quickLogReasonToOperatorMessage } from "@/lib/quickLogSaveErrorMessage";
import {
  QUICK_LOG_POST_SAVE_VIEW_LABEL,
  QUICK_LOG_POST_SAVE_ANOTHER_LABEL,
  QUICK_LOG_POST_SAVE_CLOSE_LABEL,
  QUICK_LOG_POST_SAVE_TITLE,
  QUICK_LOG_SAVE_FAILED_MESSAGE,
  QUICK_LOG_CLOSE_BLOCKED_HINT,
  buildQuickLogPostSaveMessage,
  buildQuickLogPostSaveDescription,
  rotateQuickLogIdempotencyKey,
  shouldAllowQuickLogSave,
  shouldBlockQuickLogClose,
  type QuickLogPostSaveSuccess,
} from "@/lib/quickLogSaveGuardRules";
import { trackQuickLogSuccess } from "@/lib/quickLogSuccessTelemetry";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTargetKey?: string | null;
}

interface QuickLogVideoMeta {
  mime: string;
  sizeBytes: number;
  durationS: number;
}

type QuickLogAttachmentWriteResult =
  | { ok: true }
  | { ok: false; message: string; ambiguous?: boolean };

interface LockedWateringSubmission {
  payload: WateringTypedEventInput;
  resolved: ResolvedQuickLogV2Target;
  photoFile: File | null;
  videoFile: File | null;
  videoMeta: QuickLogVideoMeta | null;
  note: string;
  action: "water";
}

const NOTE_LIMIT = 500;

export default function QuickLogV2Sheet({ open, onOpenChange, defaultTargetKey }: Props) {
  const { user } = useAuth();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const videoDiaryInFlightRef = useRef(false);
  const plantsQ = usePlants() as {
    data?: unknown[];
    isLoading?: boolean;
    isError?: boolean;
    refetch?: () => void;
  };
  const tentsQ = useTents() as {
    data?: unknown[];
    isLoading?: boolean;
    isError?: boolean;
    refetch?: () => void;
  };
  const plants = useMemo(
    () => (plantsQ.data as Parameters<typeof buildQuickLogV2TargetOptions>[1]) ?? [],
    [plantsQ.data],
  );
  const tents = useMemo(
    () => (tentsQ.data as Parameters<typeof buildQuickLogV2TargetOptions>[0]) ?? [],
    [tentsQ.data],
  );
  const queryClient = useQueryClient();
  const inRouter = useInRouterContext();
  // `useNavigate` throws when called outside a Router. The sheet is
  // always mounted inside the app's Router in production, but some
  // tests mount it bare — fall back to a no-op navigator in that case.
  // Hook order is preserved because `inRouter` is stable across renders.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const navigate = inRouter ? useNavigate() : null;
  const { save, saving } = useQuickLogV2Save();

  function navigateToTimeline(href: string, hash: string, path: string) {
    navigateToTimelineAnchor(
      { path, hash, href },
      {
        navigate: navigate ?? null,
        currentPath: typeof window !== "undefined" ? (window.location?.pathname ?? null) : null,
      },
    );
  }

  function showTimelineConfirmation(
    message: string,
    scope: {
      targetType: "plant" | "tent" | null;
      targetId: string | null;
      tentId: string | null;
      growEventId?: string | null;
    },
  ) {
    const nav = buildQuickLogTimelineNavTarget({
      targetType: scope.targetType,
      targetId: scope.targetId,
      growEventId: scope.growEventId ?? null,
    });
    toast.success(message, {
      action: {
        label: QUICK_LOG_TIMELINE_CTA_LABEL,
        onClick: () => navigateToTimeline(nav.href, nav.hash, nav.path),
      },
    });
  }

  const [form, setForm] = useState<QuickLogV2FormState>(EMPTY_QUICKLOG_V2_FORM);
  const [feedingForm, setFeedingForm] = useState<QuickLogFeedingFormState>(
    EMPTY_QUICKLOG_FEEDING_FORM,
  );
  const [wateringForm, setWateringForm] = useState<QuickLogWateringFormState>(
    EMPTY_QUICKLOG_WATERING_FORM,
  );
  const [maturityEvidenceForm, setMaturityEvidenceForm] =
    useState<QuickLogMaturityEvidenceFormState>(EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM);
  const [feedingSaving, setFeedingSaving] = useState(false);
  const [wateringSaving, setWateringSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMeta, setVideoMeta] = useState<QuickLogVideoMeta | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoChecking, setVideoChecking] = useState(false);
  const [feedingDefaultsApplied, setFeedingDefaultsApplied] = useState(false);
  const [postSave, setPostSave] = useState<QuickLogPostSaveSuccess | null>(null);
  const [wateringRetryPending, setWateringRetryPending] = useState(false);
  const [wateringSubmissionLocked, setWateringSubmissionLocked] = useState(false);
  // Synchronous in-flight guard. The save-state flags are React
  // state and don't flip until the next paint, so rapid double-clicks
  // can slip a second save through. This ref locks the entry point
  // during the same tick.
  const saveInFlightRef = useRef(false);
  // Rotates on "Log another" so a fresh save cycle can't reuse the
  // previous saved-summary state. Bumped whenever the grower starts
  // a new logical submission from the same open sheet.
  const idempotencyKeyRef = useRef(1);
  // Server-side idempotency key for quicklog_save_manual. One key per
  // LOGICAL submission: it stays stable across retries (so the RPC
  // dedupes instead of double-writing the diary) and rotates only when
  // a new submission starts ("Log another" / full success).
  const saveIdempotencyKeyRef = useRef<string>(newQuickLogSaveKey());
  // A server/transport failure can be ambiguous: the first call may have
  // committed even if its response never reached the browser. Keep the exact
  // Water payload immutable across Retry so the reused idempotency key can
  // never confirm a different target, timestamp, or set of measurements.
  const wateringRetrySubmissionRef = useRef<LockedWateringSubmission | null>(null);
  // Synchronous companion to the presenter state. It closes the same-tick
  // race where a grower taps Save and then changes target/action/media before
  // React has painted the disabled controls.
  const wateringSubmissionLockedRef = useRef(false);
  // Set only when a server/transport result is ambiguous. Local validation or
  // upload failures release the draft; an uncertain RPC keeps it immutable so
  // Retry can only confirm the original logical record.
  const keepWateringSubmissionLockedRef = useRef(false);
  // Async video metadata probes must finish before a save can capture media.
  // The generation token prevents an old close/reopen or target/action draft
  // from installing a stale file when its probe resolves late.
  const videoValidationGenerationRef = useRef(0);
  const videoValidationInFlightRef = useRef(false);
  // Dedicated synchronous guard for the photo-diary insert path so
  // rapid re-taps during photo capture/upload cannot enqueue a second
  // insert before the first resolves. Reset in try/finally.
  const photoDiaryInFlightRef = useRef(false);

  const options = useMemo(() => buildQuickLogV2TargetOptions(tents, plants), [tents, plants]);

  const resolvedTarget = useMemo(
    () => resolveQuickLogV2Target(options, form.selectedKey),
    [options, form.selectedKey],
  );
  const { grows } = useGrows();
  const targetPanel = useMemo(
    () =>
      buildQuickLogTargetPanel({
        resolved: resolvedTarget,
        plants: plants as Parameters<typeof buildQuickLogTargetPanel>[0]["plants"],
        tents: tents as Parameters<typeof buildQuickLogTargetPanel>[0]["tents"],
        grows,
      }),
    [resolvedTarget, plants, tents, grows],
  );
  const wateringContext = useMemo(
    () =>
      buildQuickLogWateringContext({
        resolved: resolvedTarget,
        plants: plants as Parameters<typeof buildQuickLogWateringContext>[0]["plants"],
        tents: tents as Parameters<typeof buildQuickLogWateringContext>[0]["tents"],
        grows: grows as Parameters<typeof buildQuickLogWateringContext>[0]["grows"],
      }),
    [resolvedTarget, plants, tents, grows],
  );
  const resolvedContext = resolvedTarget.ok
    ? {
        plantId: resolvedTarget.plantId ?? null,
        tentId: resolvedTarget.tentId ?? null,
        growId: resolvedTarget.growId ?? null,
      }
    : { plantId: null, tentId: null, growId: null };

  const recentFeedingsQ = useRecentFeedingsForDefaults({
    plantId: resolvedContext.plantId,
    tentId: resolvedContext.tentId,
    growId: resolvedContext.growId,
  }) as { data?: unknown[] };
  const feedingDefaults = useMemo(
    () =>
      buildFeedingDefaults({
        rawEntries: recentFeedingsQ.data ?? [],
        plantId: resolvedContext.plantId,
        tentId: resolvedContext.tentId,
        growId: resolvedContext.growId,
      }),
    [recentFeedingsQ.data, resolvedContext.plantId, resolvedContext.tentId, resolvedContext.growId],
  );

  const isLoadingContext = Boolean(plantsQ.isLoading || tentsQ.isLoading);
  const hasFetchError = Boolean(plantsQ.isError || tentsQ.isError);
  const hasNoTargets = !isLoadingContext && !hasFetchError && options.length === 0;
  const contextBlocked = isLoadingContext || hasFetchError || hasNoTargets;

  const selectedTargetMissing = !contextBlocked && !form.selectedKey;
  const noteLength = form.note.length;
  const volumeMissing = form.action === "water" && wateringForm.volumeMl.trim() === "";
  const showMaturityEvidence =
    form.action !== "feed" && resolvedTarget.ok && resolvedTarget.targetType === "plant";
  const saveHelper = wateringRetryPending
    ? "Retry sends the exact same watering record. Close and reopen Quick Log to make changes."
    : getSaveHelperMessage({
        contextBlocked,
        isLoadingContext,
        hasFetchError,
        hasNoTargets,
        selectedTargetMissing,
        volumeMissing,
        saving: saving || feedingSaving || wateringSaving,
      });

  function resetPhotoSelection() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";
  }

  function resetVideoSelection() {
    videoValidationGenerationRef.current += 1;
    videoValidationInFlightRef.current = false;
    setVideoChecking(false);
    setVideoFile(null);
    setVideoMeta(null);
    if (videoPreview) {
      try {
        URL.revokeObjectURL(videoPreview);
      } catch {
        /* noop */
      }
    }
    setVideoPreview(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  useEffect(() => {
    // Closing or reopening invalidates any metadata probe still resolving for
    // the previous draft. A stale completion can never repopulate the sheet.
    resetVideoSelection();
    if (open) {
      setForm({
        ...EMPTY_QUICKLOG_V2_FORM,
        selectedKey: defaultTargetKey ?? null,
      });
      setFeedingForm(EMPTY_QUICKLOG_FEEDING_FORM);
      setWateringForm(EMPTY_QUICKLOG_WATERING_FORM);
      setMaturityEvidenceForm(EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM);
      setFeedingDefaultsApplied(false);
      setLocalError(null);
      setSaveStatus("");
      setPostSave(null);
      setWateringRetryPending(false);
      setWateringSubmissionLocked(false);
      wateringRetrySubmissionRef.current = null;
      wateringSubmissionLockedRef.current = false;
      keepWateringSubmissionLockedRef.current = false;
      saveInFlightRef.current = false;
      idempotencyKeyRef.current = 1;
      saveIdempotencyKeyRef.current = newQuickLogSaveKey();
      resetPhotoSelection();
    }
  }, [open, defaultTargetKey]);

  // One-shot prefill of the feeding form with last-used defaults. Runs only
  // when the Feed action is active, the form is still pristine, defaults
  // exist, and we have not yet applied them for this open session.
  useEffect(() => {
    if (!open) return;
    if (form.action !== "feed") return;
    if (feedingDefaultsApplied) return;
    if (!feedingDefaults.defaults) return;
    // Only prefill if the user has not started typing — preserves manual input.
    if (!isFeedingFormPristine(feedingForm)) return;
    setFeedingForm(applyFeedingDefaultsToForm(feedingDefaults));
    setFeedingDefaultsApplied(true);
  }, [open, form.action, feedingDefaults, feedingDefaultsApplied, feedingForm]);

  // Idempotent: the note field receives value updates from multiple event
  // paths (onChange + onInput + onCompositionEnd + onBlur), which often
  // fire for the same user action. Returning the SAME object when the
  // value is unchanged lets React bail out of the re-render, so duplicate
  // event paths cost nothing and IME composition stays smooth.
  const setField = <K extends keyof QuickLogV2FormState>(k: K, v: QuickLogV2FormState[K]) => {
    if (wateringSubmissionLockedRef.current) return;
    setForm((prev) => (prev[k] === v ? prev : { ...prev, [k]: v }));
  };

  const handleAction = (a: QuickLogV2Action) => {
    if (wateringSubmissionLockedRef.current) return;
    const prev = form.action;
    if (prev !== a && videoValidationInFlightRef.current) resetVideoSelection();
    setField("action", a);
    setLocalError(null);
    setSaveStatus("");
    if (prev === a) return;
    // Leaving feed → clear feeding-only draft + defaults-applied flag so
    // a stale line/products list can't ride along into a note/water save.
    if (prev === "feed") {
      setFeedingForm(EMPTY_QUICKLOG_FEEDING_FORM);
      setFeedingDefaultsApplied(false);
    }
    // Water-only measurements and manual observations never ride along when
    // the grower changes actions. Returning to Water starts a fresh record.
    if (prev === "water") {
      setWateringForm(EMPTY_QUICKLOG_WATERING_FORM);
    }
    // Entering feed → maturity evidence surface hides; clear its draft
    // so stale plant-maturity notes don't get retained under the hood.
    if (a === "feed") {
      setMaturityEvidenceForm(EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM);
    }
  };

  const photoGate = useMemo(() => buildQuickLogPhotoGateState(), []);

  function handlePhotoSelected(file: File | null) {
    if (wateringSubmissionLockedRef.current) return;
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
    setLocalError(null);
    setSaveStatus(file ? "Photo selected. Add a note if helpful, then save." : "");
  }

  function handlePhotoInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0] ?? null;
    if (!file) return;
    handlePhotoSelected(file);
    e.currentTarget.value = "";
  }

  async function handleVideoInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (wateringSubmissionLockedRef.current) return;
    const file = e.currentTarget.files?.[0] ?? null;
    e.currentTarget.value = "";
    if (!file) return;
    const validationGeneration = videoValidationGenerationRef.current + 1;
    videoValidationGenerationRef.current = validationGeneration;
    videoValidationInFlightRef.current = true;
    setVideoChecking(true);
    setSaveStatus("Checking video…");
    try {
      const meta = await validateVideoAttachment(file, createBrowserVideoDurationProber());
      if (validationGeneration !== videoValidationGenerationRef.current) return;
      if (meta.ok !== true) {
        setLocalError(meta.message);
        setSaveStatus("");
        return;
      }
      if (wateringSubmissionLockedRef.current) return;
      if (videoPreview) {
        try {
          URL.revokeObjectURL(videoPreview);
        } catch {
          /* noop */
        }
      }
      setVideoFile(file);
      setVideoMeta({ mime: meta.mime, sizeBytes: meta.sizeBytes, durationS: meta.durationS });
      setVideoPreview(URL.createObjectURL(file));
      setLocalError(null);
      setSaveStatus("Video selected. Add a note if helpful, then save.");
    } catch {
      if (validationGeneration !== videoValidationGenerationRef.current) return;
      setLocalError("That video could not be read. Try a different file.");
      setSaveStatus("");
    } finally {
      if (validationGeneration === videoValidationGenerationRef.current) {
        videoValidationInFlightRef.current = false;
        setVideoChecking(false);
      }
    }
  }

  async function uploadQuickLogVideo(
    growId: string,
    file: File | null,
  ): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
    if (!file) return { ok: false, message: "No video selected." };
    if (!user) return { ok: false, message: "Sign in to attach videos." };
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    const path = `${user.id}/${growId}/${Date.now()}.${ext}`;
    try {
      const { error } = await supabase.storage.from("diary-videos").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) return { ok: false, message: `Video upload failed: ${error.message}` };
      return { ok: true, path };
    } catch {
      return { ok: false, message: "Video upload failed. Try again." };
    }
  }

  async function createVideoDiaryEntry(input: {
    growId: string;
    tentId: string | null;
    plantId: string | null;
    videoPath: string;
    mime: string;
    sizeBytes: number;
    durationS: number;
    noteRaw: string;
    action: QuickLogV2Action;
  }): Promise<QuickLogAttachmentWriteResult> {
    if (videoDiaryInFlightRef.current) {
      return { ok: false, message: "Video diary entry already in progress." };
    }
    videoDiaryInFlightRef.current = true;
    try {
      return await createQuickLogVideoDiaryEntry({
        growId: input.growId,
        tentId: input.tentId,
        plantId: input.plantId,
        videoPath: input.videoPath,
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        durationS: input.durationS,
        noteRaw: input.noteRaw,
        action: input.action,
      });
    } catch {
      return {
        ok: false,
        message: "Could not confirm the video attachment; it may still appear in history.",
        ambiguous: true,
      };
    } finally {
      videoDiaryInFlightRef.current = false;
    }
  }

  async function uploadQuickLogPhoto(
    growId: string,
    file: File | null,
  ): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
    if (!file) return { ok: false, message: "No photo selected." };
    if (!user) return { ok: false, message: "Sign in to attach photos." };
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/${growId}/${Date.now()}.${ext}`;
    try {
      const { error } = await supabase.storage.from("diary-photos").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) return { ok: false, message: `Photo upload failed: ${error.message}` };
      return { ok: true, path };
    } catch {
      return { ok: false, message: "Photo upload failed. Try again." };
    }
  }

  async function createPhotoDiaryEntry(input: {
    growId: string;
    tentId: string | null;
    plantId: string | null;
    photoPath: string;
    noteRaw: string;
    action: QuickLogV2Action;
  }): Promise<QuickLogAttachmentWriteResult> {
    // Sync re-entry guard: if a photo-diary insert is already in
    // flight, drop the second call rather than creating a duplicate
    // entry. The outer handleSave guard covers the main save path,
    // but this local ref protects the smallest surface so any future
    // caller inherits the same guarantee without broadening the write
    // helper. The actual insert lives in `createQuickLogPhotoDiaryEntry`
    // so this presenter stays free of direct `supabase.from(...)` writes.
    if (photoDiaryInFlightRef.current) {
      return { ok: false, message: "Photo diary entry already in progress." };
    }
    photoDiaryInFlightRef.current = true;
    try {
      return await createQuickLogPhotoDiaryEntry({
        growId: input.growId,
        tentId: input.tentId,
        plantId: input.plantId,
        photoPath: input.photoPath,
        noteRaw: input.noteRaw,
        action: input.action,
      });
    } catch {
      return {
        ok: false,
        message: "Could not confirm the photo attachment; it may still appear in history.",
        ambiguous: true,
      };
    } finally {
      photoDiaryInFlightRef.current = false;
    }
  }

  const handleSave = async () => {
    if (videoValidationInFlightRef.current) {
      setLocalError("Wait for the video check to finish before saving.");
      return;
    }
    // Synchronous re-entry guard: prevents a rapid double-click from
    // scheduling two RPC saves before React flips `saving` state.
    if (
      !shouldAllowQuickLogSave({
        saving,
        inFlight: saveInFlightRef.current,
        postSaveShown: postSave !== null,
      })
    ) {
      return;
    }
    const lockWateringSubmission =
      form.action === "water" || wateringRetrySubmissionRef.current !== null;
    if (lockWateringSubmission) {
      wateringSubmissionLockedRef.current = true;
      keepWateringSubmissionLockedRef.current = false;
      setWateringSubmissionLocked(true);
      setWateringSaving(true);
    }
    saveInFlightRef.current = true;
    try {
      await runHandleSave();
    } finally {
      saveInFlightRef.current = false;
      if (lockWateringSubmission) {
        setWateringSaving(false);
        if (!keepWateringSubmissionLockedRef.current) {
          wateringSubmissionLockedRef.current = false;
          setWateringSubmissionLocked(false);
        }
      }
    }
  };

  const runHandleSave = async () => {
    setLocalError(null);
    setSaveStatus("");
    const pendingWateringSubmission = wateringRetrySubmissionRef.current;
    const resolved =
      pendingWateringSubmission?.resolved ?? resolveQuickLogV2Target(options, form.selectedKey);
    if (!resolved.ok) {
      setLocalError("Choose a plant or tent before saving.");
      return;
    }

    if (!pendingWateringSubmission && form.action === "feed") {
      if (!resolved.growId) {
        setLocalError(feedingFormReasonToHelper("grow_id:missing"));
        return;
      }
      const mapped = buildFeedingFormPayload({
        growId: resolved.growId,
        tentId: resolved.tentId ?? null,
        plantId: resolved.plantId ?? null,
        idempotencyKey: saveIdempotencyKeyRef.current,
        form: feedingForm,
      });
      if (mapped.ok !== true) {
        setLocalError(feedingFormReasonToHelper(mapped.reason));
        return;
      }
      setFeedingSaving(true);
      setSaveStatus("Saving feeding…");
      const result = await writeFeedingTypedEvent(mapped.payload);
      setFeedingSaving(false);
      if (result.ok !== true) {
        setLocalError(FEEDING_SAVE_FAILURE_MESSAGE);
        toast.error(FEEDING_SAVE_FAILURE_MESSAGE);
        setSaveStatus("");
        return;
      }
      const growEventId = result.eventId;
      trackQuickLogSuccess("feed", { reused: result.reused });
      // The logical feeding save is complete. Rotate only now so a retry
      // after a failed/unknown response reuses the original server key.
      saveIdempotencyKeyRef.current = newQuickLogSaveKey();
      setSaveStatus(FEEDING_SAVE_SUCCESS_MESSAGE);
      showTimelineConfirmation(FEEDING_SAVE_SUCCESS_MESSAGE, {
        // Feed events are currently surfaced in the global typed root-zone
        // lane, not the scoped grouped timeline. Route to the real anchor.
        targetType: null,
        targetId: null,
        tentId: resolved.tentId ?? null,
        growEventId,
      });
      applyQuickLogV2Refresh(queryClient, {
        targetType: resolved.targetType as "plant" | "tent",
        targetId: resolved.targetId as string,
        tentId: resolved.tentId ?? null,
      });
      // Notify Timeline-style listeners that a new entry exists so the
      // local-state Timeline page can refetch. Fires only after the save
      // succeeded (no early/duplicate dispatch on the failure paths above).
      dispatchQuickLogV2EntryCreated({
        createdAt: new Date().toISOString(),
        growEventId,
        source: "quick_log_v2_feed",
      });
      setPostSave({
        growEventId,
        targetType: resolved.targetType as "plant" | "tent",
        targetId: resolved.targetId as string,
        tentId: resolved.tentId ?? null,
        action: form.action,
        message: FEEDING_SAVE_SUCCESS_MESSAGE,
        savedAt: new Date().toISOString(),
      });
      return;
    }

    const occurredAt = new Date().toISOString();
    let maturityDetails: Record<string, unknown> | null = null;
    if (!pendingWateringSubmission) {
      const maturityEvidence = buildQuickLogMaturityEvidenceDetails({
        form: maturityEvidenceForm,
        targetType: resolved.targetType ?? null,
        observedAt: occurredAt,
      });
      if (maturityEvidence.ok !== true) {
        setLocalError(quickLogMaturityEvidenceReasonToMessage(maturityEvidence.reason));
        setSaveStatus("");
        return;
      }
      maturityDetails = maturityEvidence.details;
    }

    let wateringPayload: WateringTypedEventInput | null = null;
    if (pendingWateringSubmission) {
      wateringPayload = pendingWateringSubmission.payload;
    } else if (form.action === "water") {
      const mapped = buildWateringFormPayload({
        growId: resolved.growId,
        tentId: resolved.tentId ?? null,
        plantId: resolved.plantId ?? null,
        idempotencyKey: saveIdempotencyKeyRef.current,
        occurredAt,
        form: wateringForm,
        note: form.note,
        temperatureC: form.temperatureC,
        humidityPct: form.humidityPct,
        vpdKpa: form.vpdKpa,
        baseDetails: maturityDetails,
      });
      if (mapped.ok !== true) {
        setLocalError(wateringFormReasonToHelper(mapped.reason));
        setSaveStatus("");
        return;
      }
      wateringPayload = mapped.payload;
    }

    let exactWateringSubmission: LockedWateringSubmission | null = pendingWateringSubmission;
    if (wateringPayload && !exactWateringSubmission) {
      exactWateringSubmission = {
        payload: wateringPayload,
        resolved,
        photoFile,
        videoFile,
        videoMeta,
        note: form.note,
        action: "water",
      };
      // Claim the immutable logical record before the first asynchronous
      // upload. The same target, payload, and attachments are then reused even
      // if a transport result is ambiguous.
      wateringRetrySubmissionRef.current = exactWateringSubmission;
    }

    const submissionPhotoFile = exactWateringSubmission?.photoFile ?? photoFile;
    const submissionVideoFile = exactWateringSubmission?.videoFile ?? videoFile;
    const submissionVideoMeta = exactWateringSubmission?.videoMeta ?? videoMeta;
    const submissionNote = exactWateringSubmission?.note ?? form.note;
    const submissionAction: QuickLogV2Action = exactWateringSubmission?.action ?? form.action;

    let uploadedPath: string | null = null;
    if (submissionPhotoFile) {
      if (!resolved.growId) {
        wateringRetrySubmissionRef.current = null;
        setLocalError("Choose a target with grow context before attaching a photo.");
        return;
      }
      setSaveStatus("Uploading photo…");
      const upload = await uploadQuickLogPhoto(resolved.growId, submissionPhotoFile);
      if (!upload.ok) {
        wateringRetrySubmissionRef.current = null;
        setLocalError((upload as { message: string }).message);
        setSaveStatus("");
        return;
      }
      uploadedPath = upload.path;
    }

    let res: Awaited<ReturnType<typeof save>>;
    if (wateringPayload) {
      if (!exactWateringSubmission) {
        throw new Error("Structured Water submission lock was not created.");
      }
      setSaveStatus("Saving watering…");
      const wateringResult = await writeQuickLogWateringTypedEvent(exactWateringSubmission.payload);
      if (wateringResult.ok !== true) {
        if (uploadedPath) {
          await supabase.storage
            .from("diary-photos")
            .remove([uploadedPath])
            .catch(() => {});
        }
        setLocalError(WATERING_SAVE_FAILURE_MESSAGE);
        setWateringRetryPending(true);
        keepWateringSubmissionLockedRef.current = true;
        toast.error(WATERING_SAVE_FAILURE_MESSAGE);
        setSaveStatus("");
        return;
      }
      wateringRetrySubmissionRef.current = null;
      setWateringRetryPending(false);
      trackQuickLogSuccess("water", { reused: wateringResult.reused });
      res = {
        ok: true,
        growEventId: wateringResult.eventId,
        environmentEventId: null,
        reused: wateringResult.reused,
      };
    } else {
      const built = buildQuickLogV2SavePayload({
        resolved,
        action: form.action,
        volumeMl: form.volumeMl,
        note: form.note,
        temperatureC: form.temperatureC,
        humidityPct: form.humidityPct,
        vpdKpa: form.vpdKpa,
        details: maturityDetails,
        idempotencyKey: saveIdempotencyKeyRef.current,
      });
      if (built.ok !== true) {
        if (uploadedPath) {
          await supabase.storage
            .from("diary-photos")
            .remove([uploadedPath])
            .catch(() => {});
        }
        setLocalError(reasonToMessage(built.reason));
        setSaveStatus("");
        return;
      }

      setSaveStatus("Saving log…");
      // Explicit opt-in: this mounted grower Quick Log surface owns the intent.
      // Other users of the shared persistence hook fail closed by default.
      res = await save(built.payload, { telemetryIntent: form.action });
    }
    if (!res.ok) {
      if (uploadedPath) {
        await supabase.storage
          .from("diary-photos")
          .remove([uploadedPath])
          .catch(() => {});
      }
      const reason = res.reason || "save_failed";
      setLocalError(
        reason === "save_failed" ? QUICK_LOG_SAVE_FAILED_MESSAGE : reasonToMessage(reason),
      );
      setSaveStatus("");
      return;
    }

    // The core grow event is committed. Rotate immediately, before any
    // best-effort attachment work, so a rejected media promise can never
    // leave the committed server key attached to a new editable draft.
    saveIdempotencyKeyRef.current = newQuickLogSaveKey();

    // The log row is committed from here on. Companion-media failures are
    // PARTIAL SUCCESS: the grower's entry is saved and must be presented as
    // saved (returning early here used to show a failure and invite a Retry
    // that re-ran the whole save — the duplication the idempotency key now
    // also guards against server-side).
    let mediaFailure: string | null = null;
    let mediaFailureAmbiguous = false;
    let photoAttached = false;
    let videoAttached = false;

    if (uploadedPath && resolved.growId) {
      const photoEntry = await createPhotoDiaryEntry({
        growId: resolved.growId,
        tentId: resolved.tentId ?? null,
        plantId: resolved.plantId ?? null,
        photoPath: uploadedPath,
        noteRaw: submissionNote,
        action: submissionAction,
      });
      if (photoEntry.ok) {
        photoAttached = true;
      } else {
        const failure = photoEntry as { message: string; ambiguous?: boolean };
        mediaFailure = failure.message;
        mediaFailureAmbiguous = failure.ambiguous === true;
        // A thrown insert is ambiguous: it may have committed before the
        // response was lost. Keep storage in that case so a persisted diary
        // row can never point at an object we deleted.
        if (!failure.ambiguous) {
          await supabase.storage
            .from("diary-photos")
            .remove([uploadedPath])
            .catch(() => {});
        }
      }
    }

    if (submissionVideoFile && submissionVideoMeta && resolved.growId) {
      setSaveStatus("Uploading video…");
      const upload = await uploadQuickLogVideo(resolved.growId, submissionVideoFile);
      if (!upload.ok) {
        mediaFailure = (upload as { message: string }).message;
      } else {
        const videoEntry = await createVideoDiaryEntry({
          growId: resolved.growId,
          tentId: resolved.tentId ?? null,
          plantId: resolved.plantId ?? null,
          videoPath: upload.path,
          mime: submissionVideoMeta.mime,
          sizeBytes: submissionVideoMeta.sizeBytes,
          durationS: submissionVideoMeta.durationS,
          noteRaw: submissionNote,
          action: submissionAction,
        });
        if (videoEntry.ok) {
          videoAttached = true;
        } else {
          const failure = videoEntry as { message: string; ambiguous?: boolean };
          if (!failure.ambiguous) {
            await supabase.storage
              .from("diary-videos")
              .remove([upload.path])
              .catch(() => {});
          }
          mediaFailure = failure.message;
          mediaFailureAmbiguous = failure.ambiguous === true;
        }
      }
    }

    const successMessage =
      submissionAction === "water"
        ? photoAttached
          ? videoAttached
            ? "Watering, photo, and video saved"
            : "Watering and photo saved"
          : videoAttached
            ? "Watering and video saved"
            : WATERING_SAVE_SUCCESS_MESSAGE
        : photoAttached
          ? videoAttached
            ? "Log, photo, and video saved"
            : "Log and photo saved"
          : videoAttached
            ? "Log and video saved"
            : "Log saved";
    setSaveStatus(successMessage);
    if (mediaFailure) {
      // Non-blocking notice: the entry is saved; only the attachment failed.
      setLocalError(
        mediaFailureAmbiguous
          ? `Log saved — attachment status uncertain: ${mediaFailure}`
          : `Log saved — attachment failed: ${mediaFailure}`,
      );
    }
    showTimelineConfirmation(successMessage, {
      targetType: resolved.targetType as "plant" | "tent",
      targetId: resolved.targetId as string,
      tentId: resolved.tentId ?? null,
      growEventId: (res as { growEventId?: string | null }).growEventId ?? null,
    });
    applyQuickLogV2Refresh(queryClient, {
      targetType: resolved.targetType as "plant" | "tent",
      targetId: resolved.targetId as string,
      tentId: resolved.tentId ?? null,
    });
    // Notify Timeline-style listeners that a new entry exists so the
    // local-state Timeline page can refetch. Dispatched once per
    // successful save, after every required write (log + optional photo)
    // has resolved.
    dispatchQuickLogV2EntryCreated({
      createdAt: new Date().toISOString(),
      growEventId: (res as { growEventId?: string | null }).growEventId ?? null,
      source: submissionAction === "water" ? "quick_log_v2_water" : "quick_log_v2",
    });
    resetPhotoSelection();
    resetVideoSelection();
    setPostSave({
      growEventId: (res as { growEventId?: string | null }).growEventId ?? null,
      targetType: resolved.targetType as "plant" | "tent",
      targetId: resolved.targetId as string,
      tentId: resolved.tentId ?? null,
      action: submissionAction,
      message: buildQuickLogPostSaveMessage(submissionAction, photoAttached),
      savedAt: new Date().toISOString(),
    });
  };

  /**
   * Post-save "Log another" — rotates the client idempotency key and
   * clears the just-saved summary + event-specific draft so a fresh
   * save cycle can proceed. Preserves the selected target so the
   * grower doesn't lose their place.
   */
  function handleLogAnother() {
    idempotencyKeyRef.current = rotateQuickLogIdempotencyKey(idempotencyKeyRef.current);
    setPostSave(null);
    setLocalError(null);
    setSaveStatus("");
    setForm((prev) => ({
      ...EMPTY_QUICKLOG_V2_FORM,
      selectedKey: prev.selectedKey,
    }));
    setFeedingForm(EMPTY_QUICKLOG_FEEDING_FORM);
    setWateringForm(EMPTY_QUICKLOG_WATERING_FORM);
    setWateringRetryPending(false);
    setWateringSubmissionLocked(false);
    wateringRetrySubmissionRef.current = null;
    wateringSubmissionLockedRef.current = false;
    keepWateringSubmissionLockedRef.current = false;
    setMaturityEvidenceForm(EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM);
    setFeedingDefaultsApplied(false);
    resetPhotoSelection();
    resetVideoSelection();
  }

  function handleViewTimeline() {
    if (!postSave) return;
    const nav = buildQuickLogTimelineNavTarget({
      targetType: postSave.action === "feed" ? null : postSave.targetType,
      targetId: postSave.action === "feed" ? null : postSave.targetId,
      growEventId: postSave.growEventId,
    });
    onOpenChange(false);
    navigateToTimeline(nav.href, nav.hash, nav.path);
  }

  /**
   * Intercept Sheet open-state changes so backdrop / escape / swipe
   * dismissals cannot close the sheet mid-save. Opening is always
   * allowed. Closing is blocked while a save flag or
   * either sync in-flight ref is claimed; in that case we surface a
   * short, non-blocking toast so the grower knows why the dismissal
   * was refused.
   */
  function handleSheetOpenChange(next: boolean) {
    if (!next) {
      const blocked = shouldBlockQuickLogClose({
        saving: saving || feedingSaving || wateringSaving,
        inFlight: saveInFlightRef.current || photoDiaryInFlightRef.current,
      });
      if (blocked) {
        toast.message(QUICK_LOG_CLOSE_BLOCKED_HINT);
        return;
      }
      resetVideoSelection();
    }
    onOpenChange(next);
  }

  return (
    <Sheet open={open} onOpenChange={handleSheetOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto text-base"
        aria-describedby="qlv2-sheet-description"
      >
        <SheetHeader>
          <SheetTitle>Quick Log</SheetTitle>
          <p id="qlv2-sheet-description" className="text-sm text-muted-foreground">
            Capture what changed. Add detail only if it helps.
          </p>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {isLoadingContext && (
            <div
              role="status"
              data-testid="qlv2-context-loading"
              className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
            >
              Loading your plants and tents…
            </div>
          )}
          {hasFetchError && (
            <div
              role="alert"
              aria-live="assertive"
              data-testid="qlv2-context-error"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between gap-2"
            >
              <span>Could not load your plants and tents.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="qlv2-context-retry"
                aria-label="Retry loading plants and tents"
                onClick={() => {
                  plantsQ.refetch?.();
                  tentsQ.refetch?.();
                }}
              >
                Retry
              </Button>
            </div>
          )}
          {hasNoTargets && (
            <div
              role="status"
              data-testid="qlv2-context-empty"
              className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-2"
            >
              <p className="text-foreground">No plants or tents are available for this log.</p>
              <p className="text-muted-foreground">
                Add a plant or tent first, then come back to Quick Log.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href="/plants"
                  data-testid="qlv2-context-empty-add-plant"
                  className="text-sm px-3 min-h-11 inline-flex items-center rounded-md border border-border/60 hover:bg-secondary/60 touch-manipulation"
                >
                  Add a plant
                </a>
                <a
                  href="/tents"
                  data-testid="qlv2-context-empty-add-tent"
                  className="text-sm px-3 min-h-11 inline-flex items-center rounded-md border border-border/60 hover:bg-secondary/60 touch-manipulation"
                >
                  Add a tent
                </a>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="qlv2-target">Target</Label>
            <Select
              value={form.selectedKey ?? ""}
              onValueChange={(v) => {
                if (videoValidationInFlightRef.current) resetVideoSelection();
                setField("selectedKey", v);
                setLocalError(null);
                setSaveStatus("");
              }}
              disabled={contextBlocked || wateringSubmissionLocked}
            >
              <SelectTrigger
                id="qlv2-target"
                aria-label="Choose plant or tent for this Quick Log"
                aria-describedby="qlv2-target-help"
              >
                <SelectValue
                  placeholder={
                    isLoadingContext
                      ? "Loading…"
                      : hasFetchError
                        ? "Could not load targets"
                        : hasNoTargets
                          ? "No plants or tents yet"
                          : "Choose a tent or plant"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>
                    {o.type === "tent" ? "Tent · " : "Plant · "}
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="qlv2-target-help" className="mt-1 text-sm text-muted-foreground">
              Choose where this log belongs.
            </p>
            {selectedTargetMissing && (
              <p
                className="mt-2 rounded-md border border-border/60 bg-secondary/20 p-2 text-sm text-muted-foreground"
                data-testid="qlv2-missing-target-help"
              >
                Start by choosing a plant or tent above.
              </p>
            )}
            <QuickLogTargetPanel panel={targetPanel} />
          </div>

          <div>
            <Label>Action</Label>
            <div
              className="mt-1 grid grid-cols-3 gap-2"
              role="group"
              aria-label="Quick Log action type"
            >
              <Button
                type="button"
                variant={form.action === "water" ? "default" : "outline"}
                disabled={wateringSubmissionLocked}
                onClick={() => handleAction("water")}
              >
                Water
              </Button>
              <Button
                type="button"
                variant={form.action === "feed" ? "default" : "outline"}
                disabled={wateringSubmissionLocked}
                onClick={() => handleAction("feed")}
              >
                Feed
              </Button>
              <Button
                type="button"
                variant={form.action === "note" ? "default" : "outline"}
                disabled={wateringSubmissionLocked}
                onClick={() => handleAction("note")}
              >
                Note
              </Button>
            </div>
          </div>

          {form.action === "feed" && (
            <div className="space-y-2">
              {feedingDefaultsApplied && feedingDefaults.label && (
                <div
                  data-testid="qlv2-feeding-defaults-label"
                  className="rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-sm text-muted-foreground"
                  role="note"
                >
                  {FEEDING_DEFAULTS_LABEL}
                </div>
              )}
              <QuickLogFeedingForm
                value={feedingForm}
                onChange={(next) => {
                  setFeedingForm(next);
                  setLocalError(null);
                }}
                disabled={feedingSaving || wateringSaving || saving || wateringSubmissionLocked}
                defaultsApplied={feedingDefaultsApplied}
              />
            </div>
          )}

          {form.action === "water" && (
            <div className="space-y-2">
              <QuickLogWateringForm
                value={wateringForm}
                context={wateringContext}
                disabled={wateringSaving || feedingSaving || saving || wateringSubmissionLocked}
                onChange={(next) => {
                  if (wateringSubmissionLockedRef.current) return;
                  setWateringForm(next);
                  setLocalError(null);
                }}
              />
              {wateringRetryPending && (
                <p
                  role="status"
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-foreground"
                  data-testid="qlv2-watering-retry-lock"
                >
                  The first result was uncertain. Retry sends the exact same target, timestamp,
                  measurements, note, and attachments. Close and reopen Quick Log to make changes.
                </p>
              )}
              {volumeMissing && (
                <p
                  className="rounded-md border border-border/60 bg-secondary/20 p-2 text-sm text-muted-foreground"
                  data-testid="qlv2-missing-volume-help"
                >
                  Enter the amount watered before saving.
                </p>
              )}
            </div>
          )}

          {form.action !== "feed" && (
            <div
              className="rounded-md border border-border p-3"
              data-testid="qlv2-photo-attachment"
            >
              <Label>Photo attachment</Label>
              {photoPreview ? (
                <div className="mt-2 space-y-2">
                  <img
                    src={photoPreview}
                    alt="Selected Quick Log photo preview"
                    className="aspect-[4/3] w-full rounded-md object-cover"
                    data-testid="qlv2-photo-preview"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={wateringSubmissionLocked || videoChecking}
                    onClick={resetPhotoSelection}
                    data-testid="qlv2-photo-remove"
                    aria-label="Remove selected Quick Log photo"
                  >
                    Remove photo
                  </Button>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={wateringSubmissionLocked || videoChecking}
                      aria-controls="qlv2-photo-camera-input"
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      {photoGate.takePhotoLabel}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={wateringSubmissionLocked || videoChecking}
                      aria-controls="qlv2-photo-library-input"
                      onClick={() => libraryInputRef.current?.click()}
                    >
                      {photoGate.chooseLibraryLabel}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">{photoGate.pickerHelperText}</p>
                </div>
              )}
              <input
                ref={cameraInputRef}
                id="qlv2-photo-camera-input"
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label={photoGate.cameraInputAriaLabel}
                tabIndex={-1}
                disabled={wateringSubmissionLocked || videoChecking}
                onChange={handlePhotoInputChange}
                data-testid="qlv2-photo-camera-input"
              />
              <input
                ref={libraryInputRef}
                id="qlv2-photo-library-input"
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label={photoGate.libraryInputAriaLabel}
                tabIndex={-1}
                disabled={wateringSubmissionLocked || videoChecking}
                onChange={handlePhotoInputChange}
                data-testid="qlv2-photo-library-input"
              />
            </div>
          )}

          {form.action !== "feed" && (
            <div
              className="rounded-md border border-border p-3"
              data-testid="qlv2-video-attachment"
            >
              <Label>Video attachment</Label>
              {videoPreview ? (
                <div className="mt-2 space-y-2">
                  <video
                    src={videoPreview}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-video w-full rounded-md bg-black"
                    data-testid="qlv2-video-preview"
                    aria-label="Selected Quick Log video preview"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={wateringSubmissionLocked || videoChecking}
                    onClick={resetVideoSelection}
                    data-testid="qlv2-video-remove"
                    aria-label="Remove selected Quick Log video"
                  >
                    Remove video
                  </Button>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={wateringSubmissionLocked || videoChecking}
                    aria-controls="qlv2-video-input"
                    onClick={() => videoInputRef.current?.click()}
                  >
                    Choose video
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    MP4, MOV, or WebM. Max 60 seconds and 100 MB. Optional.
                  </p>
                </div>
              )}
              <input
                ref={videoInputRef}
                id="qlv2-video-input"
                type="file"
                accept={ALLOWED_VIDEO_MIME_TYPES.join(",")}
                className="sr-only"
                aria-label="Choose a video from your library"
                tabIndex={-1}
                disabled={wateringSubmissionLocked || videoChecking}
                onChange={handleVideoInputChange}
                data-testid="qlv2-video-input"
              />
              {videoChecking && (
                <p
                  role="status"
                  className="mt-2 text-sm text-muted-foreground"
                  data-testid="qlv2-video-checking"
                >
                  Checking video before save…
                </p>
              )}
            </div>
          )}

          {form.action !== "feed" && (
            <div>
              <Label htmlFor="qlv2-note">Note (optional)</Label>
              <Textarea
                id="qlv2-note"
                value={form.note}
                disabled={wateringSubmissionLocked}
                maxLength={NOTE_LIMIT}
                aria-describedby="qlv2-note-helper qlv2-note-count"
                onChange={(e) => setField("note", e.target.value)}
                onInput={(e) => {
                  // Native input events (paste, dictation, programmatic
                  // dispatchEvent) can bypass React's synthetic onChange in
                  // some environments. Mirror the DOM value into state so the
                  // save payload always receives exactly what the grower
                  // visibly typed. Same A1 sync pattern as the legacy QuickLog
                  // note. Synchronization only — the note stays optional.
                  setField("note", (e.currentTarget as HTMLTextAreaElement).value);
                }}
                onCompositionEnd={(e) => {
                  // IME / dictation finalization: commit the composed value.
                  setField("note", (e.currentTarget as HTMLTextAreaElement).value);
                }}
                onBlur={(e) => {
                  // Last-chance sync before the grower taps Save.
                  setField("note", e.currentTarget.value);
                }}
                placeholder="What did you observe?"
              />
              <div className="mt-1 flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <p id="qlv2-note-helper">Keep it short. Add more detail later from the timeline.</p>
                <p id="qlv2-note-count" aria-live="polite">
                  {noteLength}/{NOTE_LIMIT}
                </p>
              </div>
            </div>
          )}

          <QuickLogMaturityEvidenceFields
            value={maturityEvidenceForm}
            onChange={(next) => {
              if (wateringSubmissionLockedRef.current) return;
              setMaturityEvidenceForm(next);
              setLocalError(null);
            }}
            visible={showMaturityEvidence}
            disabled={saving || feedingSaving || wateringSaving || wateringSubmissionLocked}
          />

          {form.action !== "feed" && (
            <details className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Manual sensor snapshot (optional)
              </summary>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <Label htmlFor="qlv2-temp">Temp (°C)</Label>
                  <Input
                    id="qlv2-temp"
                    inputMode="decimal"
                    value={form.temperatureC}
                    disabled={wateringSubmissionLocked}
                    onChange={(e) => setField("temperatureC", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="qlv2-rh">RH (%)</Label>
                  <Input
                    id="qlv2-rh"
                    inputMode="decimal"
                    value={form.humidityPct}
                    disabled={wateringSubmissionLocked}
                    onChange={(e) => setField("humidityPct", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="qlv2-vpd">VPD (kPa)</Label>
                  <Input
                    id="qlv2-vpd"
                    inputMode="decimal"
                    value={form.vpdKpa}
                    disabled={wateringSubmissionLocked}
                    onChange={(e) => setField("vpdKpa", e.target.value)}
                  />
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Source: manual. Leave blank to skip.
              </p>
            </details>
          )}

          {localError && (
            <div
              role="alert"
              aria-live="assertive"
              data-testid="qlv2-error"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive flex items-center justify-between gap-2"
            >
              <span>{localError}</span>
              {!postSave && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="qlv2-save-retry"
                  aria-label={
                    wateringRetryPending
                      ? "Retry the exact same watering record"
                      : "Retry saving Quick Log"
                  }
                  disabled={
                    saving ||
                    feedingSaving ||
                    wateringSaving ||
                    videoChecking ||
                    (contextBlocked && !wateringRetryPending)
                  }
                  onClick={handleSave}
                >
                  Retry
                </Button>
              )}
            </div>
          )}

          <div className="sr-only" aria-live="polite" data-testid="qlv2-save-status">
            {saveStatus}
          </div>

          <div className="space-y-2 pt-2">
            {postSave ? (
              <div
                role="status"
                aria-live="polite"
                data-testid="qlv2-post-save"
                className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2"
              >
                <p
                  className="text-sm font-semibold text-foreground"
                  data-testid="quick-log-post-save-title"
                >
                  {QUICK_LOG_POST_SAVE_TITLE}
                </p>
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="quick-log-post-save-description"
                >
                  {buildQuickLogPostSaveDescription({
                    targetName: resolvedTarget.ok
                      ? (options.find((o) => `${o.type}:${o.id}` === form.selectedKey)?.label ??
                        null)
                      : null,
                    tentName: null,
                    growName: null,
                    action: postSave.action,
                    photoAttached: /photo/i.test(postSave.message),
                  })}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={handleViewTimeline}
                    data-testid="quick-log-post-save-view"
                  >
                    {QUICK_LOG_POST_SAVE_VIEW_LABEL}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={handleLogAnother}
                    data-testid="quick-log-post-save-another"
                  >
                    {QUICK_LOG_POST_SAVE_ANOTHER_LABEL}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => handleSheetOpenChange(false)}
                    data-testid="quick-log-post-save-close"
                  >
                    {QUICK_LOG_POST_SAVE_CLOSE_LABEL}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p
                  id="qlv2-save-helper"
                  className="text-sm text-muted-foreground"
                  data-testid="qlv2-save-helper"
                >
                  {saveHelper}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleSheetOpenChange(false)}
                    disabled={saving || feedingSaving || wateringSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={handleSave}
                    disabled={
                      saving ||
                      feedingSaving ||
                      wateringSaving ||
                      videoChecking ||
                      (contextBlocked && !wateringRetryPending)
                    }
                    aria-describedby="qlv2-save-helper"
                    data-testid="qlv2-save"
                  >
                    {saving || feedingSaving || wateringSaving
                      ? "Saving…"
                      : wateringRetryPending
                        ? "Retry exact record"
                        : "Save"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function getSaveHelperMessage(input: {
  contextBlocked: boolean;
  isLoadingContext: boolean;
  hasFetchError: boolean;
  hasNoTargets: boolean;
  selectedTargetMissing: boolean;
  volumeMissing: boolean;
  saving: boolean;
}): string {
  if (input.saving) return "Saving your Quick Log…";
  if (input.isLoadingContext) return "Loading plants and tents before saving.";
  if (input.hasFetchError) return "Retry loading plants and tents before saving.";
  if (input.hasNoTargets) return "Add a plant or tent before saving a Quick Log.";
  if (input.selectedTargetMissing) return "Choose a plant or tent before saving.";
  if (input.volumeMissing) return "Watering logs need a volume before they can save.";
  return "Ready to save when this log matches what happened.";
}

function reasonToMessage(reason: string): string {
  return quickLogReasonToOperatorMessage(reason);
}
