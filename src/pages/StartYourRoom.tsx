/**
 * StartYourRoom — guided first-session path: grow → tent → plant.
 *
 * Guarantees grow_id (and tent_id) on every write so Plant Detail Quick Log
 * works immediately. No device control, no Action Queue, no Edge Functions.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "@/lib/react-router-compat";
import { Loader2, Sprout, Box, Leaf, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import { useTents } from "@/hooks/use-tents";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  START_YOUR_ROOM_COPY,
  DEFAULT_START_YOUR_ROOM_FORM,
  EMPTY_START_YOUR_ROOM_IDS,
  buildStartRoomGrowPayload,
  buildStartRoomTentPayload,
  buildStartRoomPlantPayload,
  canProceedGrow,
  canProceedTent,
  canProceedPlant,
  canFinish,
  nextStepAfter,
  stepIndex,
  progressLabel,
  plantDetailQuickLogHref,
  resolveStartYourRoomResume,
  type StartYourRoomForm,
  type StartYourRoomIds,
  type StartYourRoomResumePlant,
  type StartYourRoomStep,
} from "@/lib/startYourRoomRules";
import { setStartScreenChoice } from "@/lib/startScreenPreferences";
import {
  evaluateVerifiedGrowCreationGate,
  evaluateVerifiedTentCreationGate,
} from "@/lib/entitlements/freeTierGates";
import {
  newHierarchyCreateAttemptId,
  persistHierarchyCreateAttempt,
  type HierarchyCreateAttempt,
} from "@/lib/hierarchyCreatePersistence";
import { useHierarchyCreateOutcomeRecovery } from "@/hooks/useHierarchyCreateOutcomeRecovery";
import {
  clearBrowserSessionFormDraft,
  readBrowserSessionFormDraft,
  writeBrowserSessionFormDraft,
} from "@/lib/sessionFormDraftStore";
import {
  EMPTY_START_YOUR_ROOM_PENDING_ROW_IDS,
  START_YOUR_ROOM_DRAFT_FORM_ID,
  START_YOUR_ROOM_SAVE_RETRY_COPY,
  parseStartYourRoomDraft,
  plainStartRoomSaveError,
  startYourRoomDraftForm,
  type StartYourRoomPendingRowIds,
} from "@/lib/startYourRoomDraftRules";

const ROOM_LIMITS_LOADING_COPY = "Checking your plan and active room limits…";

function plantsSelectAvailable(): boolean {
  try {
    const builder = supabase.from("plants") as { select?: unknown };
    return typeof builder?.select === "function";
  } catch {
    return false;
  }
}

const STAGES = [
  { value: "seedling", label: "Seedling" },
  { value: "veg", label: "Vegetative" },
  { value: "flower", label: "Flowering" },
];

export default function StartYourRoom() {
  const { user, loading } = useAuth();
  const {
    grows,
    activeGrowId,
    setActiveGrowId,
    refresh,
    loading: growsLoading,
    error: growsError,
  } = useGrows();
  const tentsQuery = useTents();
  const {
    loading: entitlementLoading,
    lookupFailed: entitlementLookupFailed,
    entitlement,
    refetch: refetchEntitlements,
  } = useMyEntitlements();
  const queryClient = useQueryClient();
  const nav = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const plantsReadable = useMemo(() => plantsSelectAvailable(), []);
  const [plantsRead, setPlantsRead] = useState<{
    loading: boolean;
    plants: readonly StartYourRoomResumePlant[] | null;
  }>({ loading: false, plants: plantsSelectAvailable() ? null : [] });
  const [step, setStep] = useState<StartYourRoomStep>("grow");
  const [form, setForm] = useState<StartYourRoomForm>({ ...DEFAULT_START_YOUR_ROOM_FORM });
  const [ids, setIds] = useState<StartYourRoomIds>({ ...EMPTY_START_YOUR_ROOM_IDS });
  const [busy, setBusy] = useState(false);
  const createInFlightRef = useRef(false);
  const [pendingRowIds, setPendingRowIds] = useState<StartYourRoomPendingRowIds>(
    EMPTY_START_YOUR_ROOM_PENDING_ROW_IDS,
  );
  const pendingRowIdsRef = useRef(pendingRowIds);
  pendingRowIdsRef.current = pendingRowIds;
  const draftHydratedFor = useRef<string | null>(null);
  const [draftOwnerReady, setDraftOwnerReady] = useState<string | null>(null);
  const [verificationRetrying, setVerificationRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { createOutcomeUnknown, recordUnknownCreateOutcome } = useHierarchyCreateOutcomeRecovery({
    ownerId: user?.id,
  });

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const ownerId = user?.id ?? null;

  useEffect(() => {
    if (!ownerId || growsLoading || draftHydratedFor.current === ownerId) return;
    draftHydratedFor.current = ownerId;
    const draft = readBrowserSessionFormDraft(
      ownerId,
      START_YOUR_ROOM_DRAFT_FORM_ID,
      parseStartYourRoomDraft,
    );
    if (!draft) {
      setStep("grow");
      setForm({ ...DEFAULT_START_YOUR_ROOM_FORM });
      setIds({ ...EMPTY_START_YOUR_ROOM_IDS });
      setPendingRowIds({ ...EMPTY_START_YOUR_ROOM_PENDING_ROW_IDS });
      setError(null);
      setDraftOwnerReady(ownerId);
      return;
    }
    const growStillHere =
      draft.ids.growId != null && grows.some((grow) => grow.id === draft.ids.growId);
    setForm(draft.form);
    setError(draft.saveError);
    if (draft.step === "grow" || growStillHere) {
      setPendingRowIds(draft.pendingRowIds);
    } else {
      setPendingRowIds({ ...EMPTY_START_YOUR_ROOM_PENDING_ROW_IDS });
    }
    if (growStillHere) {
      setIds(draft.ids);
      setStep(draft.step);
    } else {
      setIds({ ...EMPTY_START_YOUR_ROOM_IDS });
      setStep("grow");
    }
    setDraftOwnerReady(ownerId);
  }, [ownerId, grows, growsLoading]);

  useEffect(() => {
    if (!ownerId || draftHydratedFor.current !== ownerId || draftOwnerReady !== ownerId) return;
    if (step === "done") {
      clearBrowserSessionFormDraft(ownerId, START_YOUR_ROOM_DRAFT_FORM_ID);
      return;
    }
    writeBrowserSessionFormDraft(ownerId, START_YOUR_ROOM_DRAFT_FORM_ID, {
      step,
      form: startYourRoomDraftForm(form, ids),
      ids,
      pendingRowIds,
      saveError: error,
    });
  }, [ownerId, draftOwnerReady, step, form, ids, pendingRowIds, error]);

  const plantsFetchKey = useRef<string | null>(null);
  const [plantReadAttempt, setPlantReadAttempt] = useState(0);
  useEffect(() => {
    if (!plantsReadable || !ownerId || grows.length !== 1) {
      plantsFetchKey.current = null;
      setPlantsRead((prev) =>
        !prev.loading && Array.isArray(prev.plants) && prev.plants.length === 0
          ? prev
          : { loading: false, plants: [] },
      );
      return;
    }
    let cancelled = false;
    const growId = activeGrowId ?? grows[0]?.id ?? null;
    const fetchKey = `${ownerId}:${growId ?? ""}`;
    if (plantsFetchKey.current === fetchKey) return;
    setPlantsRead((prev) =>
      prev.loading && prev.plants === null ? prev : { loading: true, plants: null },
    );
    void (async () => {
      try {
        let query = supabase
          .from("plants")
          .select("id,grow_id,tent_id,name")
          .eq("is_archived", false);
        if (growId) query = query.eq("grow_id", growId);
        const { data, error: plantsError } = await query;
        if (cancelled) return;
        if (plantsError) {
          plantsFetchKey.current = null;
          setPlantsRead({ loading: false, plants: null });
          return;
        }
        plantsFetchKey.current = fetchKey;
        setPlantsRead({
          loading: false,
          plants: (data ?? []) as StartYourRoomResumePlant[],
        });
      } catch {
        if (!cancelled) {
          plantsFetchKey.current = null;
          setPlantsRead({ loading: false, plants: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plantsReadable, ownerId, activeGrowId, grows, plantReadAttempt]);

  const resume = useMemo(
    () =>
      resolveStartYourRoomResume({
        grows: grows.map((grow) => ({
          id: grow.id,
          name: "name" in grow ? (grow.name as string | null) : null,
        })),
        tents: tentsQuery.data ?? (tentsQuery.isError ? null : []),
        plants: plantsRead.plants,
        activeGrowId: activeGrowId ?? (grows.length === 1 ? grows[0]?.id : null),
      }),
    [grows, tentsQuery.data, tentsQuery.isError, plantsRead.plants, activeGrowId],
  );
  const roomSourcesLoading =
    growsLoading || tentsQuery.isLoading || (grows.length === 1 && plantsRead.loading);
  const plantReadFailed =
    plantsReadable && grows.length === 1 && !plantsRead.loading && plantsRead.plants === null;
  const growCountRequired = entitlement.capabilities.maxActiveGrows != null;
  const tentCountRequired = !entitlement.capabilities.multiTent;
  const creationVerificationLoading =
    verificationRetrying ||
    entitlementLoading ||
    (growCountRequired && growsLoading) ||
    (tentCountRequired && tentsQuery.isLoading);
  const creationVerificationFailed =
    entitlementLookupFailed ||
    plantReadFailed ||
    (growCountRequired && Boolean(growsError)) ||
    (tentCountRequired && tentsQuery.isError);
  const planVerificationReady = !entitlementLoading && !entitlementLookupFailed;
  const growVerificationReady =
    planVerificationReady && (!growCountRequired || (!growsLoading && !growsError));
  const tentVerificationReady =
    planVerificationReady && (!tentCountRequired || (!tentsQuery.isLoading && !tentsQuery.isError));
  const growGate = evaluateVerifiedGrowCreationGate(
    entitlement.capabilities,
    grows.length,
    growVerificationReady,
  );
  const tentGate = evaluateVerifiedTentCreationGate(
    entitlement.capabilities,
    tentsQuery.data?.length ?? 0,
    tentVerificationReady,
  );
  const roomPreflightGate = growGate.allowed ? tentGate : growGate;
  // A paid plan can still start another grow from this page. Partial resume
  // would hide that choice, so keep the grow step when the gate allows it.
  // A finished room still opens done.
  const appliedResume = useMemo(() => {
    if (!resume) return null;
    if (resume.step === "done") return resume;
    if (!planVerificationReady || growGate.allowed) return null;
    return resume;
  }, [resume, planVerificationReady, growGate.allowed]);
  const showingResume = appliedResume != null && stepIndex(step) <= stepIndex(appliedResume.step);
  const shownStep: StartYourRoomStep = showingResume ? appliedResume.step : step;
  const shownIds: StartYourRoomIds = showingResume
    ? {
        growId: appliedResume.growId,
        tentId: appliedResume.tentId,
        plantId: appliedResume.plantId,
      }
    : ids;
  const shownForm: StartYourRoomForm = showingResume
    ? {
        ...form,
        growName: appliedResume.growName || form.growName,
        tentName: appliedResume.tentName || form.tentName,
        plantName: appliedResume.plantName || form.plantName,
      }
    : form;
  const stepCreationGate =
    shownStep === "grow" ? roomPreflightGate : shownStep === "tent" ? tentGate : null;
  const currentCreationGate = !growGate.allowed ? growGate : stepCreationGate;
  const progress = useMemo(() => progressLabel(shownStep), [shownStep]);
  const showRoomLoading = roomSourcesLoading || creationVerificationLoading;

  useEffect(() => {
    if (!appliedResume) return;
    setStep((current) =>
      stepIndex(current) < stepIndex(appliedResume.step) ? appliedResume.step : current,
    );
    setIds((prev) => {
      const next = {
        growId: prev.growId ?? appliedResume.growId,
        tentId: prev.tentId ?? appliedResume.tentId,
        plantId: prev.plantId ?? appliedResume.plantId,
      };
      if (
        next.growId === prev.growId &&
        next.tentId === prev.tentId &&
        next.plantId === prev.plantId
      ) {
        return prev;
      }
      return next;
    });
    setForm((prev) => {
      const growName = prev.growName || appliedResume.growName;
      const tentName = prev.tentName || appliedResume.tentName;
      const plantName = prev.plantName || appliedResume.plantName;
      if (
        growName === prev.growName &&
        tentName === prev.tentName &&
        plantName === prev.plantName
      ) {
        return prev;
      }
      return { ...prev, growName, tentName, plantName };
    });
  }, [appliedResume]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  function patchForm(partial: Partial<StartYourRoomForm>) {
    setForm((f) => ({ ...f, ...partial }));
    setError(null);
  }

  async function retryCreationVerification() {
    if (verificationRetrying) return;
    setVerificationRetrying(true);
    setError(null);
    try {
      plantsFetchKey.current = null;
      setPlantReadAttempt((attempt) => attempt + 1);
      await Promise.allSettled([refresh(), tentsQuery.refetch(), refetchEntitlements()]);
    } finally {
      setVerificationRetrying(false);
    }
  }

  async function persistStartRoomAttempt(
    attempt: HierarchyCreateAttempt,
    payload: Record<string, unknown>,
  ) {
    const result = await persistHierarchyCreateAttempt(supabase, attempt, payload);
    if (result.status === "confirmed") return result.confirmed;
    if (result.status === "unknown") {
      recordUnknownCreateOutcome(attempt);
      setError(
        `Verdant could not confirm whether this ${attempt.entity} was saved. Refresh before adding another.`,
      );
      return null;
    }
    setError(plainStartRoomSaveError(attempt.entity));
    return null;
  }

  function rowIdFor(entity: "grow" | "tent" | "plant"): string {
    const existing = pendingRowIdsRef.current[entity];
    if (existing) return existing;
    const minted = newHierarchyCreateAttemptId();
    const next = { ...pendingRowIdsRef.current, [entity]: minted };
    pendingRowIdsRef.current = next;
    setPendingRowIds(next);
    return minted;
  }

  function releaseRowId(entity: "grow" | "tent" | "plant") {
    if (!pendingRowIdsRef.current[entity]) return;
    const next = { ...pendingRowIdsRef.current, [entity]: null };
    pendingRowIdsRef.current = next;
    setPendingRowIds(next);
  }

  async function submitGrow() {
    if (!user || busy || createInFlightRef.current) return;
    if (createOutcomeUnknown) {
      setError("Refresh this page before trying to create another room item.");
      return;
    }
    if (!roomPreflightGate.allowed) {
      setError(roomPreflightGate.blockedCopy);
      return;
    }
    const payload = buildStartRoomGrowPayload(shownForm);
    if (!payload) {
      setError("Enter a grow name to continue.");
      return;
    }
    let growId: string;
    try {
      growId = rowIdFor("grow");
    } catch {
      setError("Verdant could not start a safe grow save. Refresh and try again.");
      return;
    }
    const attempt = { entity: "grow" as const, rowId: growId, ownerId: user.id };
    createInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const confirmed = await persistStartRoomAttempt(attempt, {
        id: growId,
        user_id: user.id,
        ...payload,
      });
      if (!confirmed) return;
      releaseRowId("grow");
      setActiveGrowId(confirmed.row.id);
      setIds((prev) => ({ ...prev, growId: confirmed.row.id }));
      toast.success("Grow created");
      setStep(nextStepAfter("grow"));
      try {
        await refresh();
      } catch {
        // The grow is already confirmed and the wizard is terminal for this
        // stage. Advance rather than leave the grow form ready to duplicate.
        toast.error(
          "Grow created, but the list could not refresh. Refresh the page if it looks out of date.",
        );
      }
    } finally {
      createInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function submitTent() {
    if (!user || busy || createInFlightRef.current) return;
    if (createOutcomeUnknown) {
      setError("Refresh this page before trying to create another room item.");
      return;
    }
    if (!tentGate.allowed) {
      setError(tentGate.blockedCopy);
      return;
    }
    const payload = buildStartRoomTentPayload(shownForm, shownIds);
    if (!payload) {
      setError("Enter a tent name. Grow context is required.");
      return;
    }
    let tentId: string;
    try {
      tentId = rowIdFor("tent");
    } catch {
      setError("Verdant could not start a safe tent save. Refresh and try again.");
      return;
    }
    const attempt = {
      entity: "tent" as const,
      rowId: tentId,
      ownerId: user.id,
      growId: payload.grow_id,
    };
    createInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const confirmed = await persistStartRoomAttempt(attempt, {
        id: tentId,
        user_id: user.id,
        ...payload,
      });
      if (!confirmed) return;
      releaseRowId("tent");
      setIds((prev) => ({
        growId: prev.growId ?? shownIds.growId,
        tentId: confirmed.row.id,
        plantId: prev.plantId ?? shownIds.plantId,
      }));
      setForm((prev) => ({
        ...prev,
        growName: prev.growName || shownForm.growName,
        tentName: prev.tentName || shownForm.tentName,
      }));
      toast.success("Tent created and linked to grow");
      setStep(nextStepAfter("tent"));
    } finally {
      createInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function submitPlant() {
    if (!user || busy || createInFlightRef.current) return;
    if (createOutcomeUnknown) {
      setError("Refresh this page before trying to create another room item.");
      return;
    }
    const payload = buildStartRoomPlantPayload(shownForm, shownIds);
    if (!payload) {
      setError("Enter a plant name. Grow and tent must already exist.");
      return;
    }
    let plantId: string;
    try {
      plantId = rowIdFor("plant");
    } catch {
      setError("Verdant could not start a safe plant save. Refresh and try again.");
      return;
    }
    const attempt = {
      entity: "plant" as const,
      rowId: plantId,
      ownerId: user.id,
      growId: payload.grow_id,
      tentId: payload.tent_id,
    };
    createInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const confirmed = await persistStartRoomAttempt(attempt, {
        id: plantId,
        user_id: user.id,
        ...payload,
      });
      if (!confirmed) return;
      releaseRowId("plant");
      // Fail closed if binding somehow dropped (should never happen with payload).
      if (!confirmed.row.grow_id) {
        setError(
          "Plant was created without grow context. Use Plant Detail rescue or Lineage Repair.",
        );
        return;
      }
      // Quick Log is permanently mounted and can still hold the pre-wizard
      // empty lists. Settle every target selector refresh before exposing the
      // Finish handoff. A failed refresh remains recoverable inside Quick Log;
      // it must not create a second plant or strand this completed wizard.
      await Promise.allSettled([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["tents"] }),
        queryClient.invalidateQueries({ queryKey: ["plants"] }),
      ]);
      setIds((prev) => ({
        growId: prev.growId ?? shownIds.growId,
        tentId: prev.tentId ?? shownIds.tentId,
        plantId: confirmed.row.id,
      }));
      setForm((prev) => ({
        ...prev,
        growName: prev.growName || shownForm.growName,
        tentName: prev.tentName || shownForm.tentName,
        plantName: prev.plantName || shownForm.plantName,
      }));
      toast.success("Plant created and linked");
      setStep(nextStepAfter("plant"));
    } finally {
      createInFlightRef.current = false;
      setBusy(false);
    }
  }

  function finish() {
    if (!canFinish(shownIds) || !shownIds.plantId || !user) return;
    // Persist diary-first start screen so next login skips empty onboarding.
    setStartScreenChoice(user.id, "quickLog");
    nav(plantDetailQuickLogHref(shownIds.plantId), { replace: true });
  }

  function retryCurrentSave() {
    if (shownStep === "grow") void submitGrow();
    else if (shownStep === "tent") void submitTent();
    else if (shownStep === "plant") void submitPlant();
  }

  function submitGrowFromForm(event: { preventDefault: () => void }) {
    event.preventDefault();
    void submitGrow();
  }

  function submitTentFromForm(event: { preventDefault: () => void }) {
    event.preventDefault();
    void submitTent();
  }

  function submitPlantFromForm(event: { preventDefault: () => void }) {
    event.preventDefault();
    void submitPlant();
  }

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-8">
      <div
        className="w-full max-w-md glass rounded-2xl p-6 space-y-4"
        data-testid="start-your-room"
        data-step={shownStep}
      >
        <div className="flex items-center justify-between gap-2">
          <p
            className="text-[11px] uppercase tracking-wider text-muted-foreground"
            data-testid="start-your-room-progress"
          >
            {progress}
          </p>
          <Link
            to="/onboarding"
            className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            data-testid="start-your-room-skip-start-screen"
          >
            {START_YOUR_ROOM_COPY.skipToStartScreen}
          </Link>
        </div>

        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-display font-bold outline-hidden"
          data-testid="start-your-room-title"
        >
          {START_YOUR_ROOM_COPY.pageTitle}
        </h1>
        <p className="text-sm text-muted-foreground -mt-2">{START_YOUR_ROOM_COPY.pageSubtitle}</p>

        {createOutcomeUnknown && (
          <p
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
            data-testid="start-room-create-outcome-unknown"
          >
            Verdant could not confirm whether the last room item was saved. Refresh this page before
            creating another so you do not make a duplicate.
          </p>
        )}

        {!showRoomLoading && shownStep === "grow" && (
          <form onSubmit={submitGrowFromForm}>
            <section className="space-y-3" data-testid="start-your-room-step-grow">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sprout className="h-4 w-4 text-primary" aria-hidden />
                {START_YOUR_ROOM_COPY.growTitle}
              </div>
              <p className="text-xs text-muted-foreground">{START_YOUR_ROOM_COPY.growHelp}</p>
              <div>
                <Label htmlFor="start-room-grow-name">Grow name</Label>
                <Input
                  id="start-room-grow-name"
                  data-testid="start-room-grow-name"
                  value={shownForm.growName}
                  onChange={(e) => patchForm({ growName: e.target.value })}
                  placeholder="Spring run · Tent A"
                  autoComplete="off"
                  maxLength={80}
                />
              </div>
              <Button
                type="submit"
                className="w-full gradient-leaf text-primary-foreground"
                disabled={
                  busy ||
                  createOutcomeUnknown ||
                  !roomPreflightGate.allowed ||
                  !canProceedGrow(shownForm)
                }
                data-testid="start-room-grow-submit"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : START_YOUR_ROOM_COPY.ctaGrow}
              </Button>
            </section>
          </form>
        )}

        {!showRoomLoading && shownStep === "tent" && (
          <form onSubmit={submitTentFromForm}>
            <section className="space-y-3" data-testid="start-your-room-step-tent">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Box className="h-4 w-4 text-primary" aria-hidden />
                {START_YOUR_ROOM_COPY.tentTitle}
              </div>
              <p className="text-xs text-muted-foreground">{START_YOUR_ROOM_COPY.tentHelp}</p>
              <p
                className="text-xs rounded-md border border-primary/30 bg-primary/10 px-3 py-2"
                data-testid="start-room-bound-grow"
              >
                Bound to grow:{" "}
                <span className="font-medium">{shownForm.growName.trim() || "your grow"}</span>
              </p>
              <div>
                <Label htmlFor="start-room-tent-name">Tent name</Label>
                <Input
                  id="start-room-tent-name"
                  data-testid="start-room-tent-name"
                  value={shownForm.tentName}
                  onChange={(e) => patchForm({ tentName: e.target.value })}
                  placeholder="4×4 flower"
                  autoComplete="off"
                  maxLength={80}
                />
              </div>
              <Button
                type="submit"
                className="w-full gradient-leaf text-primary-foreground"
                disabled={
                  busy ||
                  createOutcomeUnknown ||
                  !tentGate.allowed ||
                  !canProceedTent(shownForm, shownIds)
                }
                data-testid="start-room-tent-submit"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : START_YOUR_ROOM_COPY.ctaTent}
              </Button>
            </section>
          </form>
        )}

        {!showRoomLoading && shownStep === "plant" && (
          <form onSubmit={submitPlantFromForm}>
            <section className="space-y-3" data-testid="start-your-room-step-plant">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Leaf className="h-4 w-4 text-primary" aria-hidden />
                {START_YOUR_ROOM_COPY.plantTitle}
              </div>
              <p className="text-xs text-muted-foreground">{START_YOUR_ROOM_COPY.plantHelp}</p>
              <p className="text-xs rounded-md border border-primary/30 bg-primary/10 px-3 py-2">
                Bound to grow + tent:{" "}
                <span className="font-medium">
                  {shownForm.growName.trim()} · {shownForm.tentName.trim()}
                </span>
              </p>
              <div>
                <Label htmlFor="start-room-plant-name">Plant name</Label>
                <Input
                  id="start-room-plant-name"
                  data-testid="start-room-plant-name"
                  value={shownForm.plantName}
                  onChange={(e) => patchForm({ plantName: e.target.value })}
                  placeholder="Plant A"
                  autoComplete="off"
                  maxLength={80}
                />
              </div>
              <div>
                <Label htmlFor="start-room-plant-stage">Stage</Label>
                <select
                  id="start-room-plant-stage"
                  data-testid="start-room-plant-stage"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={shownForm.plantStage}
                  onChange={(e) => patchForm({ plantStage: e.target.value })}
                >
                  {STAGES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="submit"
                className="w-full gradient-leaf text-primary-foreground"
                disabled={busy || createOutcomeUnknown || !canProceedPlant(shownForm, shownIds)}
                data-testid="start-room-plant-submit"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  START_YOUR_ROOM_COPY.ctaPlant
                )}
              </Button>
            </section>
          </form>
        )}

        {!showRoomLoading && shownStep === "done" && (
          <section className="space-y-3" data-testid="start-your-room-step-done">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-500">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {START_YOUR_ROOM_COPY.doneTitle}
            </div>
            <p className="text-xs text-muted-foreground">{START_YOUR_ROOM_COPY.doneHelp}</p>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li>Grow: {shownForm.growName.trim()}</li>
              <li>Tent: {shownForm.tentName.trim()}</li>
              <li>Plant: {shownForm.plantName.trim()}</li>
            </ul>
            <Button
              type="button"
              className="w-full gradient-leaf text-primary-foreground"
              disabled={!canFinish(shownIds)}
              onClick={finish}
              data-testid="start-room-finish"
            >
              {START_YOUR_ROOM_COPY.ctaDone}
            </Button>
            {shownIds.plantId ? (
              <Link
                to={plantDetailQuickLogHref(shownIds.plantId)}
                data-testid="start-room-plant-link"
              >
                {START_YOUR_ROOM_COPY.ctaDone}
              </Link>
            ) : null}
          </section>
        )}

        {showRoomLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            {ROOM_LIMITS_LOADING_COPY}
          </p>
        ) : !error && currentCreationGate && creationVerificationFailed ? (
          <div className="space-y-2" data-testid="start-room-creation-gate">
            <p role="alert" className="text-sm text-muted-foreground">
              {currentCreationGate.blockedCopy}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void retryCreationVerification()}
              disabled={verificationRetrying}
              data-testid="start-room-creation-retry"
            >
              {verificationRetrying ? "Checking again…" : "Retry plan and room check"}
            </Button>
          </div>
        ) : !error && currentCreationGate && !currentCreationGate.allowed ? (
          <div className="space-y-2" data-testid="start-room-creation-gate">
            <p role="status" className="text-sm text-muted-foreground">
              {currentCreationGate.blockedCopy}
            </p>
            <Link
              to="/pricing"
              className="inline-flex text-sm font-medium text-primary underline underline-offset-2"
              data-testid="start-room-creation-upgrade"
            >
              See plan options
            </Link>
          </div>
        ) : null}

        {error ? (
          <div className="space-y-2" data-testid="start-your-room-error-block">
            <p
              role="alert"
              className="text-sm text-destructive"
              data-testid="start-your-room-error"
            >
              {error}
            </p>
            {!createOutcomeUnknown ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={retryCurrentSave}
                disabled={busy}
                data-testid="start-room-save-retry"
              >
                {busy ? "Saving…" : "Retry"}
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">{START_YOUR_ROOM_SAVE_RETRY_COPY}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
