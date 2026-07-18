/**
 * PhenoBreedingObjectiveEditor — thin presenter for defining a hunt's
 * breeding-objective brief: target trait axes with acceptance thresholds.
 *
 * All validation and comparison logic lives in phenoBreedingObjectiveRules;
 * this component only collects the grower's picks and calls onSave. It
 * never writes to Supabase directly — the caller owns persistence.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { LOUD_TRAIT_AXES } from "@/lib/phenoExpressionRules";
import {
  availableObjectiveAxes,
  BREEDING_OBJECTIVE_CAVEAT,
  BREEDING_OBJECTIVE_EMPTY_COPY,
  type BreedingObjectiveComparator,
  type BreedingObjectiveTarget,
} from "@/lib/phenoBreedingObjectiveRules";

const COMPARATOR_LABEL: Record<BreedingObjectiveComparator, string> = {
  gte: "at least",
  lte: "at most",
};

export interface PhenoBreedingObjectiveEditorProps {
  targets: readonly BreedingObjectiveTarget[];
  onSave: (targets: readonly BreedingObjectiveTarget[]) => Promise<boolean>;
  saving: boolean;
}

export default function PhenoBreedingObjectiveEditor({
  targets,
  onSave,
  saving,
}: PhenoBreedingObjectiveEditorProps) {
  const [draft, setDraft] = useState<BreedingObjectiveTarget[]>(() => [...targets]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The hunt (and its saved targets) can still be loading when this mounts,
  // or another tab/save can move the saved value. Adopt the saved value
  // whenever the grower has no unsaved edits in progress; never clobber a
  // dirty draft out from under them.
  useEffect(() => {
    if (dirty) return;
    setDraft((prev) =>
      prev.length === targets.length &&
      prev.every(
        (t, i) =>
          t.axisKey === targets[i]?.axisKey &&
          t.comparator === targets[i]?.comparator &&
          t.threshold === targets[i]?.threshold,
      )
        ? prev
        : [...targets],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets]);

  const available = availableObjectiveAxes(draft);
  const [pendingAxisKey, setPendingAxisKey] = useState<string>(available[0]?.key ?? "");
  const [pendingComparator, setPendingComparator] = useState<BreedingObjectiveComparator>("gte");
  const [pendingThreshold, setPendingThreshold] = useState<string>("");

  // Async saved targets and local removals both change the available-axis
  // list. Keep the controlled select on a real option so Add target can never
  // submit a stale, already-used axis (or an empty key after all axes had
  // previously been used).
  const firstAvailableAxisKey = available[0]?.key ?? "";
  const pendingAxisIsAvailable = available.some((axis) => axis.key === pendingAxisKey);
  useEffect(() => {
    if (!pendingAxisIsAvailable) {
      setPendingAxisKey(firstAvailableAxisKey);
      setPendingThreshold("");
      setError(null);
    }
  }, [firstAvailableAxisKey, pendingAxisIsAvailable]);

  function syncFromSaved(next: readonly BreedingObjectiveTarget[]) {
    setDraft([...next]);
    setDirty(false);
  }

  function addTarget() {
    const axis = LOUD_TRAIT_AXES.find((a) => a.key === pendingAxisKey);
    if (!axis) return;
    const n = Number(pendingThreshold);
    if (!Number.isFinite(n) || n < axis.min || n > axis.max) {
      setError(`Threshold must be between ${axis.min} and ${axis.max} for ${axis.label}.`);
      return;
    }
    setError(null);
    setDraft((prev) => [
      ...prev,
      { axisKey: axis.key, comparator: pendingComparator, threshold: n },
    ]);
    setDirty(true);
    setPendingThreshold("");
    const stillAvailable = availableObjectiveAxes([
      ...draft,
      { axisKey: axis.key, comparator: pendingComparator, threshold: n },
    ]);
    setPendingAxisKey(stillAvailable[0]?.key ?? "");
  }

  function removeTarget(axisKey: string) {
    setDraft((prev) => prev.filter((t) => t.axisKey !== axisKey));
    setDirty(true);
    setError(null);
  }

  async function handleSave() {
    setError(null);
    const ok = await onSave(draft);
    if (ok) setDirty(false);
    else setError("Could not save your breeding objective. You can try again.");
  }

  return (
    <section
      className="glass rounded-2xl p-4 space-y-3"
      data-testid="pheno-breeding-objective-editor"
      aria-label="Breeding objective"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Breeding objective
        </h2>
        {dirty && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline"
            onClick={() => syncFromSaved(targets)}
            data-testid="pheno-breeding-objective-reset"
          >
            Reset
          </button>
        )}
      </div>

      {draft.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="pheno-breeding-objective-empty">
          {BREEDING_OBJECTIVE_EMPTY_COPY}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {draft.map((t) => {
            const axis = LOUD_TRAIT_AXES.find((a) => a.key === t.axisKey);
            return (
              <li
                key={t.axisKey}
                className="flex items-center justify-between gap-2 text-sm rounded-lg border border-border/50 bg-secondary/30 px-3 py-1.5"
                data-testid={`pheno-breeding-objective-target-${t.axisKey}`}
              >
                <span>
                  {axis?.label ?? t.axisKey} {COMPARATOR_LABEL[t.comparator]} {t.threshold}
                </span>
                <button
                  type="button"
                  onClick={() => removeTarget(t.axisKey)}
                  aria-label={`Remove ${axis?.label ?? t.axisKey} target`}
                  data-testid={`pheno-breeding-objective-remove-${t.axisKey}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {available.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pendingAxisKey}
            onChange={(e) => setPendingAxisKey(e.target.value)}
            aria-label="Trait axis"
            data-testid="pheno-breeding-objective-axis-select"
            className="rounded-md border border-border/50 bg-background/60 px-2 py-1 text-sm"
          >
            {available.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label} ({a.min}–{a.max})
              </option>
            ))}
          </select>
          <select
            value={pendingComparator}
            onChange={(e) => setPendingComparator(e.target.value as BreedingObjectiveComparator)}
            aria-label="Comparator"
            data-testid="pheno-breeding-objective-comparator-select"
            className="rounded-md border border-border/50 bg-background/60 px-2 py-1 text-sm"
          >
            <option value="gte">at least</option>
            <option value="lte">at most</option>
          </select>
          <input
            type="number"
            value={pendingThreshold}
            onChange={(e) => setPendingThreshold(e.target.value)}
            aria-label="Threshold"
            data-testid="pheno-breeding-objective-threshold-input"
            className="w-20 rounded-md border border-border/50 bg-background/60 px-2 py-1 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addTarget}
            disabled={pendingThreshold.trim() === ""}
            data-testid="pheno-breeding-objective-add-target"
          >
            Add target
          </Button>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive" data-testid="pheno-breeding-objective-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={saving || !dirty}
          data-testid="pheno-breeding-objective-save"
        >
          {saving ? "Saving…" : "Save objective"}
        </Button>
        {dirty && !saving && (
          <span className="text-[11px] text-muted-foreground">Unsaved changes</span>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">{BREEDING_OBJECTIVE_CAVEAT}</p>
    </section>
  );
}
