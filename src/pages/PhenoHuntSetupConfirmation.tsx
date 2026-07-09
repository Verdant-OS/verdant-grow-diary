/**
 * PhenoHuntSetupConfirmation — review-and-confirm step of guided hunt setup,
 * and the "continue setup" landing for hunts left unconfirmed.
 *
 * Route-gated by PhenoTrackerUpgradeGate (no read-only mode: this is a write
 * surface). Belt-and-suspenders: every write handler re-checks
 * canWriteFeatureData, and the database RESTRICTIVE
 * has_pheno_tracker_entitlement policies reject Free/canceled/expired writes
 * regardless of what the client renders.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  confirmPhenoHuntSetup,
  loadPhenoHuntSetup,
  updatePhenoHuntGoal,
  type PhenoHuntSetupState,
} from "@/lib/phenoHuntService";
import {
  HUNT_READINESS_COPY,
  HUNT_READINESS_ORDER,
  PHENO_GOAL_MAX_LENGTH,
} from "@/lib/phenoHuntOnboardingViewModel";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { canWriteFeatureData } from "@/lib/featureEntitlements";

export default function PhenoHuntSetupConfirmation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { entitlement } = useMyEntitlements();

  const [state, setState] = useState<PhenoHuntSetupState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) {
        setLoadError("Missing hunt id.");
        setLoading(false);
        return;
      }
      try {
        const loaded = await loadPhenoHuntSetup(id);
        if (cancelled) return;
        setState(loaded);
        setGoal(loaded.goal ?? "");
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Could not load hunt setup.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const canWrite = canWriteFeatureData(entitlement, "pheno_tracker");
  const trimmedGoal = goal.trim();
  const goalValid =
    trimmedGoal.length > 0 && trimmedGoal.length <= PHENO_GOAL_MAX_LENGTH;
  const goalDirty = trimmedGoal !== (state?.goal ?? "");
  const confirmed = !!state?.setupConfirmedAt;
  const canConfirm =
    !!state &&
    !confirmed &&
    canWrite &&
    goalValid &&
    !goalDirty &&
    state.candidates.length > 0 &&
    !confirming;

  const confirmBlockedReason = useMemo(() => {
    if (!state || confirmed) return null;
    if (!canWrite) {
      return "Confirming setup requires an active Pro or Founder Lifetime plan.";
    }
    if (!goalValid) return "Add a hunt goal before confirming.";
    if (goalDirty) return "Save your goal changes before confirming.";
    if (state.candidates.length === 0) {
      return "Tag at least one candidate plant before confirming.";
    }
    return null;
  }, [state, confirmed, canWrite, goalValid, goalDirty]);

  const onSaveGoal = async () => {
    if (!state || !canWrite || !goalValid || savingGoal) return;
    setSavingGoal(true);
    try {
      const saved = await updatePhenoHuntGoal({ huntId: state.huntId, goal: trimmedGoal });
      setState({ ...state, goal: saved.goal });
      setGoal(saved.goal);
      toast.success("Hunt goal saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save hunt goal");
    } finally {
      setSavingGoal(false);
    }
  };

  const onConfirm = async () => {
    if (!state || !canConfirm) return;
    if (!canWriteFeatureData(entitlement, "pheno_tracker")) {
      toast.error("Pheno Tracker is a Pro feature. Upgrade to Pro to confirm setup.");
      return;
    }
    setConfirming(true);
    try {
      const res = await confirmPhenoHuntSetup({ huntId: state.huntId });
      setState({ ...state, setupConfirmedAt: res.setupConfirmedAt });
      toast.success("Hunt setup confirmed — ready for tracking");
      navigate(`/pheno-hunts/${state.huntId}/workspace`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not confirm hunt setup");
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div
        data-testid="pheno-setup-loading"
        className="flex items-center justify-center py-20 text-muted-foreground"
      >
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (loadError || !state) {
    return (
      <div className="max-w-xl mx-auto p-4">
        <div data-testid="pheno-setup-error" className="glass rounded-2xl p-6 text-center">
          <h1 className="text-lg font-semibold mb-2">Hunt not found</h1>
          <p className="text-sm text-muted-foreground">
            {loadError ?? "Could not load hunt setup."}
          </p>
          <Button asChild variant="ghost" size="sm" className="mt-3">
            <Link to="/grows">Back to grows</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="pheno-setup-page" className="max-w-2xl mx-auto p-4 space-y-4">
      <Link
        to={state.growId ? `/grows/${state.growId}` : "/grows"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <header className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Sprout className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-display font-bold">Confirm hunt setup</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Review <span className="font-medium">{state.name}</span> before you
          start tracking. Setup is saved — you can leave and continue later.
        </p>
      </header>

      <section className="glass rounded-2xl p-4 space-y-3">
        <div className="space-y-2">
          <Label htmlFor="ph-setup-goal">Hunt goal</Label>
          <Textarea
            id="ph-setup-goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            maxLength={PHENO_GOAL_MAX_LENGTH}
            rows={3}
            disabled={!canWrite}
            data-testid="pheno-setup-goal-input"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Shown in the workspace Evidence Packet Map.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={onSaveGoal}
              disabled={!canWrite || !goalValid || !goalDirty || savingGoal}
              data-testid="pheno-setup-save-goal"
            >
              {savingGoal ? "Saving…" : "Save goal"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Candidates ({state.candidates.length})</Label>
          {state.candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="pheno-setup-no-candidates">
              No candidate plants are tagged for this hunt yet. Tag plants from
              the grow page, then confirm setup here.
            </p>
          ) : (
            <ul className="space-y-1.5" data-testid="pheno-setup-candidates">
              {state.candidates.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <span className="font-medium">{c.candidateLabel ?? "—"}</span>
                  <span className="text-muted-foreground truncate">{c.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="glass rounded-2xl p-4 space-y-2">
        <h2 className="text-sm font-semibold">What each stage means</h2>
        <ol className="space-y-1.5">
          {HUNT_READINESS_ORDER.filter((s) => s !== "setup_incomplete").map((stage) => (
            <li key={stage} className="text-sm">
              <span className="font-medium">{HUNT_READINESS_COPY[stage].label}:</span>{" "}
              <span className="text-muted-foreground">
                {HUNT_READINESS_COPY[stage].description}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          Confirming setup does not make this hunt comparison-ready — only
          recorded evidence on at least two candidates does.
        </p>
      </section>

      {confirmed ? (
        <section
          data-testid="pheno-setup-confirmed"
          className="glass rounded-2xl p-4 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            <span>
              Setup confirmed{" "}
              <span className="text-muted-foreground">
                {new Date(state.setupConfirmedAt!).toLocaleDateString()}
              </span>
            </span>
          </div>
          <Button asChild data-testid="pheno-setup-open-workspace">
            <Link to={`/pheno-hunts/${state.huntId}/workspace`}>Open workspace</Link>
          </Button>
        </section>
      ) : (
        <section className="glass rounded-2xl p-4 space-y-2">
          {confirmBlockedReason ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="pheno-setup-confirm-blocked"
            >
              {confirmBlockedReason}
            </p>
          ) : null}
          <div className="flex items-center justify-end">
            <Button
              onClick={onConfirm}
              disabled={!canConfirm}
              data-testid="pheno-setup-confirm-btn"
            >
              {confirming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Confirming…
                </>
              ) : (
                "Confirm setup"
              )}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
