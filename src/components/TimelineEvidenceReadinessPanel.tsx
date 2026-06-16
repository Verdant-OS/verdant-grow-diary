/**
 * TimelineEvidenceReadinessPanel — presenter-only compact panel that
 * shows what timeline evidence AI Doctor will see, BEFORE any AI call.
 *
 * Hard constraints:
 *  - Presenter only. All mapping/tone/copy lives in
 *    `timelineEvidenceReadinessViewModel`.
 *  - Reuses existing `<SensorSourceBadge>` so demo/csv/stale/invalid
 *    can never visually pass as live or healthy.
 *  - Renders never trigger AI calls, never write to Supabase, never
 *    create alerts/Action Queue rows, never touch device control.
 *  - Never renders raw_payload, private IDs, or vendor metadata.
 */
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import SensorSourceBadge from "@/components/SensorSourceBadge";
import {
  buildTimelineEvidenceReadinessView,
  type TimelineEvidenceReadinessExtras,
} from "@/lib/timelineEvidenceReadinessViewModel";
import type { AiDoctorContext } from "@/lib/aiDoctorEngine";

interface Props {
  context: AiDoctorContext;
  extras?: TimelineEvidenceReadinessExtras;
  className?: string;
}

const TONE_CLASS = {
  ready: "border-emerald-500/40 bg-emerald-500/5",
  limited: "border-amber-500/40 bg-amber-500/5",
  untrusted: "border-destructive/50 bg-destructive/5",
} as const;

const TONE_ICON = {
  ready: <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />,
  limited: <Info className="h-4 w-4 text-amber-500" aria-hidden />,
  untrusted: <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />,
} as const;

export default function TimelineEvidenceReadinessPanel({
  context,
  extras,
  className,
}: Props) {
  const view = buildTimelineEvidenceReadinessView(context, extras);

  return (
    <section
      aria-labelledby="timeline-evidence-readiness-heading"
      data-testid="timeline-evidence-readiness-panel"
      data-tone={view.tone}
      data-trustworthy={view.hasTrustworthySensorSource ? "true" : "false"}
      data-untrusted={view.hasUntrustedSensorSource ? "true" : "false"}
      className={cn(
        "rounded-md border p-3 space-y-3 text-xs",
        TONE_CLASS[view.tone],
        className,
      )}
    >
      <header className="flex items-start gap-2">
        <span className="mt-0.5">{TONE_ICON[view.tone]}</span>
        <div className="space-y-0.5">
          <h3
            id="timeline-evidence-readiness-heading"
            className="text-sm font-semibold tracking-tight"
          >
            Context readiness
          </h3>
          <p
            data-testid="timeline-evidence-readiness-headline"
            className="text-xs text-muted-foreground"
          >
            {view.headline}
          </p>
        </div>
      </header>

      <dl
        className="grid grid-cols-2 sm:grid-cols-3 gap-2"
        data-testid="timeline-evidence-readiness-counts"
      >
        {[
          { key: "recent-logs", label: "Recent logs", value: view.counts.recentLogs },
          { key: "recent-photos", label: "Photos", value: view.counts.recentPhotos },
          {
            key: "recent-snapshots",
            label: "Sensor snapshots",
            value: view.counts.recentSensorSnapshots,
          },
          { key: "recent-watering", label: "Watering", value: view.counts.recentWatering },
          { key: "recent-feeding", label: "Feeding", value: view.counts.recentFeeding },
          { key: "open-alerts", label: "Open alerts", value: view.counts.openAlerts },
        ].map((c) => (
          <div
            key={c.key}
            className="rounded-md border border-border/40 p-2 bg-background/40"
            data-testid={`timeline-evidence-readiness-count-${c.key}`}
            data-count={c.value}
          >
            <dt className="text-muted-foreground">{c.label}</dt>
            <dd className="font-medium tabular-nums">{c.value}</dd>
          </div>
        ))}
      </dl>

      {view.sourceBadges.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-1">
            Sensor sources
          </h4>
          <ul
            className="flex flex-wrap gap-1.5"
            data-testid="timeline-evidence-readiness-sources"
          >
            {view.sourceBadges.map((b) => (
              <li
                key={b.source}
                data-testid={`timeline-evidence-readiness-source-${b.source}`}
                data-source={b.source}
                data-trustworthy={b.trustworthy ? "true" : "false"}
                data-sample-count={b.sampleCount}
                className="inline-flex items-center gap-1.5"
              >
                <SensorSourceBadge
                  source={b.source}
                  status={b.trustworthy ? "usable" : "needs_review"}
                  testId={`timeline-evidence-readiness-source-badge-${b.source}`}
                />
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  · {b.sampleCount}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.missing.length > 0 && (
        <div>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-1">
            Missing context
          </h4>
          <ul
            className="space-y-0.5 list-disc pl-4"
            data-testid="timeline-evidence-readiness-missing"
          >
            {view.missing.map((m) => (
              <li
                key={m.code}
                data-testid={`timeline-evidence-readiness-missing-${m.code}`}
              >
                {m.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
