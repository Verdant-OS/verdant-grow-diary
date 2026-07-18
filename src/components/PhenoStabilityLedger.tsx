/**
 * PhenoStabilityLedger — thin presenter for a keeper's "stability run" ledger:
 * each grow-out of the keeper's clone with the traits the grower observed that
 * run, and a read-out of whether those traits HELD relative to the first
 * recorded run (the baseline).
 *
 * All evaluation lives in phenoStabilityRunRules; this component only collects
 * the grower's recorded runs and calls onSave with the whole set (the service
 * replaces the ledger atomically). It never persists directly, never ranks
 * this keeper against another, and never claims future stability — the
 * strongest thing it shows is "held across N grow-outs".
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { LOUD_TRAIT_AXES } from "@/lib/phenoExpressionRules";
import {
  evaluateStability,
  stabilityVerdictCopy,
  MAX_STABILITY_RUNS,
  STABILITY_VERDICT_LABELS,
  STABILITY_LEDGER_CAVEAT,
  STABILITY_LEDGER_EMPTY_COPY,
  type StabilityRun,
} from "@/lib/phenoStabilityRunRules";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface PhenoStabilityLedgerProps {
  keeperId: string;
  runs: readonly StabilityRun[];
  onSave: (runs: readonly StabilityRun[]) => Promise<boolean>;
  saving: boolean;
}

/** Verdict → a muted/positive/warning tone for the badge (never a rank). */
const VERDICT_TONE: Record<string, string> = {
  no_runs: "bg-secondary text-muted-foreground",
  unconfirmed: "bg-secondary text-muted-foreground",
  holding: "bg-emerald-500/15 text-emerald-700",
  drifting: "bg-amber-500/15 text-amber-700",
};

export default function PhenoStabilityLedger({
  keeperId,
  runs,
  onSave,
  saving,
}: PhenoStabilityLedgerProps) {
  const [runLabel, setRunLabel] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [note, setNote] = useState("");
  // Per-axis raw input strings; "" means the grower did not score that axis
  // this run (omitted, never guessed).
  const [traitInputs, setTraitInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const evaluation = evaluateStability(runs);
  const atCap = runs.length >= MAX_STABILITY_RUNS;

  function resetForm() {
    setRunLabel("");
    setObservedAt("");
    setNote("");
    setTraitInputs({});
  }

  async function addRun() {
    const label = runLabel.trim();
    if (!label) {
      setError("Give this grow-out a label so you can tell your runs apart.");
      return;
    }
    const traits: Record<string, number> = {};
    for (const axis of LOUD_TRAIT_AXES) {
      const raw = (traitInputs[axis.key] ?? "").trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < axis.min || n > axis.max) {
        setError(`${axis.label} must be between ${axis.min} and ${axis.max}.`);
        return;
      }
      traits[axis.key] = n;
    }
    const date = observedAt.trim();
    const nextRun: StabilityRun = {
      runLabel: label,
      observedAt: ISO_DATE_RE.test(date) ? date : null,
      traits,
      note: note.trim() === "" ? null : note.trim(),
    };
    setError(null);
    const ok = await onSave([...runs, nextRun]);
    if (ok) resetForm();
    else setError("Could not save this grow-out. You can try again.");
  }

  async function removeRun(index: number) {
    setError(null);
    const ok = await onSave(runs.filter((_, i) => i !== index));
    if (!ok) setError("Could not remove this grow-out. You can try again.");
  }

  return (
    <section
      data-testid={`pheno-stability-ledger-${keeperId}`}
      className="space-y-2 rounded-md border border-border/60 bg-secondary/20 p-3"
      aria-label="Stability ledger"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Stability ledger
        </h4>
        <span
          data-testid={`pheno-stability-verdict-badge-${keeperId}`}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            VERDICT_TONE[evaluation.verdict] ?? "bg-secondary text-muted-foreground"
          }`}
        >
          {STABILITY_VERDICT_LABELS[evaluation.verdict]}
        </span>
      </div>

      <p
        data-testid={`pheno-stability-verdict-${keeperId}`}
        className="text-[11px] text-muted-foreground"
      >
        {stabilityVerdictCopy(evaluation)}
      </p>

      {/* Per-axis hold/drift read-out — only axes with a baseline AND a later
          re-score appear (the rules exclude the rest). Never a rank. */}
      {evaluation.axisTrends.length > 0 && (
        <ul
          data-testid={`pheno-stability-axes-${keeperId}`}
          className="space-y-0.5 text-[11px]"
        >
          {evaluation.axisTrends.map((t) => (
            <li
              key={t.axisKey}
              data-testid={`pheno-stability-axis-${keeperId}-${t.axisKey}`}
              className="flex items-center justify-between gap-2"
            >
              <span>
                {t.axisLabel}: {t.baseline} → {t.laterValues.map((v) => (v === null ? "—" : v)).join(", ")}
              </span>
              <span
                className={`rounded px-1 py-0.5 text-[10px] font-medium ${
                  t.held ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"
                }`}
              >
                {t.held ? "held" : `drifted ±${t.maxDrift}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Recorded runs, in order; the first is the baseline. */}
      {runs.length === 0 ? (
        <p
          data-testid={`pheno-stability-empty-${keeperId}`}
          className="text-[11px] text-muted-foreground"
        >
          {STABILITY_LEDGER_EMPTY_COPY}
        </p>
      ) : (
        <ul data-testid={`pheno-stability-runs-${keeperId}`} className="space-y-1">
          {runs.map((r, i) => {
            const scored = LOUD_TRAIT_AXES.filter((a) => typeof r.traits[a.key] === "number");
            return (
              <li
                key={`${r.runLabel}-${i}`}
                data-testid={`pheno-stability-run-${keeperId}-${i}`}
                className="flex items-start justify-between gap-2 rounded border border-border/50 bg-background/40 px-2 py-1 text-[11px]"
              >
                <div className="min-w-0">
                  <span className="font-medium">
                    {i === 0 ? "Baseline · " : ""}
                    {r.runLabel}
                  </span>
                  {r.observedAt && <span className="text-muted-foreground"> · {r.observedAt}</span>}
                  {scored.length > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {scored.map((a) => `${a.label} ${r.traits[a.key]}`).join(", ")}
                    </span>
                  )}
                  {r.note && <span className="block text-muted-foreground">{r.note}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => removeRun(i)}
                  disabled={saving}
                  aria-label={`Remove grow-out ${r.runLabel}`}
                  data-testid={`pheno-stability-run-remove-${keeperId}-${i}`}
                  className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add-a-grow-out form (hidden at the cap). */}
      {atCap ? (
        <p
          data-testid={`pheno-stability-cap-${keeperId}`}
          className="text-[11px] text-muted-foreground"
        >
          You've recorded the maximum of {MAX_STABILITY_RUNS} grow-outs for this keeper.
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="text"
              value={runLabel}
              onChange={(e) => setRunLabel(e.target.value)}
              placeholder={runs.length === 0 ? "Baseline run label" : "Grow-out label"}
              aria-label="Grow-out label"
              data-testid={`pheno-stability-label-${keeperId}`}
              className="rounded border border-border bg-background px-2 py-1 text-[11px]"
            />
            <input
              type="date"
              value={observedAt}
              onChange={(e) => setObservedAt(e.target.value)}
              aria-label="Grow-out date"
              data-testid={`pheno-stability-date-${keeperId}`}
              className="rounded border border-border bg-background px-2 py-1 text-[11px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {LOUD_TRAIT_AXES.map((axis) => (
              <label key={axis.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="min-w-0 flex-1 truncate" title={axis.label}>
                  {axis.label}
                </span>
                <input
                  type="number"
                  min={axis.min}
                  max={axis.max}
                  value={traitInputs[axis.key] ?? ""}
                  onChange={(e) =>
                    setTraitInputs((prev) => ({ ...prev, [axis.key]: e.target.value }))
                  }
                  aria-label={`${axis.label} (${axis.min}–${axis.max})`}
                  data-testid={`pheno-stability-trait-${keeperId}-${axis.key}`}
                  className="w-12 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                />
              </label>
            ))}
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            aria-label="Grow-out note"
            data-testid={`pheno-stability-note-${keeperId}`}
            className="w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRun}
            disabled={saving || runLabel.trim() === ""}
            data-testid={`pheno-stability-add-${keeperId}`}
          >
            {saving ? "Saving…" : runs.length === 0 ? "Record baseline run" : "Record grow-out"}
          </Button>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-destructive" data-testid={`pheno-stability-error-${keeperId}`}>
          {error}
        </p>
      )}

      <p className="text-[10px] text-muted-foreground">{STABILITY_LEDGER_CAVEAT}</p>
    </section>
  );
}
