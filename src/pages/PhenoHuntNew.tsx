import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Sprout } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { useAuth } from "@/store/auth";
import {
  createPhenoHunt,
  defaultHuntName,
  phenoHuntSaveErrorMessage,
  PHENO_TRACKER_PRO_REQUIRED_MESSAGE,
} from "@/lib/phenoHuntService";
import {
  buildPhenoHuntCandidateOrFilter,
  PHENO_HUNT_EMPTY_CANDIDATES,
} from "@/lib/phenoHuntCandidateQueryRules";
import {
  buildCandidateSelectionPreflight,
  clearSelection,
  selectAllIds,
  toggleIdInSet,
} from "@/lib/phenoHuntCandidateSelectionRules";

import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { canWriteFeatureData } from "@/lib/featureEntitlements";
import {
  PHENO_ONBOARDING_STEP_ORDER,
  computePhenoHuntOnboardingViewModel,
  defaultEvidenceGoalSelection,
  type PhenoOnboardingStepId,
} from "@/lib/phenoHuntOnboardingViewModel";
import type { PhenoEvidenceGoalId } from "@/lib/phenoEvidenceGoals";
import PhenoHuntOnboardingStepper from "@/components/PhenoHuntOnboardingStepper";
import PhenoEvidenceGoalsSelector from "@/components/PhenoEvidenceGoalsSelector";
import PhenoFirstEvidencePacketMapPreview from "@/components/PhenoFirstEvidencePacketMapPreview";
import PhenoComparisonReadyChecklist from "@/components/PhenoComparisonReadyChecklist";

interface PlantOption {
  id: string;
  name: string;
  strain: string | null;
}

interface GrowInfo {
  id: string;
  name: string;
}

/**
 * PhenoHuntNew — guided Pheno Tracker first-run flow.
 *
 * Steps: basics → candidates → evidence goals → evidence packet map preview
 * → comparison-ready checklist → create.
 *
 * SAFETY:
 *  - Route is wrapped in PhenoTrackerUpgradeGate (Free/canceled users never
 *    mount this page).
 *  - Write path re-checks `canWriteFeatureData` before firing
 *    `createPhenoHunt` — belt and suspenders on top of RLS + the
 *    RESTRICTIVE `has_pheno_tracker_entitlement` policies.
 *  - Evidence goals and checklist are onboarding-only UX. They are not
 *    persisted to the DB (no schema changes in this slice).
 */
export default function PhenoHuntNew() {
  const { user } = useAuth();
  const {
    entitlement,
    loading: entitlementLoading,
    lookupFailed: entitlementLookupFailed,
  } = useMyEntitlements();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const growId = params.get("growId");
  const tentId = params.get("tentId");

  const [grow, setGrow] = useState<GrowInfo | null>(null);
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [evidenceGoals, setEvidenceGoals] = useState<PhenoEvidenceGoalId[]>(() =>
    defaultEvidenceGoalSelection(),
  );
  const [currentStep, setCurrentStep] = useState<PhenoOnboardingStepId>("basics");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!growId) {
        setLoading(false);
        return;
      }
      // Dual-binding candidates: plant.grow_id match OR plant in a grow tent.
      // Tent-scoped hunts also include grow-bound plants with no tent yet.
      const { data: tentRows, error: tentErr } = await supabase
        .from("tents")
        .select("id")
        .eq("grow_id", growId);
      if (cancelled) return;
      if (tentErr) {
        toast.error(tentErr.message);
      }
      const tentIds = ((tentRows ?? []) as { id?: string | null }[])
        .map((t) => t.id ?? "")
        .filter((id) => id.length > 0);
      const orFilter = buildPhenoHuntCandidateOrFilter({
        growId,
        tentIdsInGrow: tentIds,
        tentScopeId: tentId,
      });
      const [{ data: growRow, error: growErr }, plantsRes] = await Promise.all([
        supabase.from("grows").select("id,name").eq("id", growId).maybeSingle(),
        orFilter
          ? supabase
              .from("plants")
              .select("id,name,strain,tent_id,grow_id")
              .or(orFilter)
              .eq("is_archived", false)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (cancelled) return;
      if (growErr) toast.error(growErr.message);
      if (plantsRes.error) {
        toast.error(plantsRes.error.message);
        setPlants([]);
      } else {
        setPlants(
          (plantsRes.data ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            strain: p.strain ?? null,
          })),
        );
      }
      if (growRow) {
        setGrow({ id: growRow.id, name: growRow.name });
        setName(defaultHuntName(growRow.name));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [growId, tentId]);

  const [setupConfirmed, setSetupConfirmed] = useState(false);
  const candidateIds = useMemo(() => Array.from(selected), [selected]);

  const vm = useMemo(
    () =>
      computePhenoHuntOnboardingViewModel({
        name,
        growId: growId ?? null,
        tentId: tentId ?? null,
        notes,
        candidateIds,
        evidenceGoals,
        setupCompleted: setupConfirmed,
      }),
    [name, growId, tentId, notes, candidateIds, evidenceGoals, setupConfirmed],
  );

  const canSave = vm.canCreate && !saving && !!user;

  const toggleCandidate = (id: string) => {
    setSelected((prev) => toggleIdInSet(prev, id));
  };

  const selectionPreflight = useMemo(
    () =>
      buildCandidateSelectionPreflight({
        availablePlantIds: plants.map((p) => p.id),
        selectedIds: selected,
      }),
    [plants, selected],
  );

  const toggleGoal = (id: PhenoEvidenceGoalId) => {
    setEvidenceGoals((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };

  const stepIndex = PHENO_ONBOARDING_STEP_ORDER.indexOf(currentStep);
  const goStep = (delta: number) => {
    const next = PHENO_ONBOARDING_STEP_ORDER[stepIndex + delta];
    if (next) setCurrentStep(next);
  };

  const selectedCandidates = useMemo(
    () => plants.filter((p) => selected.has(p.id)),
    [plants, selected],
  );

  const onSave = async () => {
    if (!canSave || !growId) return;
    if (entitlementLoading) {
      toast.error("Pheno Tracker access is still being checked. Try again in a moment.");
      return;
    }
    if (entitlementLookupFailed) {
      toast.error("We couldn't verify Pheno Tracker access. Retry the plan check and try again.");
      return;
    }
    // Belt-and-suspenders: server-side RESTRICTIVE RLS +
    // has_pheno_tracker_entitlement already enforce this; re-check here so
    // any future direct handler invocation (deep link race, dev tools,
    // cached mount) still cannot reach createPhenoHunt without an active
    // Pro/lifetime entitlement.
    if (!canWriteFeatureData(entitlement, "pheno_tracker")) {
      toast.error(PHENO_TRACKER_PRO_REQUIRED_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      const res = await createPhenoHunt({
        growId,
        tentId: tentId ?? null,
        name: name.trim(),
        plantIds: candidateIds,
        evidenceGoals,
        notes: notes.trim() || null,
        markSetupComplete: setupConfirmed,
      });
      toast.success("Pheno hunt created");
      // Enter the workspace — grower can continue setup from there.
      navigate(`/pheno-hunts/${res.huntId}/workspace`);
    } catch (err) {
      // Server-side RLS denials (e.g. pheno_hunts_pro_required_insert) map to
      // the same friendly copy as the pre-write guard — never raw policy text.
      toast.error(phenoHuntSaveErrorMessage(err));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className="mx-auto flex max-w-4xl items-center justify-center rounded-3xl border border-border/60 bg-card/50 py-20 text-muted-foreground"
        role="status"
        aria-label="Loading pheno hunt setup"
      >
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!growId || !grow) {
    return (
      <div className="mx-auto min-w-0 max-w-4xl">
        <PageHeader
          title="Start Pheno Hunt"
          eyebrow="Cultivar selection"
          description="Create a traceable candidate set and preserve the evidence you record."
          icon={<Sprout className="size-5" />}
          actions={
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link to="/grows">
                <ArrowLeft data-icon="inline-start" />
                Back to My Grows
              </Link>
            </Button>
          }
        />
        <div className="rounded-3xl border border-border/60 bg-card/65 p-6 text-center shadow-card backdrop-blur-xl sm:p-8">
          <h2 className="font-display text-lg font-semibold">Grow not found</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Start a pheno hunt from a grow or tent detail page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-w-0 max-w-4xl space-y-4" data-testid="pheno-hunt-onboarding">
      <PageHeader
        title="Start Pheno Hunt"
        eyebrow="Cultivar selection"
        description={`Guided setup for ${grow.name}${tentId ? " (this tent)" : ""}. You choose the candidates and evidence goals — Verdant preserves what you record.`}
        icon={<Sprout className="size-5" />}
        actions={
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
            <Link to={`/grows/${growId}`}>
              <ArrowLeft data-icon="inline-start" />
              Back to grow
            </Link>
          </Button>
        }
      />

      <PhenoHuntOnboardingStepper
        steps={vm.steps}
        currentStepId={currentStep}
        onStepSelect={setCurrentStep}
      />

      {currentStep === "basics" && (
        <section
          className="space-y-4 rounded-3xl border border-border/60 bg-card/65 p-4 shadow-card backdrop-blur-xl sm:p-5"
          data-testid="pheno-step-basics"
        >
          <h2 className="text-sm font-semibold">Hunt basics</h2>
          <div className="space-y-2">
            <Label htmlFor="ph-name">Hunt name</Label>
            <Input
              id="ph-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="e.g. Summer Pheno Hunt"
              data-testid="ph-name-input"
            />
          </div>
          <div className="space-y-2">
            <Label>Linked grow</Label>
            <div className="text-sm text-muted-foreground">
              {grow.name}
              {tentId ? " (scoped to this tent)" : ""}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ph-notes">Notes (optional)</Label>
            <Textarea
              id="ph-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context for this hunt — pack, cross, or hypothesis."
              data-testid="ph-notes-input"
            />
          </div>
        </section>
      )}

      {currentStep === "candidates" && (
        <section
          className="space-y-4 rounded-3xl border border-border/60 bg-card/65 p-4 shadow-card backdrop-blur-xl sm:p-5"
          data-testid="pheno-step-candidates"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <h2 className="text-sm font-semibold">Candidate plants</h2>
            <span className="text-xs text-muted-foreground" data-testid="pheno-candidate-status">
              {vm.candidateStatusLabel}
            </span>
          </div>
          {plants.length === 0 ? (
            <div
              className="space-y-3 rounded-2xl border border-dashed border-border/80 bg-muted/20 p-6 text-center"
              data-testid="ph-empty"
            >
              <h3 className="text-sm font-semibold">{PHENO_HUNT_EMPTY_CANDIDATES.title}</h3>
              <p className="text-xs text-muted-foreground">{PHENO_HUNT_EMPTY_CANDIDATES.body}</p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button asChild size="sm" data-testid="ph-empty-cta">
                  <Link to={`/plants?growId=${encodeURIComponent(growId)}`}>
                    {PHENO_HUNT_EMPTY_CANDIDATES.ctaPlants}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" data-testid="ph-empty-start-room">
                  <Link to="/start-room">{PHENO_HUNT_EMPTY_CANDIDATES.ctaStartRoom}</Link>
                </Button>
                <Button asChild size="sm" variant="ghost" data-testid="ph-empty-lineage">
                  <Link to="/grow-lineage">{PHENO_HUNT_EMPTY_CANDIDATES.ctaLineage}</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!selectionPreflight.canSelectAll}
                  onClick={() => setSelected(selectAllIds(plants.map((p) => p.id)))}
                  data-testid="ph-select-all"
                >
                  {selectionPreflight.selectAllLabel}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!selectionPreflight.canClear}
                  onClick={() => setSelected(clearSelection())}
                  data-testid="ph-clear-selection"
                >
                  {selectionPreflight.clearLabel}
                </Button>
                <span
                  className="text-xs text-muted-foreground"
                  data-testid="ph-selection-preflight"
                >
                  {selectionPreflight.preflightMessage}
                </span>
              </div>
              {selectionPreflight.comparisonHint ? (
                <p
                  className="text-xs rounded-md border border-primary/30 bg-primary/10 px-3 py-2"
                  data-testid="ph-comparison-hint"
                >
                  {selectionPreflight.comparisonHint}
                </p>
              ) : null}
              <ul className="space-y-2" data-testid="ph-plant-list">
                {plants.map((p) => {
                  const checked = selected.has(p.id);
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/35 p-3 transition-colors hover:bg-secondary/30"
                    >
                      <Checkbox
                        id={`ph-${p.id}`}
                        checked={checked}
                        onCheckedChange={() => toggleCandidate(p.id)}
                        data-testid={`ph-toggle-${p.id}`}
                      />
                      <label htmlFor={`ph-${p.id}`} className="flex-1 min-w-0 cursor-pointer">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.strain ?? "Unknown strain"}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {currentStep === "goals" && (
        <section
          className="space-y-4 rounded-3xl border border-border/60 bg-card/65 p-4 shadow-card backdrop-blur-xl sm:p-5"
          data-testid="pheno-step-goals"
        >
          <h2 className="text-sm font-semibold">Evidence goals</h2>
          <p className="text-xs text-muted-foreground">
            Choose what you plan to track. You decide what matters — Verdant preserves the evidence
            you record.
          </p>
          <PhenoEvidenceGoalsSelector selected={evidenceGoals} onToggle={toggleGoal} />
        </section>
      )}

      {currentStep === "packet_preview" && (
        <section
          className="space-y-4 rounded-3xl border border-border/60 bg-card/65 p-4 shadow-card backdrop-blur-xl sm:p-5"
          data-testid="pheno-step-packet-preview"
        >
          <h2 className="text-sm font-semibold">First Evidence Packet Map</h2>
          <p className="text-xs text-muted-foreground">
            Preview of the packet shape for your candidates. Every cell starts at{" "}
            <span className="font-medium">Not recorded</span> — you fill them in from the workspace.
          </p>
          <PhenoFirstEvidencePacketMapPreview vm={vm} candidates={selectedCandidates} />
        </section>
      )}

      {currentStep === "checklist" && (
        <section
          className="space-y-4 rounded-3xl border border-border/60 bg-card/65 p-4 shadow-card backdrop-blur-xl sm:p-5"
          data-testid="pheno-step-checklist"
        >
          <h2 className="text-sm font-semibold">Comparison-ready checklist</h2>
          <PhenoComparisonReadyChecklist vm={vm} />
          {vm.blockingReasons.length > 0 ? (
            <ul
              className="mt-3 space-y-1 text-xs text-muted-foreground"
              data-testid="pheno-blocking-reasons"
            >
              {vm.blockingReasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      {currentStep === "confirmation" && (
        <section
          className="space-y-4 rounded-3xl border border-border/60 bg-card/65 p-4 shadow-card backdrop-blur-xl sm:p-5"
          data-testid="pheno-step-confirmation"
        >
          <h2 className="text-sm font-semibold">Setup complete</h2>
          <p className="text-sm text-muted-foreground">
            You choose the candidates and evidence goals — Verdant preserves what you record.
            Confirm to enter your hunt workspace. You can update evidence goals from the workspace
            at any time.
          </p>
          <ul
            className="text-xs text-muted-foreground space-y-1"
            data-testid="pheno-confirmation-summary"
          >
            <li>• Candidates selected: {candidateIds.length}</li>
            <li>• Evidence goals selected: {evidenceGoals.length}</li>
            <li>• Readiness: {vm.readinessLabel}</li>
          </ul>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              id="pheno-setup-confirm"
              checked={setupConfirmed}
              onCheckedChange={(v) => setSetupConfirmed(v === true)}
              data-testid="pheno-setup-confirm-toggle"
            />
            <span>I've reviewed setup and I'm ready to start the hunt.</span>
          </label>
          {vm.blockingReasons.length > 0 ? (
            <ul
              className="mt-3 space-y-1 text-xs text-muted-foreground"
              data-testid="pheno-confirmation-blocking"
            >
              {vm.blockingReasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          ) : null}
          <p
            className="text-xs text-muted-foreground"
            data-testid="pheno-confirmation-selection-preflight"
          >
            {selectionPreflight.preflightMessage}
          </p>
        </section>
      )}

      <div className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card/65 p-3 shadow-card backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2 sm:flex-none">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => goStep(-1)}
            disabled={stepIndex === 0}
            data-testid="pheno-step-prev"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => goStep(1)}
            disabled={stepIndex === PHENO_ONBOARDING_STEP_ORDER.length - 1}
            data-testid="pheno-step-next"
          >
            Next <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="ghost" asChild className="w-full sm:w-auto">
            <Link to={`/grows/${growId}`}>Cancel</Link>
          </Button>
          <Button
            onClick={onSave}
            disabled={!canSave}
            className="w-full gradient-leaf text-primary-foreground sm:w-auto"
            data-testid="ph-save-btn"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Create Pheno Hunt"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
