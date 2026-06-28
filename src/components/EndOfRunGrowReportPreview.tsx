/**
 * EndOfRunGrowReportPreview — read-only presenter for the End-of-Run Grow
 * Report preview (the future Pro subscriber hook).
 *
 * Presenter-only: every value comes from a prebuilt GrowReportViewModel
 * (see @/lib/endOfRunGrowReportViewModel). This component performs no data
 * access, no aggregation, no writes, no automation, and no device control.
 * It renders honest empty states and never claims a grow was healthy or
 * successful.
 */
import { Badge } from "@/components/ui/badge";
import {
  REPORT_NO_LOGGED_DATA_COPY,
  type GrowReportViewModel,
} from "@/lib/endOfRunGrowReportViewModel";

function formatTimestamp(value: string | null): string {
  if (!value) return "Not available";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toLocaleDateString();
}

function CountValue({ count }: { count: number }) {
  if (count <= 0) {
    return <span className="text-xs text-muted-foreground">{REPORT_NO_LOGGED_DATA_COPY}</span>;
  }
  return <span className="text-lg font-semibold tabular-nums">{count}</span>;
}

function SectionCard({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-2xl p-4 mb-4" data-testid={testId} aria-label={title}>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

export interface EndOfRunGrowReportPreviewProps {
  report: GrowReportViewModel;
}

export default function EndOfRunGrowReportPreview({ report }: EndOfRunGrowReportPreviewProps) {
  const { header, runSummary, plants, sensorTruth, alerts, actionQueue, lessons, proTeaser } =
    report;

  return (
    <div className="mx-auto max-w-5xl pb-10" data-testid="end-of-run-report-preview">
      {/* 1. Header */}
      <section
        className="glass rounded-3xl p-4 sm:p-6 mb-4 border-primary/20"
        data-testid="end-of-run-report-header"
        aria-label="Report header"
      >
        <h1 className="text-xl font-semibold">{header.growName}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {header.statusBadges.map((badge) => (
            <Badge key={badge} variant="outline">
              {badge}
            </Badge>
          ))}
        </div>
        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Started</dt>
            <dd>{formatTimestamp(header.startedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Latest log</dt>
            <dd>{formatTimestamp(header.endedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tents</dt>
            <dd className="tabular-nums">{header.tentCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Plants</dt>
            <dd className="tabular-nums">{header.plantCount}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">{header.dataSourceNote}</p>
      </section>

      {report.isEmpty && (
        <div
          className="glass rounded-2xl p-4 mb-4 text-sm text-muted-foreground"
          data-testid="end-of-run-report-empty"
        >
          No logged data yet for this grow. This preview will fill in as you log events, snapshots,
          alerts, and actions.
        </div>
      )}

      {/* 2. Run summary */}
      <SectionCard title="Run summary" testId="end-of-run-report-run-summary">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {runSummary.categories.map((category) => (
            <div
              key={category.key}
              className="rounded-xl border border-border/40 p-3"
              data-testid={`run-summary-${category.key}`}
            >
              <div className="text-xs text-muted-foreground">{category.label}</div>
              <CountValue count={category.count} />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 3. Plant highlights */}
      <SectionCard title="Plant highlights" testId="end-of-run-report-plants">
        {plants.length === 0 ? (
          <p className="text-sm text-muted-foreground">{REPORT_NO_LOGGED_DATA_COPY}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {plants.map((plant) => (
              <li
                key={plant.id}
                className="rounded-xl border border-border/40 p-3"
                data-testid={`plant-summary-${plant.id}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{plant.name}</span>
                  <Badge variant="secondary">{plant.strainLabel}</Badge>
                  <Badge variant="outline">{plant.stageLabel}</Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <span>Events: {plant.timelineEventCount}</span>
                  <span>Photos: {plant.photoCount}</span>
                  <span>Watering: {plant.wateringCount}</span>
                  <span>Feeding: {plant.feedingCount}</span>
                  <span>Alerts: {plant.alertCount}</span>
                  <span>AI Doctor: {plant.aiDoctorCount}</span>
                </div>
                <p className="mt-2 text-xs">
                  Most documented area:{" "}
                  <span className="font-medium">{plant.mostDocumentedArea}</span>
                </p>
                {plant.missingContext.length > 0 && (
                  <div
                    className="mt-2 flex flex-wrap gap-1"
                    data-testid={`plant-missing-${plant.id}`}
                  >
                    {plant.missingContext.map((chip) => (
                      <Badge key={chip} variant="outline">
                        {chip}
                      </Badge>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* 4. Sensor truth summary */}
      <SectionCard title="Sensor truth summary" testId="end-of-run-report-sensor-truth">
        {!sensorTruth.hasData ? (
          <p className="text-sm text-muted-foreground">{sensorTruth.note}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-2">{sensorTruth.note}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {sensorTruth.bySource.map((entry) => (
                <div
                  key={entry.source}
                  className="rounded-xl border border-border/40 p-2 text-center"
                  data-testid={`sensor-source-${entry.source}`}
                >
                  <div className="text-xs text-muted-foreground">{entry.label}</div>
                  <div className="text-base font-semibold tabular-nums">{entry.count}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Most recent snapshot: {formatTimestamp(sensorTruth.mostRecentAt)}
            </p>
            {sensorTruth.degradedWarning && (
              <p className="mt-2 text-xs text-amber-500" data-testid="sensor-degraded-warning">
                {sensorTruth.degradedWarning}
              </p>
            )}
          </>
        )}
      </SectionCard>

      {/* 5. Alert and issue summary */}
      <SectionCard title="Alert summary" testId="end-of-run-report-alerts">
        {!alerts.hasData ? (
          <p className="text-sm text-muted-foreground">{alerts.note}</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="font-semibold tabular-nums">{alerts.total}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Open</div>
                <div className="font-semibold tabular-nums">{alerts.open}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Resolved</div>
                <div className="font-semibold tabular-nums">{alerts.resolved}</div>
              </div>
            </div>
            {alerts.bySeverity.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {alerts.bySeverity.map((entry) => (
                  <Badge key={entry.severity} variant="outline">
                    {entry.severity}: {entry.count}
                  </Badge>
                ))}
              </div>
            )}
            {alerts.topMetrics.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Top metrics: {alerts.topMetrics.map((m) => `${m.label} (${m.count})`).join(", ")}
              </p>
            )}
          </>
        )}
      </SectionCard>

      {/* 6. Action Queue summary */}
      <SectionCard title="Action Queue summary" testId="end-of-run-report-action-queue">
        {!actionQueue.hasData ? (
          <p className="text-sm text-muted-foreground">{REPORT_NO_LOGGED_DATA_COPY}</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Suggested</div>
              <div className="font-semibold tabular-nums">{actionQueue.suggested}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Pending</div>
              <div className="font-semibold tabular-nums">{actionQueue.pendingApproval}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Approved</div>
              <div className="font-semibold tabular-nums">{actionQueue.approved}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Rejected</div>
              <div className="font-semibold tabular-nums">{actionQueue.rejected}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Completed</div>
              <div className="font-semibold tabular-nums">{actionQueue.completed}</div>
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground" data-testid="action-queue-safety-note">
          {actionQueue.safetyNote}
        </p>
      </SectionCard>

      {/* 7. Lessons preview */}
      <SectionCard title="Lessons preview" testId="end-of-run-report-lessons">
        {lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rules-based lessons yet. Lessons appear once there is enough logged data to compare.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2">
            {lessons.map((lesson) => (
              <li
                key={lesson.id}
                className="rounded-xl border border-border/40 p-3"
                data-testid={`lesson-${lesson.id}`}
              >
                <div className="flex items-center gap-2">
                  <Badge variant={lesson.category === "repeat" ? "secondary" : "outline"}>
                    {lesson.category === "repeat" ? "Repeat" : "Improve"}
                  </Badge>
                  <span className="text-sm font-medium">{lesson.title}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{lesson.detail}</p>
                <p className="mt-1 text-xs text-muted-foreground">Evidence: {lesson.evidence}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* 8. Pro teaser */}
      <section
        className="glass rounded-2xl p-4 border-primary/30"
        data-testid="end-of-run-report-pro-teaser"
        aria-label="Pro report preview"
      >
        <h2 className="text-sm font-semibold">{proTeaser.headline}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{proTeaser.description}</p>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="mt-3 rounded-lg border border-border/50 px-3 py-1.5 text-xs text-muted-foreground opacity-60 cursor-not-allowed"
          data-testid="end-of-run-report-export-cta"
        >
          {proTeaser.exportLabel}
        </button>
      </section>
    </div>
  );
}
