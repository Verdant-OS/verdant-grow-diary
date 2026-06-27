/**
 * ContextualPhenoComparisonPanel — read-only presenter for the
 * Contextual Pheno Comparison v0 view-model.
 *
 * Hard constraints:
 *  - Presenter only. No fetch, no Supabase, no Edge Functions, no AI,
 *    no Action Queue writes, no alerts, no device control.
 *  - Does not rank, score, or pick a winner. Grower decides.
 *  - Demo / stale / invalid / unknown sources render as caution / untrusted
 *    and are never labeled healthy.
 */
import { cn } from "@/lib/utils";
import {
  type ContextualPhenoComparisonPlant,
  type ContextualPhenoComparisonView,
  type ContextualPhenoSensorSource,
} from "@/lib/contextualPhenoComparisonViewModel";

const SENSOR_SOURCE_ORDER: readonly ContextualPhenoSensorSource[] = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
  "unknown",
];

const TRUSTED_SOURCES: ReadonlySet<ContextualPhenoSensorSource> = new Set([
  "live",
  "manual",
  "csv",
]);

const SOURCE_LABEL: Record<ContextualPhenoSensorSource, string> = {
  live: "Live",
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
  unknown: "Unknown",
};

const SOURCE_TONE: Record<ContextualPhenoSensorSource, string> = {
  live: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  manual: "border-primary/40 bg-primary/10 text-primary",
  csv: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  demo: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  stale: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  invalid: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  unknown: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
};

function fmtNum(value: number | null, digits = 1, suffix = ""): string {
  if (value === null) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

interface EmptyStateRule {
  readonly id: string;
  readonly text: string;
  readonly applies: (plant: ContextualPhenoComparisonPlant) => boolean;
}

/**
 * Deterministic empty-state copy rules for the v0.3 panel. Order is locked.
 * Copy is cautious and specific: never says "healthy", never ranks, never
 * implies a winner, never recommends device control or dosing.
 */
const EMPTY_STATE_RULES: readonly EmptyStateRule[] = [
  {
    id: "diary",
    text: "No recent diary evidence yet.",
    applies: (p) => p.evidenceCounts.diary === 0,
  },
  {
    id: "photos",
    text: "No photos available for this comparison.",
    applies: (p) => p.evidenceCounts.photos === 0,
  },
  {
    id: "watering",
    text: "No watering entries recorded.",
    applies: (p) => p.evidenceCounts.watering === 0,
  },
  {
    id: "feeding",
    text: "No feeding entries recorded.",
    applies: (p) => p.evidenceCounts.feeding === 0,
  },
  {
    id: "sensor",
    text: "No sensor readings recorded.",
    applies: (p) => p.evidenceCounts.sensorReadings === 0,
  },
  {
    id: "untrusted-only",
    text: "Untrusted sensor evidence only — do not use as live context.",
    applies: (p) =>
      p.evidenceCounts.sensorReadings > 0 &&
      !p.environmentSummary.hasTrustedSensorContext,
  },
  {
    id: "no-trusted-context",
    text: "No trusted sensor context available.",
    applies: (p) => !p.environmentSummary.hasTrustedSensorContext,
  },
  {
    id: "environment-summary",
    text: "Environment summary unavailable.",
    applies: (p) =>
      p.environmentSummary.avgTempF === null &&
      p.environmentSummary.avgRh === null &&
      p.environmentSummary.avgVpd === null &&
      p.environmentSummary.avgPpfd === null,
  },
  {
    id: "stage",
    text: "Stage unknown.",
    applies: (p) => p.stage === null,
  },
  {
    id: "strain",
    text: "Strain / genetics unknown.",
    applies: (p) => p.strain === null,
  },
  {
    id: "status",
    text: "Status unknown.",
    applies: (p) => p.status === null,
  },
];


function PlantCard({ plant }: { plant: ContextualPhenoComparisonPlant }) {
  const env = plant.environmentSummary;
  const sourceEntries = SENSOR_SOURCE_ORDER.filter(
    (s) => plant.sourceCounts[s] > 0,
  );

  return (
    <article
      data-testid={`contextual-pheno-comparison-plant-${plant.plantId}`}
      data-plant-label={plant.plantLabel}
      className="rounded-lg border border-border bg-card text-card-foreground p-4 space-y-3"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 min-w-0">
        <h3 className="text-base font-semibold tracking-tight break-words">
          {plant.plantLabel}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {plant.strain && <span data-testid="plant-strain">{plant.strain}</span>}
          {plant.stage && (
            <span data-testid="plant-stage" className="opacity-80">
              · {plant.stage}
            </span>
          )}
          {plant.status && (
            <span data-testid="plant-status" className="opacity-80">
              · {plant.status}
            </span>
          )}
        </div>
      </header>

      <section data-testid="plant-evidence-counts">
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          Evidence
        </h4>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
          <li>Diary / logs: {plant.evidenceCounts.diary}</li>
          <li>Photos: {plant.evidenceCounts.photos}</li>
          <li>Watering: {plant.evidenceCounts.watering}</li>
          <li>Feeding: {plant.evidenceCounts.feeding}</li>
          <li>Sensor readings: {plant.evidenceCounts.sensorReadings}</li>
          <li>Alerts: {plant.evidenceCounts.alerts}</li>
        </ul>
      </section>

      <section data-testid="plant-environment-summary">
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          Environment (trusted readings only)
        </h4>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
          <li>Avg temp: {fmtNum(env.avgTempF, 1, "°F")}</li>
          <li>Avg RH: {fmtNum(env.avgRh, 0, "%")}</li>
          <li>Avg VPD: {fmtNum(env.avgVpd, 2)}</li>
          <li>Avg PPFD: {fmtNum(env.avgPpfd, 0)}</li>
        </ul>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Last sensor:{" "}
          <span data-testid="plant-last-sensor-at">
            {env.lastSensorAt ?? "—"}
          </span>
          {" · "}
          Trusted context:{" "}
          <span data-testid="plant-trusted-context">
            {env.hasTrustedSensorContext ? "yes" : "no"}
          </span>
        </p>
      </section>

      {sourceEntries.length > 0 && (
        <section data-testid="plant-source-quality">
          <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Source quality
          </h4>
          <ul className="flex flex-wrap gap-1.5">
            {sourceEntries.map((s) => {
              const untrusted = !TRUSTED_SOURCES.has(s);
              return (
                <li
                  key={s}
                  data-testid={`plant-source-count-${s}`}
                  data-source={s}
                  data-untrusted={untrusted ? "true" : "false"}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    SOURCE_TONE[s],
                  )}
                  title={
                    untrusted
                      ? `${SOURCE_LABEL[s]} — caution: untrusted source.`
                      : `${SOURCE_LABEL[s]} source.`
                  }
                >
                  <span>{SOURCE_LABEL[s]}</span>
                  <span aria-hidden="true" className="opacity-50">
                    ·
                  </span>
                  <span className="tabular-nums">{plant.sourceCounts[s]}</span>
                  {untrusted && (
                    <span className="sr-only"> (caution, untrusted)</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {env.trustWarnings.length > 0 && (
        <section data-testid="plant-trust-warnings">
          <h4 className="text-[11px] uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
            Trust warnings
          </h4>
          <ul className="list-disc list-inside text-xs text-amber-800 dark:text-amber-200 space-y-0.5">
            {env.trustWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {plant.missingContext.length > 0 && (
        <section data-testid="plant-missing-context">
          <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Missing context
          </h4>
          <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
            {plant.missingContext.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}

      {(() => {
        const empties = EMPTY_STATE_RULES.filter((r) => r.applies(plant));
        if (empties.length === 0) return null;
        return (
          <section data-testid="plant-empty-states" aria-label="Missing or unknown evidence">
            <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              What's missing or unknown
            </h4>
            <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
              {empties.map((e) => (
                <li
                  key={e.id}
                  data-testid={`plant-empty-state-${e.id}`}
                  data-empty-state-id={e.id}
                >
                  {e.text}
                </li>
              ))}
            </ul>
          </section>
        );
      })()}



      {plant.comparisonNotes.length > 0 && (
        <section data-testid="plant-comparison-notes">
          <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Grower notes
          </h4>
          <ul className="list-disc list-inside text-xs space-y-0.5">
            {plant.comparisonNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

export interface ContextualPhenoComparisonPanelProps {
  view: ContextualPhenoComparisonView;
  /** When true, render the demo data banner. Default true. */
  showDemoBanner?: boolean;
  /** Optional banner text override. */
  demoBannerText?: string;
  className?: string;
}

export default function ContextualPhenoComparisonPanel({
  view,
  showDemoBanner = true,
  demoBannerText = "Demo comparison data — not live sensor data.",
  className,
}: ContextualPhenoComparisonPanelProps) {
  return (
    <div
      data-testid="contextual-pheno-comparison-panel"
      className={cn("space-y-4", className)}
    >
      {showDemoBanner && (
        <div
          data-testid="contextual-pheno-comparison-demo-banner"
          role="note"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
        >
          {demoBannerText}
        </div>
      )}

      <p
        data-testid="contextual-pheno-comparison-caveat"
        className="text-xs text-muted-foreground"
      >
        {view.caveat}
      </p>

      <p
        data-testid="contextual-pheno-comparison-plant-count"
        className="text-xs text-muted-foreground"
      >
        Selected plants: <span className="tabular-nums">{view.plants.length}</span>
      </p>

      {!view.ok && (
        <div
          data-testid="contextual-pheno-comparison-error"
          role="alert"
          className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        >
          {view.crossPlantMissingContext.join(" ")}
        </div>
      )}

      {view.ok && view.plants.length > 0 && (
        <div
          data-testid="contextual-pheno-comparison-plant-grid"
          className="grid gap-3 grid-cols-1 md:grid-cols-2"
        >
          {view.plants.map((p) => (
            <PlantCard key={p.plantId} plant={p} />
          ))}
        </div>
      )}

      {view.ok && view.crossPlantMissingContext.length > 0 && (
        <section data-testid="contextual-pheno-comparison-cross-missing">
          <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Cross-plant missing context
          </h4>
          <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
            {view.crossPlantMissingContext.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}

      {view.ok && (
        <section data-testid="contextual-pheno-comparison-source-summary">
          <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Source quality summary
          </h4>
          <ul className="flex flex-wrap gap-1.5">
            {SENSOR_SOURCE_ORDER.filter(
              (s) => view.sourceQualitySummary[s] > 0,
            ).map((s) => {
              const untrusted = !TRUSTED_SOURCES.has(s);
              return (
                <li
                  key={s}
                  data-testid={`contextual-pheno-comparison-source-summary-${s}`}
                  data-source={s}
                  data-untrusted={untrusted ? "true" : "false"}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    SOURCE_TONE[s],
                  )}
                >
                  <span>{SOURCE_LABEL[s]}</span>
                  <span aria-hidden="true" className="opacity-50">
                    ·
                  </span>
                  <span className="tabular-nums">
                    {view.sourceQualitySummary[s]}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
