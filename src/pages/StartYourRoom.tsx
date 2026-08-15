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
  progressLabel,
  plantDetailQuickLogHref,
  type StartYourRoomForm,
  type StartYourRoomIds,
  type StartYourRoomStep,
} from "@/lib/startYourRoomRules";
import { setStartScreenChoice } from "@/lib/startScreenPreferences";
import {
  evaluateVerifiedGrowCreationGate,
  evaluateVerifiedTentCreationGate,
} from "@/lib/entitlements/freeTierGates";

const STAGES = [
  { value: "seedling", label: "Seedling" },
  { value: "veg", label: "Vegetative" },
  { value: "flower", label: "Flowering" },
];

export default function StartYourRoom() {
  const { user, loading } = useAuth();
  const { grows, setActiveGrowId, refresh, loading: growsLoading, error: growsError } = useGrows();
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

  const [step, setStep] = useState<StartYourRoomStep>("grow");
  const [form, setForm] = useState<StartYourRoomForm>({ ...DEFAULT_START_YOUR_ROOM_FORM });
  const [ids, setIds] = useState<StartYourRoomIds>({ ...EMPTY_START_YOUR_ROOM_IDS });
  const [busy, setBusy] = useState(false);
  const [verificationRetrying, setVerificationRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const progress = useMemo(() => progressLabel(step), [step]);
  const growCountRequired = entitlement.capabilities.maxActiveGrows != null;
  const tentCountRequired = !entitlement.capabilities.multiTent;
  const creationVerificationLoading =
    verificationRetrying ||
    entitlementLoading ||
    (growCountRequired && growsLoading) ||
    (tentCountRequired && tentsQuery.isLoading);
  const creationVerificationFailed =
    entitlementLookupFailed ||
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
  const currentCreationGate =
    step === "grow" ? roomPreflightGate : step === "tent" ? tentGate : null;

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
      await Promise.allSettled([refresh(), tentsQuery.refetch(), refetchEntitlements()]);
    } finally {
      setVerificationRetrying(false);
    }
  }

  async function submitGrow() {
    if (!user || busy) return;
    if (!roomPreflightGate.allowed) {
      setError(roomPreflightGate.blockedCopy);
      return;
    }
    const payload = buildStartRoomGrowPayload(form);
    if (!payload) {
      setError("Enter a grow name to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("grows")
      .insert({ user_id: user.id, ...payload } as never)
      .select("id,name")
      .single();
    setBusy(false);
    if (err || !data) {
      setError(err?.message ?? "Could not create grow.");
      return;
    }
    setActiveGrowId(data.id);
    await refresh();
    setIds((prev) => ({ ...prev, growId: data.id }));
    toast.success("Grow created");
    setStep(nextStepAfter("grow"));
  }

  async function submitTent() {
    if (!user || busy) return;
    if (!tentGate.allowed) {
      setError(tentGate.blockedCopy);
      return;
    }
    const payload = buildStartRoomTentPayload(form, ids);
    if (!payload) {
      setError("Enter a tent name. Grow context is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("tents")
      .insert({ user_id: user.id, ...payload } as never)
      .select("id,name")
      .single();
    setBusy(false);
    if (err || !data) {
      setError(err?.message ?? "Could not create tent.");
      return;
    }
    setIds((prev) => ({ ...prev, tentId: data.id }));
    toast.success("Tent created and linked to grow");
    setStep(nextStepAfter("tent"));
  }

  async function submitPlant() {
    if (!user || busy) return;
    const payload = buildStartRoomPlantPayload(form, ids);
    if (!payload) {
      setError("Enter a plant name. Grow and tent must already exist.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("plants")
      .insert({ user_id: user.id, ...payload } as never)
      .select("id,name,grow_id,tent_id")
      .single();
    if (err || !data) {
      setBusy(false);
      setError(err?.message ?? "Could not create plant.");
      return;
    }
    // Fail closed if binding somehow dropped (should never happen with payload).
    if (!data.grow_id) {
      setBusy(false);
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
    setBusy(false);
    setIds((prev) => ({ ...prev, plantId: data.id }));
    toast.success("Plant created and linked");
    setStep(nextStepAfter("plant"));
  }

  function finish() {
    if (!canFinish(ids) || !ids.plantId || !user) return;
    // Persist diary-first start screen so next login skips empty onboarding.
    setStartScreenChoice(user.id, "quickLog");
    nav(plantDetailQuickLogHref(ids.plantId), { replace: true });
  }

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-8">
      <div
        className="w-full max-w-md glass rounded-2xl p-6 space-y-4"
        data-testid="start-your-room"
        data-step={step}
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

        {step === "grow" && (
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
                value={form.growName}
                onChange={(e) => patchForm({ growName: e.target.value })}
                placeholder="Spring run · Tent A"
                autoComplete="off"
                maxLength={80}
              />
            </div>
            <Button
              type="button"
              className="w-full gradient-leaf text-primary-foreground"
              disabled={busy || !roomPreflightGate.allowed || !canProceedGrow(form)}
              onClick={submitGrow}
              data-testid="start-room-grow-submit"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : START_YOUR_ROOM_COPY.ctaGrow}
            </Button>
          </section>
        )}

        {step === "tent" && (
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
              <span className="font-medium">{form.growName.trim() || "your grow"}</span>
            </p>
            <div>
              <Label htmlFor="start-room-tent-name">Tent name</Label>
              <Input
                id="start-room-tent-name"
                data-testid="start-room-tent-name"
                value={form.tentName}
                onChange={(e) => patchForm({ tentName: e.target.value })}
                placeholder="4×4 flower"
                autoComplete="off"
                maxLength={80}
              />
            </div>
            <Button
              type="button"
              className="w-full gradient-leaf text-primary-foreground"
              disabled={busy || !tentGate.allowed || !canProceedTent(form, ids)}
              onClick={submitTent}
              data-testid="start-room-tent-submit"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : START_YOUR_ROOM_COPY.ctaTent}
            </Button>
          </section>
        )}

        {step === "plant" && (
          <section className="space-y-3" data-testid="start-your-room-step-plant">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Leaf className="h-4 w-4 text-primary" aria-hidden />
              {START_YOUR_ROOM_COPY.plantTitle}
            </div>
            <p className="text-xs text-muted-foreground">{START_YOUR_ROOM_COPY.plantHelp}</p>
            <p className="text-xs rounded-md border border-primary/30 bg-primary/10 px-3 py-2">
              Bound to grow + tent:{" "}
              <span className="font-medium">
                {form.growName.trim()} · {form.tentName.trim()}
              </span>
            </p>
            <div>
              <Label htmlFor="start-room-plant-name">Plant name</Label>
              <Input
                id="start-room-plant-name"
                data-testid="start-room-plant-name"
                value={form.plantName}
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
                value={form.plantStage}
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
              type="button"
              className="w-full gradient-leaf text-primary-foreground"
              disabled={busy || !canProceedPlant(form, ids)}
              onClick={submitPlant}
              data-testid="start-room-plant-submit"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : START_YOUR_ROOM_COPY.ctaPlant}
            </Button>
          </section>
        )}

        {step === "done" && (
          <section className="space-y-3" data-testid="start-your-room-step-done">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-500">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {START_YOUR_ROOM_COPY.doneTitle}
            </div>
            <p className="text-xs text-muted-foreground">{START_YOUR_ROOM_COPY.doneHelp}</p>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li>Grow: {form.growName.trim()}</li>
              <li>Tent: {form.tentName.trim()}</li>
              <li>Plant: {form.plantName.trim()}</li>
            </ul>
            <Button
              type="button"
              className="w-full gradient-leaf text-primary-foreground"
              disabled={!canFinish(ids)}
              onClick={finish}
              data-testid="start-room-finish"
            >
              {START_YOUR_ROOM_COPY.ctaDone}
            </Button>
          </section>
        )}

        {!error && currentCreationGate && creationVerificationLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Checking your plan and active room limits…
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
          <p role="alert" className="text-sm text-destructive" data-testid="start-your-room-error">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
