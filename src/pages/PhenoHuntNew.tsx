import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Sprout } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useAuth } from "@/store/auth";
import {
  createPhenoHunt,
  defaultHuntName,
} from "@/lib/phenoHuntService";

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
  const { entitlement } = useMyEntitlements();
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
  const [evidenceGoals, setEvidenceGoals] = useState<PhenoEvidenceGoalId[]>(
    () => defaultEvidenceGoalSelection(),
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
      const [{ data: growRow }, { data: plantRows }] = await Promise.all([
        supabase.from("grows").select("id,name").eq("id", growId).maybeSingle(),
        (() => {
          let q = supabase
            .from("plants")
            .select("id,name,strain,tent_id")
            .eq("grow_id", growId)
            .eq("is_archived", false);
          if (tentId) q = q.eq("tent_id", tentId);
          return q;
        })(),
      ]);
      if (cancelled) return;
      if (growRow) {
        setGrow({ id: growRow.id, name: growRow.name });
        setName(defaultHuntName(growRow.name));
      }
      setPlants(
        (plantRows ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          strain: p.strain ?? null,
        })),
      );
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
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGoal = (id: PhenoEvidenceGoalId) => {
    setEvidenceGoals((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
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
    // Belt-and-suspenders: server-side RESTRICTIVE RLS +
    // has_pheno_tracker_entitlement already enforce this; re-check here so
    // any future direct handler invocation (deep link race, dev tools,
    // cached mount) still cannot reach createPhenoHunt without an active
    // Pro/lifetime entitlement.
    if (!canWriteFeatureData(entitlement, "pheno_tracker")) {
      toast.error("Pheno Tracker is a Pro feature. Upgrade to Pro to start a hunt.");
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
      toast.error(err instanceof Error ? err.message : "Could not create pheno hunt");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!growId || !grow) {
    return (
      <div className="max-w-xl mx-auto p-4">
        <BackLink to="/grows" />
        <div className="glass rounded-2xl p-6 text-center">
          <h1 className="text-lg font-semibold mb-2">Grow not found</h1>
          <p className="text-sm text-muted-foreground">
            Start a pheno hunt from a grow or tent detail page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4" data-testid="pheno-hunt-onboarding">
      <BackLink to={`/grows/${growId}`} />

      <header className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Sprout className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-display font-bold">Start Pheno Hunt</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Guided setup for <span className="font-medium">{grow.name}</span>
          {tentId ? " (this tent)" : ""}. You choose the candidates and evidence goals —
          Verdant preserves what you record.
        </p>
      </header>

      <PhenoHuntOnboardingStepper
        steps={vm.steps}
        currentStepId={currentStep}
        onStepSelect={setCurrentStep}
      />

      {currentStep === "basics" && (
        <section
          className="glass rounded-2xl p-4 space-y-3"
          data-testid="pheno-step-basics"
        >
          <h2 className="text-sm font-semibold">Hunt basics</h2>
          <div className="space-y-2">
            <Label htmlFor="ph-name">Hunt name</Label>
            <Input
              id="ph-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
          className="glass rounded-2xl p-4 space-y-3"
          data-testid="pheno-step-candidates"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Candidate plants</h2>
            <span
              className="text-xs text-muted-foreground"
              data-testid="pheno-candidate-status"
            >
              {vm.candidateStatusLabel}
            </span>
          </div>
          {plants.length === 0 ? (
            <div
              className="rounded-lg border border-dashed p-6 text-center space-y-3"
              data-testid="ph-empty"
            >
              <h3 className="text-sm font-semibold">
                No plants in this grow yet
              </h3>
              <p className="text-xs text-muted-foreground">
                Add a plant before starting a Pheno Hunt. Candidates are
                tagged plants, not separate records.
              </p>
              <Button asChild size="sm" data-testid="ph-empty-cta">
                <Link to={`/grows/${growId}`}>Go to grow to add a plant</Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-1.5" data-testid="ph-plant-list">
              {plants.map((p) => {
                const checked = selected.has(p.id);
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-md border p-2"
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
          )}
        </section>
      )}

      {currentStep === "goals" && (
        <section
          className="glass rounded-2xl p-4 space-y-3"
          data-testid="pheno-step-goals"
        >
          <h2 className="text-sm font-semibold">Evidence goals</h2>
          <p className="text-xs text-muted-foreground">
            Choose what you plan to track. You decide what matters — Verdant
            preserves the evidence you record.
          </p>
          <PhenoEvidenceGoalsSelector
            selected={evidenceGoals}
            onToggle={toggleGoal}
          />
        </section>
      )}

      {currentStep === "packet_preview" && (
        <section
          className="glass rounded-2xl p-4 space-y-3"
          data-testid="pheno-step-packet-preview"
        >
          <h2 className="text-sm font-semibold">First Evidence Packet Map</h2>
          <p className="text-xs text-muted-foreground">
            Preview of the packet shape for your candidates. Every cell starts
            at <span className="font-medium">Not recorded</span> — you fill them
            in from the workspace.
          </p>
          <PhenoFirstEvidencePacketMapPreview
            vm={vm}
            candidates={selectedCandidates}
          />
        </section>
      )}

      {currentStep === "checklist" && (
        <section
          className="glass rounded-2xl p-4 space-y-3"
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goStep(-1)}
            disabled={stepIndex === 0}
            data-testid="pheno-step-prev"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goStep(1)}
            disabled={stepIndex === PHENO_ONBOARDING_STEP_ORDER.length - 1}
            data-testid="pheno-step-next"
          >
            Next <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link to={`/grows/${growId}`}>Cancel</Link>
          </Button>
          <Button
            onClick={onSave}
            disabled={!canSave}
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

function BackLink({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </Link>
  );
}
