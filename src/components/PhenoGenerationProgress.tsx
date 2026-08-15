/**
 * PhenoGenerationProgress — read-only view of how each generation of a line
 * landed against the objective the grower set for it.
 *
 * Per generation, per axis: how many candidates were scored and how many met
 * the bar. Counts only — this never orders candidates, never names one, and
 * never claims a shift proves the line improved.
 */
import {
  GENERATION_PROGRESS_CAVEAT,
  GENERATION_PROGRESS_EMPTY_COPY,
  type AxisTrendDirection,
  type GenerationProgressModel,
} from "@/lib/phenoObjectiveGenerationRules";

export interface PhenoGenerationProgressProps {
  model: GenerationProgressModel;
}

/** Direction → a neutral tone. A visual cue about a count, not a verdict. */
const TREND_TONE: Record<AxisTrendDirection, string> = {
  larger_share: "bg-emerald-500/15 text-emerald-700",
  smaller_share: "bg-amber-500/15 text-amber-700",
  unchanged: "bg-secondary text-muted-foreground",
  not_comparable: "bg-secondary text-muted-foreground",
};

const TREND_LABEL: Record<AxisTrendDirection, string> = {
  larger_share: "Larger share met",
  smaller_share: "Smaller share met",
  unchanged: "Unchanged",
  not_comparable: "Not comparable",
};

function sharePct(share: number | null): string {
  return share === null ? "—" : `${Math.round(share * 100)}%`;
}

export default function PhenoGenerationProgress({ model }: PhenoGenerationProgressProps) {
  if (!model || model.generations.length === 0) return null;

  return (
    <section
      className="glass rounded-2xl p-4 space-y-3"
      data-testid="pheno-generation-progress"
      aria-label="Objective progress across generations"
    >
      <div className="space-y-1">
        <h2 className="font-display text-lg font-semibold">Across generations</h2>
        <p className="text-xs text-muted-foreground">
          How each generation landed against the objective you set for it.
        </p>
      </div>

      {model.generations.length < 2 ? (
        <p className="text-sm text-muted-foreground" data-testid="pheno-generation-progress-single">
          {GENERATION_PROGRESS_EMPTY_COPY}
        </p>
      ) : (
        <>
          {/* Per-generation counts, oldest first. */}
          <ol className="space-y-1.5" data-testid="pheno-generation-list">
            {model.generations.map((g) => (
              <li
                key={g.huntId}
                data-testid={`pheno-generation-${g.huntId}`}
                className="rounded-lg border border-border/50 bg-secondary/30 px-3 py-2 text-sm"
              >
                <p className="font-medium truncate">
                  {g.generationLabel ? `${g.generationLabel} · ` : ""}
                  {g.huntName}
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · {g.candidateCount} {g.candidateCount === 1 ? "candidate" : "candidates"}
                  </span>
                </p>
                {g.axes.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    No objective set on this hunt.
                  </p>
                ) : (
                  <ul className="mt-0.5 space-y-0.5 text-[11px] text-muted-foreground">
                    {g.axes.map((a) => (
                      <li
                        key={a.axisKey}
                        data-testid={`pheno-generation-axis-${g.huntId}-${a.axisKey}`}
                      >
                        {a.axisLabel} {a.comparator === "gte" ? "≥" : "≤"} {a.threshold}:{" "}
                        {a.scoredCount === 0
                          ? "not yet scored"
                          : `${a.metCount} of ${a.scoredCount} scored met it (${sharePct(a.metShare)})`}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>

          {/* Earliest vs latest, per shared axis. */}
          {model.trends.length > 0 && (
            <ul className="space-y-1" data-testid="pheno-generation-trends">
              {model.trends.map((t) => (
                <li
                  key={t.axisKey}
                  data-testid={`pheno-generation-trend-${t.axisKey}`}
                  className="flex items-start justify-between gap-2 text-[11px]"
                >
                  <span className="min-w-0">{t.detail}</span>
                  <span
                    data-testid={`pheno-generation-trend-badge-${t.axisKey}`}
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TREND_TONE[t.direction]}`}
                  >
                    {TREND_LABEL[t.direction]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="text-[10px] text-muted-foreground">{GENERATION_PROGRESS_CAVEAT}</p>
    </section>
  );
}
