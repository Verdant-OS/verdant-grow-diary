/**
 * GgsSentinelEvidenceTimelineCard — presenter for the derived
 * GGS Sentinel evidence view-model. Read-only.
 *
 * NEVER renders private payload bodies or private identifiers.
 * NEVER writes Supabase / AI / alerts / Action Queue / device control.
 */
import type { GgsSentinelEvidenceViewModel } from "@/lib/ggsSentinelEvidenceViewModel";

export interface GgsSentinelEvidenceTimelineCardProps {
  viewModel: GgsSentinelEvidenceViewModel;
}

export function GgsSentinelEvidenceTimelineCard({
  viewModel,
}: GgsSentinelEvidenceTimelineCardProps) {
  const {
    title,
    subtitle,
    verdict,
    verdictLabel,
    state,
    hasFreshnessWarning,
    freshnessWarnings,
    nextSteps,
    checks,
    metrics,
    disclaimer,
  } = viewModel;

  return (
    <article
      data-testid="ggs-sentinel-evidence-timeline-card"
      className="rounded-lg border border-border bg-card text-card-foreground p-4 space-y-3"
      aria-label={title}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold leading-tight">{title}</h3>
        <span
          data-testid="ggs-sentinel-evidence-verdict"
          data-verdict={verdict}
          className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {verdictLabel}
        </span>
        <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Derived · read-only
        </span>
      </header>

      <p className="text-xs text-muted-foreground">{subtitle}</p>

      {state && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="ggs-sentinel-evidence-state"
        >
          State: <span className="font-mono">{state}</span>
        </p>
      )}

      {hasFreshnessWarning && (
        <div
          data-testid="ggs-sentinel-evidence-freshness-warning"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
        >
          <p className="font-medium">Freshness warning</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {freshnessWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {metrics.length > 0 && (
        <ul
          data-testid="ggs-sentinel-evidence-metric-list"
          className="divide-y rounded-md border text-xs"
        >
          {metrics.map((m) => (
            <li
              key={m.metric}
              data-testid={`ggs-sentinel-evidence-metric-${m.metric}`}
              data-freshness={m.freshness}
              className="grid grid-cols-2 gap-2 px-3 py-2 md:grid-cols-5"
            >
              <span className="font-medium">{m.metricLabel}</span>
              <span className="font-mono">{m.value === null ? "—" : m.value}</span>
              <span className="font-mono">{m.sourceLabel ?? "—"}</span>
              <span className="font-mono">{m.vendorLabel ?? "—"}</span>
              <span className="text-muted-foreground">{m.ageLabel}</span>
            </li>
          ))}
        </ul>
      )}

      {checks.length > 0 && (
        <ul
          data-testid="ggs-sentinel-evidence-check-list"
          className="divide-y rounded-md border text-xs"
        >
          {checks.map((c) => (
            <li
              key={c.id}
              data-testid={`ggs-sentinel-evidence-check-${c.id}`}
              data-status={c.status}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <span>{c.label}</span>
              <span className="font-mono uppercase">{c.status}</span>
            </li>
          ))}
        </ul>
      )}

      {nextSteps.length > 0 && (
        <div data-testid="ggs-sentinel-evidence-next-steps">
          <p className="text-xs font-medium text-foreground">Next steps</p>
          <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-0.5">
            {nextSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs italic text-muted-foreground">{disclaimer}</p>
    </article>
  );
}

export default GgsSentinelEvidenceTimelineCard;
