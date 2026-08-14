/**
 * PhenoGrowOutHandoff — presenter for the keeper → next-grow handoff.
 *
 * Shows the grow-outs Verdant can carry into this keeper's stability ledger:
 * clones the grower linked to a real plant, pre-filled with the traits they
 * already recorded on that plant. Each proposal is added ONLY when the grower
 * clicks Add — this component never persists, and the caller owns the write.
 *
 * It proposes; it never ranks, and it never claims a phenotype is stable.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  GROW_OUT_HANDOFF_CAVEAT,
  GROW_OUT_HANDOFF_EMPTY_COPY,
  type GrowOutSuggestion,
} from "@/lib/phenoGrowOutHandoffRules";
import type { StabilityRun } from "@/lib/phenoStabilityRunRules";

export interface PhenoGrowOutHandoffProps {
  keeperId: string;
  suggestions: readonly GrowOutSuggestion[];
  /** Add one proposed run to the ledger. Returns false on failure. */
  onAccept: (run: StabilityRun) => Promise<boolean>;
  saving: boolean;
}

export default function PhenoGrowOutHandoff({
  keeperId,
  suggestions,
  onAccept,
  saving,
}: PhenoGrowOutHandoffProps) {
  const [error, setError] = useState<string | null>(null);

  // Nothing linked yet → stay out of the way entirely rather than showing an
  // empty shell on every keeper card.
  if (suggestions.length === 0) return null;

  async function accept(s: GrowOutSuggestion) {
    setError(null);
    const ok = await onAccept(s.proposedRun);
    if (!ok) setError("Could not add that grow-out. You can try again.");
  }

  return (
    <section
      data-testid={`pheno-grow-out-handoff-${keeperId}`}
      className="space-y-2 rounded-md border border-border/60 bg-secondary/20 p-3"
      aria-label="Grow-outs ready to add"
    >
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Grow-outs ready to add
      </h4>

      <ul className="space-y-1.5" data-testid={`pheno-grow-out-list-${keeperId}`}>
        {suggestions.map((s) => (
          <li
            key={s.cloneId}
            data-testid={`pheno-grow-out-suggestion-${s.cloneId}`}
            className="flex items-start justify-between gap-2 rounded border border-border/50 bg-background/40 px-2 py-1.5 text-[11px]"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">{s.proposedRun.runLabel}</p>
              <p className="text-muted-foreground">{s.detail}</p>
              {!s.hasRecordedTraits && (
                <span
                  data-testid={`pheno-grow-out-no-traits-${s.cloneId}`}
                  className="mt-0.5 inline-block rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                >
                  No traits recorded
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => accept(s)}
              data-testid={`pheno-grow-out-accept-${s.cloneId}`}
              className="shrink-0"
            >
              {saving ? "Adding…" : "Add"}
            </Button>
          </li>
        ))}
      </ul>

      {error && (
        <p
          className="text-[11px] text-destructive"
          data-testid={`pheno-grow-out-error-${keeperId}`}
        >
          {error}
        </p>
      )}

      <p className="text-[10px] text-muted-foreground">{GROW_OUT_HANDOFF_CAVEAT}</p>
    </section>
  );
}

/** Exported for the caller's empty-state copy (kept in one place). */
export { GROW_OUT_HANDOFF_EMPTY_COPY };
