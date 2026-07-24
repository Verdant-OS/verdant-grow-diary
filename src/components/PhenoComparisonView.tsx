/**
 * PhenoComparisonView — presentational, read-only Pheno Comparison surface.
 *
 * Shared by the demo-fixture page (PhenoComparison) and the live-hunt page
 * (PhenoHuntCompare). Takes already-prepared candidate inputs and does its
 * own pure view-model build. NO fetch, NO Supabase, NO AI, NO writes — the
 * live page does its own RLS-scoped read and passes the results in here.
 *
 * Hard constraints (unchanged):
 *  - Read-only presenter. Every candidate renders side-by-side with Quick Log
 *    entries, timeline events, photos, and sensor snapshots. Missing context
 *    is visibly flagged; demo/stale/invalid sensor sources are never rendered
 *    as healthy. Never picks a phenotype.
 */
import { useMemo } from "react";
import {
  buildPhenoComparisonView,
  type PhenoCandidateInput,
  type PhenoCandidateView,
  type PhenoSensorSnapshotView,
} from "@/lib/phenoComparisonViewModel";
import { PHENO_COMPARISON_DEMO_BANNER } from "@/lib/phenoComparisonFixtures";
import {
  PHENO_SOURCE_LEGEND,
  PHENO_COMPARISON_CONFIDENCE_CAVEAT,
} from "@/lib/phenoComparisonRules";
import {
  buildPhenoExpressionView,
  assessCohortComparability,
  type PhenoExpressionView,
} from "@/lib/phenoExpressionRules";

export interface PhenoComparisonViewProps {
  readonly inputs: readonly PhenoCandidateInput[] | null | undefined;
  /** "demo" shows the demo-fixture disclaimer; "live" shows the hunt name. */
  readonly mode: "demo" | "live";
  /** Hunt name, shown in live mode. */
  readonly huntName?: string | null;
  /**
   * When false, any ranking / verdict / keeper-conclusion UI must remain
   * hidden. Raw evidence review is allowed but MUST be clearly labeled
   * incomplete by the parent surface. Defaults to true — the current
   * presenter renders no conclusion cards, so this is a defense-in-depth
   * signal (data-attr) for nested surfaces added later.
   */
  readonly allowConclusions?: boolean;
  /**
   * Heading element for the "Pheno Comparison" title. Defaults to "h1"
   * (this view is the page). Pages that embed the view under their own H1
   * (e.g. /pheno-expression-showcase) pass "h2" so each page keeps exactly
   * one H1.
   */
  readonly headingLevel?: "h1" | "h2";
}

function toneClass(view: PhenoSensorSnapshotView): string {
  if (view.source === "live")
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
  if (view.source === "manual")
    return "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300";
  if (view.source === "csv")
    return "border-indigo-500/40 bg-indigo-500/10 text-indigo-800 dark:text-indigo-300";
  if (view.source === "invalid")
    return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
  // demo | stale
  return "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300";
}

function fmtMetric(v: number | null, unit?: string): string {
  if (v === null) return "—";
  return unit ? `${v} ${unit}` : String(v);
}

function Tag({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-foreground">
      {text}
    </span>
  );
}

/** Read-only expression block: loud trait axes, aroma, smoke test, COA, sex, herm. */
function ExpressionBlock({ e }: { e: PhenoExpressionView }) {
  return (
    <div
      data-testid={`pheno-candidate-${e.candidateId}-expression`}
      className="space-y-3 rounded-md border border-border bg-muted/20 p-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Expression</h3>
        {e.round && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {e.round.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* Hermaphrodite: suggest-only "consider removing" — the grower decides.
          REVERSAL-AWARE: a keeper with a recorded reversal shows a neutral
          "expected" note instead of a cull alert (the reversed-female herm
          landmine — never nudge culling the plant being bred with). */}
      {e.herm.observed &&
        (e.herm.reversed ? (
          <div
            data-testid={`pheno-candidate-${e.candidateId}-herm-reversed`}
            className="space-y-1 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground"
          >
            <p className="font-medium text-foreground">Reversed female — pollen sacs expected</p>
            {e.herm.note && <p>{e.herm.note}</p>}
            <p className="text-[11px] opacity-90">{e.herm.caveat}</p>
          </div>
        ) : (
          <div
            data-testid={`pheno-candidate-${e.candidateId}-herm-flag`}
            role="alert"
            className="space-y-1 rounded-md border border-red-500/50 bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-300"
          >
            <p className="font-semibold">⚠ Hermaphrodite observed — consider removing</p>
            {e.herm.note && <p>{e.herm.note}</p>}
            <p className="text-[11px] opacity-90">{e.herm.caveat}</p>
          </div>
        ))}

      {/* Trait axes */}
      {e.traits.length > 0 && (
        <ul className="space-y-1.5">
          {e.traits.map((t) => (
            <li key={t.key} data-testid={`expression-trait-${e.candidateId}-${t.key}`}>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium">{t.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {t.value}/{t.max}
                  {t.kind === "intensity" ? " loud" : ""}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={
                    t.kind === "intensity" ? "h-full bg-fuchsia-500" : "h-full bg-emerald-500"
                  }
                  style={{ width: `${Math.round(((t.value - t.min) / (t.max - t.min)) * 100)}%` }}
                />
              </div>
              {t.note && <p className="mt-0.5 text-[10px] text-muted-foreground">{t.note}</p>}
            </li>
          ))}
        </ul>
      )}

      {/* Aroma / nose */}
      {(e.aromaDescriptors.length > 0 || e.noseNote) && (
        <div data-testid={`expression-aroma-${e.candidateId}`} className="space-y-1">
          <h4 className="text-[11px] font-medium">Nose</h4>
          {e.aromaDescriptors.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {e.aromaDescriptors.map((a) => (
                <Tag key={a} text={a} />
              ))}
            </div>
          )}
          {e.noseNote && <p className="text-[11px] text-muted-foreground">{e.noseNote}</p>}
        </div>
      )}

      {/* Sex */}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-medium">Sex:</span>
        <span data-testid={`expression-sex-${e.candidateId}`}>{e.sexLabel}</span>
      </div>

      {/* Post-cure smoke test — the deciding gate */}
      {e.smokeTest?.hasContent && (
        <div
          data-testid={`expression-smoke-test-${e.candidateId}`}
          className="space-y-1 rounded border border-border bg-background/60 p-2"
        >
          <h4 className="text-[11px] font-semibold">Post-cure smoke test</h4>
          {e.smokeTest.flavorDescriptors.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              <span className="text-muted-foreground">Flavor:</span>
              {e.smokeTest.flavorDescriptors.map((f) => (
                <Tag key={f} text={f} />
              ))}
            </div>
          )}
          {e.smokeTest.effectDescriptors.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              <span className="text-muted-foreground">Effect:</span>
              {e.smokeTest.effectDescriptors.map((f) => (
                <Tag key={f} text={f} />
              ))}
            </div>
          )}
          <div className="flex gap-3 text-[11px] text-muted-foreground">
            <span>Smoothness: {fmtMetric(e.smokeTest.smoothness)}/5</span>
            <span>Potency (feel): {fmtMetric(e.smokeTest.potencyImpression)}/5</span>
          </div>
          {e.smokeTest.verdict && (
            <p className="text-[11px] italic text-foreground">“{e.smokeTest.verdict}”</p>
          )}
        </div>
      )}

      {/* COA / lab numbers — grower-attached, source-tagged, never fabricated */}
      {e.labResult && (
        <div
          data-testid={`expression-lab-${e.candidateId}`}
          className="space-y-1 rounded border border-border bg-background/60 p-2 text-[11px]"
        >
          <div className="flex items-center gap-2">
            <h4 className="font-semibold">Lab</h4>
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                e.labResult.labVerified
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
              }`}
            >
              {e.labResult.sourceLabel}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-muted-foreground">
            <span>THC: {fmtMetric(e.labResult.thcPct, "%")}</span>
            <span>CBD: {fmtMetric(e.labResult.cbdPct, "%")}</span>
            <span>Total: {fmtMetric(e.labResult.totalCannabinoidsPct, "%")}</span>
          </div>
          {e.labResult.dominantTerpenes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground">Terps:</span>
              {e.labResult.dominantTerpenes.map((t) => (
                <Tag key={t.name} text={t.pct != null ? `${t.name} ${t.pct}%` : t.name} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Honest missing-expression flags */}
      {e.missing.length > 0 && (
        <ul className="space-y-0.5 text-[10px] text-amber-800 dark:text-amber-300">
          {e.missing.map((m) => (
            <li key={m.code} data-testid={`expression-missing-${e.candidateId}-${m.code}`}>
              ⚠ {m.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CandidateColumn({
  c,
  expression,
}: {
  c: PhenoCandidateView;
  expression?: PhenoExpressionView | null;
}) {
  const headingId = `pheno-candidate-${c.candidateId}-heading`;
  return (
    <section
      data-testid={`pheno-candidate-${c.candidateId}`}
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <header className="space-y-1">
        <h2 id={headingId} className="text-lg font-semibold">
          {c.candidateNumber != null ? (
            <span
              data-testid={`pheno-candidate-${c.candidateId}-number`}
              className="mr-1 rounded bg-muted px-1.5 py-0.5 text-sm font-medium"
            >
              #{c.candidateNumber}
            </span>
          ) : null}
          {c.candidateLabel}
        </h2>
        <p className="text-xs text-muted-foreground">
          {[c.growLabel, c.tentLabel, c.plantLabel].filter(Boolean).join(" · ") ||
            "Context unknown"}
        </p>
        <p className="text-xs text-muted-foreground">
          {c.strain ?? "Strain unknown"} · {c.stage ?? "Stage unknown"}
        </p>
      </header>

      {c.missing.length > 0 && (
        <ul
          data-testid={`pheno-candidate-${c.candidateId}-missing`}
          role="status"
          aria-label={`Missing context for ${c.candidateLabel}`}
          className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300"
        >
          {c.missing.map((m) => (
            <li key={m.code} data-testid={`missing-${m.code}`}>
              ⚠ {m.message}
            </li>
          ))}
        </ul>
      )}

      {expression?.hasAnyExpression && <ExpressionBlock e={expression} />}

      <div>
        <h3 className="text-sm font-medium mb-1">Quick Log entries</h3>
        {c.quickLogEntries.length === 0 ? (
          <p className="text-xs text-muted-foreground">No Quick Log entries yet.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {c.quickLogEntries.map((e) => (
              <li
                key={e.id}
                data-testid={`quicklog-${e.id}`}
                className="rounded border border-border px-2 py-1"
              >
                <span className="font-medium">{e.kind ?? "note"}</span>
                {e.note ? ` — ${e.note}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium mb-1">Timeline events</h3>
        {c.timelineEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground">No timeline events.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {c.timelineEvents.map((t) => (
              <li
                key={t.id}
                data-testid={`timeline-${t.id}`}
                className="rounded border border-border px-2 py-1"
              >
                <span className="font-medium">{t.kind}</span>
                {t.summary ? ` — ${t.summary}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium mb-1">Photos</h3>
        {c.photos.length === 0 ? (
          <p
            data-testid={`pheno-candidate-${c.candidateId}-no-photo`}
            role="status"
            aria-label={`No photo attached for ${c.candidateLabel}`}
            className="text-xs text-amber-800 dark:text-amber-300"
          >
            No photo attached.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {c.photos.map((p) => (
              <li
                key={p.id}
                data-testid={`photo-${p.id}`}
                className="rounded border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground"
              >
                {p.caption ?? "Photo (demo)"}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium mb-1">Sensor snapshots</h3>
        {c.sensorSnapshots.length === 0 ? (
          <p
            data-testid={`pheno-candidate-${c.candidateId}-no-sensor`}
            role="status"
            aria-label={`No sensor snapshot for ${c.candidateLabel}`}
            className="text-xs text-amber-800 dark:text-amber-300"
          >
            No sensor snapshot.
          </p>
        ) : (
          <ul className="space-y-2">
            {c.sensorSnapshots.map((s) => (
              <li
                key={s.id}
                data-testid={`snapshot-${s.id}`}
                data-source={s.source}
                className="space-y-1 rounded border border-border p-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    data-testid={`snapshot-${s.id}-source`}
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${toneClass(
                      s,
                    )}`}
                  >
                    {s.sourceLabel}
                  </span>
                  <span className="text-muted-foreground">{s.capturedAt ?? "no timestamp"}</span>
                </div>
                <ul className="grid grid-cols-3 gap-1 text-[11px]">
                  <li>Temp: {fmtMetric(s.tempF, "°F")}</li>
                  <li>RH: {fmtMetric(s.rh, "%")}</li>
                  <li>VPD: {fmtMetric(s.vpd, "kPa")}</li>
                  <li>EC: {fmtMetric(s.ec, "mS/cm")}</li>
                  <li>pH: {fmtMetric(s.ph)}</li>
                  <li>PPFD: {fmtMetric(s.ppfd)}</li>
                </ul>
                {s.missing.length > 0 && (
                  <ul className="space-y-0.5 border-t border-border pt-1 text-[11px] text-amber-800 dark:text-amber-300">
                    {s.missing.map((m) => (
                      <li key={m.code} data-testid={`snapshot-${s.id}-missing-${m.code}`}>
                        ⚠ {m.message}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function PhenoComparisonView({
  inputs,
  mode,
  huntName,
  allowConclusions = true,
  headingLevel = "h1",
}: PhenoComparisonViewProps) {
  const HeadingTag = headingLevel;
  const view = useMemo(() => buildPhenoComparisonView(inputs ?? []), [inputs]);

  const expressionById = useMemo(() => {
    const map = new Map<string, PhenoExpressionView>();
    for (const input of inputs ?? []) {
      if (!input || typeof input.candidateId !== "string") continue;
      const ev = buildPhenoExpressionView(input.candidateId, input.expression);
      if (ev) map.set(input.candidateId, ev);
    }
    return map;
  }, [inputs]);

  const comparability = useMemo(
    () =>
      assessCohortComparability(
        (inputs ?? []).map((i) => ({
          candidateId: i.candidateId,
          growLabel: i.growLabel,
          tentLabel: i.tentLabel,
        })),
      ),
    [inputs],
  );

  return (
    <main
      data-testid="pheno-comparison-page"
      data-mode={mode}
      data-allow-conclusions={allowConclusions ? "true" : "false"}
      aria-labelledby="pheno-comparison-heading"
      className="container mx-auto max-w-6xl px-4 py-6 space-y-4"
    >
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <HeadingTag id="pheno-comparison-heading" className="text-2xl font-semibold">
            Pheno Comparison
          </HeadingTag>
          <span
            data-testid="pheno-comparison-read-only-badge"
            role="status"
            aria-label="Read-only preview"
            className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Read-only preview
          </span>
        </div>
        {mode === "demo" ? (
          <p
            data-testid="pheno-comparison-demo-banner"
            role="status"
            aria-label="Demo data disclaimer"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
          >
            {PHENO_COMPARISON_DEMO_BANNER}
          </p>
        ) : (
          <p
            data-testid="pheno-comparison-live-hunt"
            role="status"
            aria-label="Live pheno hunt"
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          >
            Comparing candidates for hunt:{" "}
            <span className="font-medium text-foreground">{huntName ?? "this hunt"}</span>.
            Read-only — your own data, scoped to you.
          </p>
        )}
        <p
          data-testid="pheno-comparison-confidence-caveat"
          className="text-xs text-muted-foreground"
        >
          {PHENO_COMPARISON_CONFIDENCE_CAVEAT}
        </p>
        <p
          data-testid="pheno-comparison-comparability-verdict"
          role="status"
          aria-label="Comparability verdict"
          className="text-xs text-muted-foreground"
        >
          {view.caveat}
        </p>

        {comparability.warning && (
          <p
            data-testid="pheno-comparison-comparability-warning"
            role="status"
            aria-label="Apples-to-apples comparability warning"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
          >
            ⚠ {comparability.warning}
          </p>
        )}

        <ul
          data-testid="pheno-comparison-source-legend"
          aria-label="Sensor source legend"
          className="flex flex-wrap gap-2 rounded-md border border-border bg-muted/30 p-2 text-[11px]"
        >
          {PHENO_SOURCE_LEGEND.map((item) => (
            <li
              key={item.source}
              data-testid={`legend-${item.source}`}
              aria-label={`${item.label} source: ${item.description}`}
              className="flex items-center gap-1.5 rounded border border-border bg-background/60 px-2 py-1"
            >
              <span
                className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${toneClass(
                  { source: item.source } as PhenoSensorSnapshotView,
                )}`}
              >
                {item.label}
              </span>
              <span className="text-muted-foreground">{item.description}</span>
            </li>
          ))}
        </ul>
      </header>

      {!view.ok ? (
        <p
          data-testid="pheno-comparison-error"
          role="alert"
          className="text-sm text-muted-foreground"
        >
          Select at least two candidates to compare.
        </p>
      ) : (
        <div
          data-testid="pheno-comparison-grid"
          role="region"
          aria-label="Pheno candidate comparison grid"
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {view.candidates.map((c) => (
            <CandidateColumn
              key={c.candidateId}
              c={c}
              expression={expressionById.get(c.candidateId) ?? null}
            />
          ))}
        </div>
      )}
    </main>
  );
}
