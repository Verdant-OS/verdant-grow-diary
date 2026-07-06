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

export interface PhenoComparisonViewProps {
  readonly inputs: readonly PhenoCandidateInput[] | null | undefined;
  /** "demo" shows the demo-fixture disclaimer; "live" shows the hunt name. */
  readonly mode: "demo" | "live";
  /** Hunt name, shown in live mode. */
  readonly huntName?: string | null;
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

function CandidateColumn({ c }: { c: PhenoCandidateView }) {
  const headingId = `pheno-candidate-${c.candidateId}-heading`;
  return (
    <section
      data-testid={`pheno-candidate-${c.candidateId}`}
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <header className="space-y-1">
        <h2 id={headingId} className="text-lg font-semibold">
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

export default function PhenoComparisonView({ inputs, mode, huntName }: PhenoComparisonViewProps) {
  const view = useMemo(() => buildPhenoComparisonView(inputs ?? []), [inputs]);

  return (
    <main
      data-testid="pheno-comparison-page"
      data-mode={mode}
      aria-labelledby="pheno-comparison-heading"
      className="container mx-auto max-w-6xl px-4 py-6 space-y-4"
    >
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 id="pheno-comparison-heading" className="text-2xl font-semibold">
            Pheno Comparison
          </h1>
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
            <CandidateColumn key={c.candidateId} c={c} />
          ))}
        </div>
      )}
    </main>
  );
}
