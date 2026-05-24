/**
 * Daily Grow Check — mobile-first guided flow.
 *
 * Reuses existing read paths and write paths. The page itself never writes
 * to sensor_readings, never mutates alerts/action_queue, and never executes
 * device commands or automation. It only orchestrates the grower through
 * existing surfaces:
 *
 *   1. Select Current Tent / Plant
 *   2. Review Current Environment (read-only)
 *   3. Add Manual Sensor Snapshot (existing ManualSensorReadingCard)
 *   4. Add Quick Log note/photo (existing QuickLog dialog)
 *   5. Add optional handheld readings (existing QuickLog hardware block)
 *   6. Review Tent Alerts and Pending Tasks (read-only)
 *
 * Manual readings remain source = "manual". Handheld pH/EC/PPFD readings
 * remain QuickLog note text only. CO2 is context-only.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Box,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Info,
  ListTodo,
  Sparkles,
  Sprout,
  SkipForward,
  Wrench,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import QuickLog from "@/components/QuickLog";
import PlantStatusStrip from "@/components/PlantStatusStrip";
import PlantAssignedTentAlertsPanel from "@/components/PlantAssignedTentAlertsPanel";
import PlantAssignedTentActionsPanel from "@/components/PlantAssignedTentActionsPanel";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useTents } from "@/hooks/use-tents";
import { usePlants } from "@/hooks/use-plants";
import { useScopedGrow } from "@/hooks/useScopedGrow";
import {
  DAILY_GROW_CHECK_STEPS,
  INITIAL_DAILY_GROW_CHECK_STATE,
  buildDailyGrowCheckReviewLinks,
  buildDailyGrowCheckSummary,
  evaluateDailyGrowCheckGuard,
  formatOutcomeLabel,
  nextStep,
  previousStep,
  stepProgress,
  type DailyGrowCheckState,
  type DailyGrowCheckStep,
  type StepOutcome,
} from "@/lib/dailyGrowCheckRules";
import {
  DAILY_CHECK_WHAT_COUNTS_HINT,
  resolveDailyCheckPlantSelection,
} from "@/lib/dailyCheckPlantSelectionRules";
import {
  DAILY_CHECK_SUCCESS_BODY,
  DAILY_CHECK_SUCCESS_TITLE,
  buildDailyCheckPostSubmitActions,
  formatDailyCheckLoggedAt,
  parseDailyCheckEntrySource,
  parseDailyCheckMethodHint,
} from "@/lib/dailyCheckPostSubmitRules";

import DailyGrowCheckOnboardingCard from "@/components/DailyGrowCheckOnboardingCard";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { deriveChangeContextFromReadings } from "@/lib/manualSensorSnapshotChangeContextRules";

function useQueryParam(name: string): string | null {
  const loc = useLocation();
  return useMemo(
    () => new URLSearchParams(loc.search).get(name),
    [loc.search, name],
  );
}

export default function DailyCheck() {
  const { data: tents = [], isLoading: tentsLoading } = useTents();
  const { data: plants = [], isLoading: plantsLoading } = usePlants();
  const initialPlantId = useQueryParam("plantId");
  const fromParam = useQueryParam("from");
  const entrySource = useMemo(
    () => parseDailyCheckEntrySource(fromParam),
    [fromParam],
  );
  const methodParam = useQueryParam("method");
  const methodHint = useMemo(
    () => parseDailyCheckMethodHint(methodParam),
    [methodParam],
  );
  const { urlGrowId } = useScopedGrow();


  const [plantId, setPlantId] = useState<string>("");
  const [tentId, setTentId] = useState<string>("");
  const [step, setStep] = useState<DailyGrowCheckStep>("select");
  const [state, setState] = useState<DailyGrowCheckState>(
    INITIAL_DAILY_GROW_CHECK_STATE,
  );
  const [quickLogOpen, setQuickLogOpen] = useState(false);

  // Pure resolution of the ?plantId= URL param against the active plant
  // list and current grow scope. Never silently picks a different plant.
  const plantResolution = useMemo(
    () =>
      resolveDailyCheckPlantSelection({
        plantIdParam: initialPlantId,
        plants,
        activeGrowId: urlGrowId,
      }),
    [initialPlantId, plants, urlGrowId],
  );

  // Seed plant from query param ONLY when the resolution is valid. Invalid
  // / out-of-scope / unknown cases fall through to the picker + banner.
  useEffect(() => {
    if (plantId) return;
    if (plantResolution.status !== "valid" || !plantResolution.plant) return;
    setPlantId(plantResolution.plant.id);
    if (plantResolution.plant.tent_id) setTentId(plantResolution.plant.tent_id);
  }, [plantResolution, plantId]);

  // When a plant is chosen, sync its assigned tent
  useEffect(() => {
    if (!plantId) return;
    const match = plants.find((p) => p.id === plantId);
    if (match?.tent_id) setTentId(match.tent_id);
  }, [plantId, plants]);

  // Default tent to first if none selected and no plant chosen
  useEffect(() => {
    if (!tentId && !plantId && tents[0]?.id) setTentId(tents[0].id);
  }, [tentId, plantId, tents]);

  // Apply ?method= hint exactly once: when the plant resolution is valid
  // and the grower is still on the default "select" step. Sensor focus is
  // gated on a tent assignment — never silently pick a different tent.
  // Never auto-submits; only prioritizes the matching option/dialog.
  const [methodHintApplied, setMethodHintApplied] = useState(false);
  useEffect(() => {
    if (methodHintApplied) return;
    if (!methodHint) return;
    if (step !== "select") return;
    if (plantResolution.status !== "valid" || !plantResolution.plant) return;
    if (methodHint === "note") {
      setStep("quicklog");
      setQuickLogOpen(true);
      setMethodHintApplied(true);
      return;
    }
    if (methodHint === "sensor") {
      // Sensor focus requires a tent. If missing, leave step alone —
      // the existing `plant-needs-tent` guard renders the safe message.
      if (!plantResolution.plant.tent_id) return;
      setStep("manual");
      setMethodHintApplied(true);
    }
  }, [methodHint, methodHintApplied, plantResolution, step]);

  const selectedPlant = useMemo(
    () => plants.find((p) => p.id === plantId) ?? null,
    [plantId, plants],
  );
  const selectedTent = useMemo(
    () => tents.find((t) => t.id === tentId) ?? null,
    [tentId, tents],
  );
  const growId = (selectedPlant as { grow_id?: string | null } | null)?.grow_id ?? null;

  const guard = evaluateDailyGrowCheckGuard({
    tentsCount: tents.length,
    plantsCount: plants.length,
    selectedPlantTentId: selectedPlant?.tent_id ?? null,
    hasSelectedPlant: !!selectedPlant,
  });

  // Post-submit confirmation is driven exclusively by QuickLog's
  // `verdant:entry-created` window event, which is dispatched ONLY after a
  // successful insert. Failed submits never set this state.
  const [lastSubmittedAt, setLastSubmittedAt] = useState<number | null>(null);
  const [lastSubmittedSource, setLastSubmittedSource] = useState<
    "note" | "sensor" | null
  >(null);

  // Listen for QuickLog success to mark steps as added + drive confirmation.
  // We prefer the `createdAt` carried on the event detail (set by QuickLog
  // after a successful insert) so the "Logged at" stamp reflects the
  // real save time, not the moment the React listener happened to run.
  useEffect(() => {
    function onEntry(e: Event) {
      const detail = (e as CustomEvent<{ createdAt?: string | number | Date }>).detail;
      const raw = detail?.createdAt;
      const parsed = raw != null ? new Date(raw).getTime() : NaN;
      setLastSubmittedAt(Number.isFinite(parsed) ? parsed : Date.now());
      setLastSubmittedSource("note");
      setState((s) => {
        const next = { ...s };
        if (step === "quicklog" && s.quicklog === "pending") next.quicklog = "added";
        if (step === "handheld" && s.handheld === "pending") next.handheld = "added";
        return next;
      });
    }
    function onSensor(e: Event) {
      // Manual sensor snapshot success — counts as today's check and
      // shows the same source-aware confirmation card. Drives the
      // `manual` step outcome when the grower is on that step.
      const detail = (e as CustomEvent<{ createdAt?: string | number | Date }>).detail;
      const raw = detail?.createdAt;
      const parsed = raw != null ? new Date(raw).getTime() : NaN;
      setLastSubmittedAt(Number.isFinite(parsed) ? parsed : Date.now());
      setState((s) =>
        step === "manual" && s.manual === "pending"
          ? { ...s, manual: "added" }
          : s,
      );
    }
    window.addEventListener("verdant:entry-created", onEntry);
    window.addEventListener("verdant:sensor-reading-created", onSensor);
    return () => {
      window.removeEventListener("verdant:entry-created", onEntry);
      window.removeEventListener("verdant:sensor-reading-created", onSensor);
    };
  }, [step]);

  const postSubmitActions = useMemo(
    () =>
      buildDailyCheckPostSubmitActions({
        plantId: selectedPlant?.id ?? null,
        source: entrySource,
      }),
    [selectedPlant?.id, entrySource],
  );

  const loggedAtLabel = useMemo(
    () => formatDailyCheckLoggedAt(lastSubmittedAt),
    [lastSubmittedAt],
  );

  const progress = stepProgress(step);

  function markAndAdvance(field: keyof DailyGrowCheckState, value: StepOutcome) {
    setState((s) => ({ ...s, [field]: value }));
    setStep((s) => nextStep(s));
  }

  if (tentsLoading || plantsLoading) {
    return <div className="glass rounded-2xl h-64 animate-pulse" />;
  }

  return (
    <div className="max-w-2xl mx-auto pb-24" data-testid="daily-grow-check-page">
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/"><ArrowLeft className="h-4 w-4" /> Dashboard</Link>
      </Button>
      <PageHeader
        title="Daily Grow Check"
        description="A guided daily walkthrough — current tent, environment, manual snapshot, Quick Log, and review."
        icon={<ClipboardCheck className="h-5 w-5" />}
      />

      {/* Plain-language explanation of what a check actually is. */}
      <p
        className="text-xs text-muted-foreground flex items-start gap-1 mb-3"
        data-testid="daily-grow-check-what-counts"
      >
        <Info className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{DAILY_CHECK_WHAT_COUNTS_HINT}</span>
      </p>

      {/* Visible rejection banner when ?plantId= cannot be honored. */}
      {plantResolution.message && (
        <div
          className="rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 p-3 text-sm flex items-start gap-2 mb-4"
          data-testid="daily-grow-check-plant-rejected"
          data-rejection-status={plantResolution.status}
          data-requested-plant-id={plantResolution.requestedPlantId ?? ""}
          role="status"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{plantResolution.message}</span>
        </div>
      )}

      {/* Post-submit confirmation. Only renders after QuickLog dispatches
          `verdant:entry-created`, which only fires after a successful insert. */}
      {lastSubmittedAt !== null && (
        <div
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 mb-4 space-y-2"
          data-testid="daily-grow-check-post-submit"
          data-submitted-at={lastSubmittedAt}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2
              className="h-4 w-4 mt-0.5 text-emerald-400 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div
                className="text-sm font-semibold"
                data-testid="daily-grow-check-post-submit-title"
              >
                {DAILY_CHECK_SUCCESS_TITLE}
              </div>
              <p
                className="text-xs text-muted-foreground"
                data-testid="daily-grow-check-post-submit-body"
              >
                {DAILY_CHECK_SUCCESS_BODY}
              </p>
              {loggedAtLabel && (
                <p
                  className="text-xs text-emerald-300/90 mt-1"
                  data-testid="daily-grow-check-post-submit-logged-at"
                >
                  {loggedAtLabel}
                </p>
              )}
            </div>
          </div>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            data-testid="daily-grow-check-post-submit-actions"
          >
            {postSubmitActions.map((a) => (
              <Button
                key={a.key}
                asChild
                size="sm"
                variant={a.primary ? "default" : "outline"}
                className="h-10 justify-between"
                data-testid={`daily-grow-check-post-submit-${a.key}`}
              >
                <Link to={a.href}>
                  {a.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ))}
          </div>
        </div>
      )}

      <DailyGrowCheckOnboardingCard
        focusedPlantId={selectedPlant?.id ?? plantResolution.plant?.id ?? null}
        hideWhenReady
        className="mb-4"
      />

      {/* Empty / guard states */}
      {!guard.ok && guard.reason === "no-tents" && (
        <EmptyState
          icon={<Box className="h-6 w-6" />}
          title="Add a tent first."
          description="Daily Grow Check needs at least one tent to attach readings to."
          action={
            <Button asChild>
              <Link to="/tents" data-testid="daily-grow-check-add-tent">
                Add Tent <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          }
        />
      )}
      {!guard.ok && guard.reason === "no-plants" && (
        <EmptyState
          icon={<Sprout className="h-6 w-6" />}
          title="Add a plant first."
          description="Daily Grow Check is plant-centered. Add a plant to begin."
          action={
            <Button asChild>
              <Link to="/plants" data-testid="daily-grow-check-add-plant">
                Add Plant <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          }
        />
      )}

      {guard.ok || guard.reason === "plant-needs-tent" ? (
        <>
          {/* Choose today's check — first-class quick entry to either of the
              two read paths that count as a Daily Grow Check:
                - plant QuickLog note
                - current-tent manual sensor snapshot
              No new persistence. No new sensor ingestion. Sensor snapshot
              option is gated on the selected plant having an assigned tent;
              we never silently pick a tent on the grower's behalf. */}
          {step !== "done" && (
            <section
              className="glass rounded-2xl p-4 mb-4 space-y-3"
              data-testid="daily-grow-check-choose"
              data-plant-id={selectedPlant?.id ?? ""}
              data-plant-tent-id={selectedPlant?.tent_id ?? ""}
              data-method-hint={methodHint ?? ""}
            >
              <div>
                <h2 className="font-display font-semibold text-base flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4" />
                  Choose today's check
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Either path counts. Logging a check does not mean the plant
                  is healthy — it just records what you observed today.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className={`h-auto py-3 flex-col items-start gap-1 ${
                    methodHint === "note" ? "ring-2 ring-primary" : ""
                  }`}
                  data-testid="daily-grow-check-choose-quicklog"
                  data-method-focused={methodHint === "note" ? "1" : "0"}
                  aria-pressed={methodHint === "note"}
                  onClick={() => {
                    setStep("quicklog");
                    setQuickLogOpen(true);
                  }}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Sparkles className="h-4 w-4" /> Add plant note
                  </span>
                  <span className="text-[11px] text-muted-foreground text-left">
                    Quick Log a short observation or photo for this plant.
                  </span>
                </Button>
                <Button
                  variant="outline"
                  className={`h-auto py-3 flex-col items-start gap-1 ${
                    methodHint === "sensor" && !!selectedPlant?.tent_id
                      ? "ring-2 ring-primary"
                      : ""
                  }`}
                  data-testid="daily-grow-check-choose-snapshot"
                  data-method-focused={
                    methodHint === "sensor" && !!selectedPlant?.tent_id ? "1" : "0"
                  }
                  aria-pressed={methodHint === "sensor" && !!selectedPlant?.tent_id}
                  disabled={!!selectedPlant && !selectedPlant.tent_id}
                  onClick={() => setStep("manual")}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Gauge className="h-4 w-4" /> Add sensor snapshot
                  </span>
                  <span className="text-[11px] text-muted-foreground text-left">
                    Save a manual reading for this plant's current tent.
                  </span>
                </Button>
              </div>

              {selectedPlant && !selectedPlant.tent_id && (
                <p
                  className="text-xs text-amber-300 flex items-start gap-1"
                  data-testid="daily-grow-check-choose-no-tent"
                >
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>Sensor snapshots need a tent assignment.</span>
                </p>
              )}
            </section>
          )}

          {/* Progress */}
          {step !== "done" && (
            <div className="glass rounded-2xl p-3 mb-4" data-testid="daily-grow-check-progress">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>Step {progress.index + 1} of {progress.total}</span>
                <span className="capitalize">{step}</span>
              </div>
              <Progress value={progress.percent} className="h-1.5" />
            </div>
          )}

          {/* Step content */}
          {step === "select" && (
            <StepCard title="Step 1 · Select Current Tent / Plant" icon={<Sprout className="h-4 w-4" />}>
              <div className="grid gap-3">
                <div>
                  <Label className="text-xs">Current Plant</Label>
                  <Select value={plantId || "__none"} onValueChange={(v) => setPlantId(v === "__none" ? "" : v)}>
                    <SelectTrigger data-testid="daily-grow-check-plant-select">
                      <SelectValue placeholder="Select a plant" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No specific plant</SelectItem>
                      {plants.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.strain ? ` · ${p.strain}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Current Tent</Label>
                  <Select value={tentId} onValueChange={setTentId} disabled={!!selectedPlant?.tent_id}>
                    <SelectTrigger data-testid="daily-grow-check-tent-select">
                      <SelectValue placeholder="Select a tent" />
                    </SelectTrigger>
                    <SelectContent>
                      {tents.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedPlant?.tent_id && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Tent follows the selected plant's assignment.
                    </p>
                  )}
                </div>

                {guard.reason === "plant-needs-tent" && (
                  <div
                    className="rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 p-3 text-sm"
                    data-testid="daily-grow-check-needs-tent"
                  >
                    Assign this plant to a tent before running Daily Grow Check.
                    <div className="mt-2">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/plants/${selectedPlant?.id}`}>Assign Tent</Link>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </StepCard>
          )}

          {step === "environment" && (
            <StepCard title="Step 2 · Review Current Environment" icon={<Gauge className="h-4 w-4" />}>
              <PlantStatusStrip
                tentId={tentId || null}
                tentName={selectedTent?.name ?? null}
                growId={growId}
              />
              <p className="text-[11px] text-muted-foreground">
                Read-only. Source and freshness shown above. Manual snapshot, not live sensor data,
                unless your source label says otherwise.
              </p>
            </StepCard>
          )}

          {step === "manual" && (
            <StepCard title="Step 3 · Add Manual Sensor Snapshot" icon={<Gauge className="h-4 w-4" />}>
              <ManualSensorReadingCard
                tents={tents.map((t) => ({ id: t.id, name: t.name }))}
                defaultTentId={tentId || undefined}
              />
              <p className="text-[11px] text-muted-foreground mt-2">
                Saved as <strong>manual</strong>, not live sensor data. Temperature uses °F.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  data-testid="daily-grow-check-mark-manual-added"
                  onClick={() => markAndAdvance("manual", "visited")}
                >
                  <Check className="h-4 w-4" /> I saved it
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1"
                  data-testid="daily-grow-check-skip-manual"
                  onClick={() => markAndAdvance("manual", "skipped")}
                >
                  <SkipForward className="h-4 w-4" /> Skip
                </Button>
              </div>
            </StepCard>
          )}

          {step === "quicklog" && (
            <StepCard title="Step 4 · Quick Log" icon={<Sparkles className="h-4 w-4" />}>
              <p className="text-sm text-muted-foreground mb-3">
                Add a quick note (and optional photo) about what you observed today.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  data-testid="daily-grow-check-open-quicklog"
                  onClick={() => setQuickLogOpen(true)}
                >
                  <Sparkles className="h-4 w-4" /> Open Quick Log
                </Button>
                {state.quicklog === "added" && (
                  <p className="text-xs text-[hsl(var(--success))] flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Quick Log entry saved.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => markAndAdvance("quicklog", state.quicklog === "added" ? "added" : "added")}
                    disabled={state.quicklog !== "added"}
                    data-testid="daily-grow-check-mark-quicklog-added"
                  >
                    <Check className="h-4 w-4" /> Continue
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => markAndAdvance("quicklog", "skipped")}
                    data-testid="daily-grow-check-skip-quicklog"
                  >
                    <SkipForward className="h-4 w-4" /> Skip
                  </Button>
                </div>
              </div>
            </StepCard>
          )}

          {step === "handheld" && (
            <StepCard title="Step 5 · Handheld Readings" icon={<Wrench className="h-4 w-4" />}>
              <p className="text-sm text-muted-foreground mb-3">
                Optional. Use the Hardware readings block inside Quick Log
                (Spider Farmer pH/EC pen, PAR/PPFD meter). Saved as note text only —
                never as live sensor data.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  data-testid="daily-grow-check-open-quicklog-handheld"
                  onClick={() => setQuickLogOpen(true)}
                >
                  <Wrench className="h-4 w-4" /> Open Quick Log for handheld readings
                </Button>
                {state.handheld === "added" && (
                  <p className="text-xs text-[hsl(var(--success))] flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Handheld readings logged.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => markAndAdvance("handheld", state.handheld === "added" ? "added" : "added")}
                    disabled={state.handheld !== "added"}
                    data-testid="daily-grow-check-mark-handheld-added"
                  >
                    <Check className="h-4 w-4" /> Continue
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => markAndAdvance("handheld", "skipped")}
                    data-testid="daily-grow-check-skip-handheld"
                  >
                    <SkipForward className="h-4 w-4" /> Skip
                  </Button>
                </div>
              </div>
            </StepCard>
          )}

          {step === "review" && (
            <StepCard title="Step 6 · Review Alerts & Pending Tasks" icon={<Bell className="h-4 w-4" />}>
              <p className="text-xs text-muted-foreground mb-2">
                Read-only review. Nothing is approved, dismissed, or executed here.
              </p>
              <PlantAssignedTentAlertsPanel
                tentId={tentId || null}
                tentName={selectedTent?.name ?? null}
                growId={growId}
              />
              <PlantAssignedTentActionsPanel
                tentId={tentId || null}
                tentName={selectedTent?.name ?? null}
                growId={growId}
              />
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Button
                  variant="outline"
                  onClick={() => setState((s) => ({ ...s, alertsReviewed: true, tasksReviewed: true }))}
                  data-testid="daily-grow-check-mark-reviewed"
                >
                  <Check className="h-4 w-4" /> Mark reviewed
                </Button>
                <Button
                  onClick={() => setStep("done")}
                  data-testid="daily-grow-check-finish"
                >
                  Finish <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </StepCard>
          )}

          {step === "done" && (
            <StepCard title="Today's check is saved" icon={<CheckCircle2 className="h-4 w-4" />}>
              <p className="text-sm text-muted-foreground mb-3" data-testid="daily-grow-check-done-subtitle">
                Review what changed below, then jump back into the plant or tent.
              </p>
              <ul
                className="grid gap-2"
                data-testid="daily-grow-check-summary"
              >
                {buildDailyGrowCheckSummary(state).map((row) => (
                  <li
                    key={row.key}
                    className="flex items-center justify-between rounded-lg border bg-card/40 p-3"
                    data-testid={`daily-grow-check-summary-${row.key}`}
                    data-outcome={row.outcome}
                  >
                    <span className="text-sm flex items-center gap-2">
                      {row.key === "alerts" ? <Bell className="h-3.5 w-3.5" /> :
                       row.key === "tasks" ? <ListTodo className="h-3.5 w-3.5" /> :
                       row.key === "manual" ? <Gauge className="h-3.5 w-3.5" /> :
                       row.key === "handheld" ? <Wrench className="h-3.5 w-3.5" /> :
                       <Sparkles className="h-3.5 w-3.5" />}
                      {row.label}
                    </span>
                    <Badge variant="outline" data-testid={`daily-grow-check-summary-${row.key}-label`}>
                      {formatOutcomeLabel(row.outcome)}
                    </Badge>
                  </li>
                ))}
              </ul>

              <div
                className="grid gap-2 mt-4"
                data-testid="daily-grow-check-review-links"
              >
                {buildDailyGrowCheckReviewLinks({
                  plantId: selectedPlant?.id ?? null,
                  tentId: tentId || null,
                }).map((link) => (
                  <Button
                    key={link.key}
                    asChild
                    variant={link.primary ? "default" : "outline"}
                    className="justify-between h-11"
                    data-testid={`daily-grow-check-review-link-${link.key}`}
                  >
                    <Link to={link.href}>
                      {link.label}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  className="h-11"
                  onClick={() => {
                    setState(INITIAL_DAILY_GROW_CHECK_STATE);
                    setStep("select");
                  }}
                  data-testid="daily-grow-check-restart"
                >
                  Run another check
                </Button>
              </div>
            </StepCard>
          )}

          {/* Sticky footer for Back/Next on mid-flow steps */}
          {step !== "done" && step !== "select" && step !== "review" && (
            <div
              className="sticky bottom-2 mt-4 flex gap-2 bg-background/80 backdrop-blur rounded-xl border p-2"
              data-testid="daily-grow-check-footer"
            >
              <Button
                variant="ghost"
                onClick={() => setStep(previousStep(step))}
                className="flex-1"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                variant="default"
                onClick={() => setStep(nextStep(step))}
                className="flex-1"
                data-testid="daily-grow-check-next"
              >
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          {step === "select" && guard.ok && (
            <div className="sticky bottom-2 mt-4 flex gap-2 bg-background/80 backdrop-blur rounded-xl border p-2">
              <Button
                className="flex-1"
                onClick={() => setStep("environment")}
                data-testid="daily-grow-check-start"
                disabled={!tentId}
              >
                Start <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Shared QuickLog dialog with prefill */}
          <QuickLog
            open={quickLogOpen}
            onOpenChange={setQuickLogOpen}
            prefill={{
              plantId: selectedPlant?.id ?? null,
              growId,
              tentId: tentId || null,
            }}
          />
        </>
      ) : null}

      {/* Step indices for tests/debug only — non-visual */}
      <span className="sr-only" data-testid="daily-grow-check-step-list">
        {DAILY_GROW_CHECK_STEPS.join(",")}
      </span>
    </div>
  );
}

function StepCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-2xl p-4 mb-4" data-testid="daily-grow-check-step">
      <h2 className="font-display font-semibold text-base flex items-center gap-2 mb-3">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
