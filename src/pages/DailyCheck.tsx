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
  ArrowLeft,
  ArrowRight,
  Bell,
  Box,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
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
import {
  DAILY_GROW_CHECK_STEPS,
  INITIAL_DAILY_GROW_CHECK_STATE,
  buildDailyGrowCheckSummary,
  evaluateDailyGrowCheckGuard,
  nextStep,
  previousStep,
  stepProgress,
  type DailyGrowCheckState,
  type DailyGrowCheckStep,
  type StepOutcome,
} from "@/lib/dailyGrowCheckRules";

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

  const [plantId, setPlantId] = useState<string>("");
  const [tentId, setTentId] = useState<string>("");
  const [step, setStep] = useState<DailyGrowCheckStep>("select");
  const [state, setState] = useState<DailyGrowCheckState>(
    INITIAL_DAILY_GROW_CHECK_STATE,
  );
  const [quickLogOpen, setQuickLogOpen] = useState(false);

  // Seed plant from query param once data loads
  useEffect(() => {
    if (initialPlantId && !plantId) {
      const match = plants.find((p) => p.id === initialPlantId);
      if (match) {
        setPlantId(match.id);
        if (match.tent_id) setTentId(match.tent_id);
      }
    }
  }, [initialPlantId, plants, plantId]);

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

  // Listen for QuickLog success to mark steps as added
  useEffect(() => {
    function onEntry() {
      // Only mark "added" while user is on QuickLog-related steps.
      setState((s) => {
        const next = { ...s };
        if (step === "quicklog" && s.quicklog === "pending") next.quicklog = "added";
        if (step === "handheld" && s.handheld === "pending") next.handheld = "added";
        return next;
      });
    }
    window.addEventListener("verdant:entry-created", onEntry);
    return () => window.removeEventListener("verdant:entry-created", onEntry);
  }, [step]);

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
                  onClick={() => markAndAdvance("manual", "added")}
                >
                  <Check className="h-4 w-4" /> Saved snapshot
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
            <StepCard title="All done" icon={<CheckCircle2 className="h-4 w-4" />}>
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
                    <Badge variant="outline" className="capitalize">
                      {row.outcome === "not-reviewed" ? "not reviewed" : row.outcome}
                    </Badge>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 mt-4">
                <Button asChild variant="outline" className="flex-1">
                  <Link to="/">Back to Dashboard</Link>
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    setState(INITIAL_DAILY_GROW_CHECK_STATE);
                    setStep("select");
                  }}
                  data-testid="daily-grow-check-restart"
                >
                  Run again
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
