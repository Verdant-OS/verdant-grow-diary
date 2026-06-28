import { Download, Image as ImageIcon, Info, ListChecks, Printer } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  buildPostGrowReportImageSvg,
  buildPostGrowReportSummaryText,
  type MetricAggregateView,
  type PostGrowLearningReportViewModel,
  type PostHarvestPoint,
} from "@/lib/postGrowLearningReportRules";
import {
  PRINT_HELPER_COPY,
  PRINT_UNAVAILABLE_COPY,
  openPostGrowReportPrintWindow,
} from "@/lib/postGrowReportPrintRules";
import { actionsPath } from "@/lib/routes";

function display(value: number | null, digits = 1): string {
  return value === null ? "—" : value.toFixed(digits);
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function handlePrint(vm: PostGrowLearningReportViewModel) {
  const result = openPostGrowReportPrintWindow(vm);
  if (result === "unavailable") {
    toast.error(PRINT_UNAVAILABLE_COPY);
  }
}

/* -----------------------------------------------------------------------------
 * Post-Grow Learning Report — UI Polish v1
 * Presenter-only. No new data, no new rules. All copy is factual & calm.
 * --------------------------------------------------------------------------- */

export const REPORT_HEADER_HELPER_COPY =
  "Review the run before the next one: what changed, what was logged, which alerts appeared, which actions were reviewed, and what to repeat or avoid.";

export const REPORT_SOURCE_HONESTY_COPY =
  "This report uses available Verdant logs and labeled sensor data. Missing data is treated as missing, not healthy.";

export const REPORT_ACTION_SAFETY_COPY =
  "Verdant suggestions remain grower-approved. This report does not include device commands.";

export const REPORT_SECTION_LABELS = {
  whatChanged: "What changed",
  whatWasLogged: "What was logged",
  alertsReviewed: "Alerts reviewed",
  actionsReviewed: "Actions reviewed",
  repeatNextRun: "What to repeat next run",
  avoidNextRun: "What to avoid next run",
} as const;

export const REPORT_EMPTY_SUMMARY_COPY =
  "Not enough evidence to summarize this section yet.";
export const REPORT_NO_LOGGED_DATA_COPY = "No logged data yet.";

export function PostGrowReportHeaderHelper(_: PostGrowReportHeaderHelperProps = {}) {
  return (
    <p
      data-testid="post-grow-report-header-helper"
      className="text-sm text-muted-foreground"
    >
      {REPORT_HEADER_HELPER_COPY}
    </p>
  );
}

export interface PostGrowReportHeaderHelperProps {
  /** Reserved for future presenter overrides. Intentionally empty today. */
  readonly _reserved?: never;
}

export interface PostGrowReportTopSummaryPanelProps {
  readonly vm: PostGrowLearningReportViewModel;
}

export function PostGrowReportTopSummaryPanel({
  vm,
}: PostGrowReportTopSummaryPanelProps) {
  const sensorReadingCount = vm.environment.reduce(
    (sum, m) => sum + (m.count ?? 0),
    0,
  );
  const statusLabel = !vm.eligible
    ? "Draft"
    : vm.header.archived
      ? "Archived run"
      : "In review";

  return (
    <section
      className="glass rounded-2xl p-4"
      data-testid="post-grow-top-summary-panel"
      aria-label="Run summary"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Run summary
          </p>
          <h2 className="font-display text-lg font-semibold">
            {vm.header.growName}
          </h2>
        </div>
        <Badge variant="outline" data-testid="post-grow-top-summary-status">
          {statusLabel}
        </Badge>
      </div>
      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <SummaryStat
          testId="post-grow-top-summary-logs"
          label="Sensor readings"
          value={String(sensorReadingCount)}
        />
        <SummaryStat
          testId="post-grow-top-summary-photos"
          label="Photos logged"
          value={String(vm.photos.length)}
        />
        <SummaryStat
          testId="post-grow-top-summary-actions"
          label="Actions reviewed"
          value={String(vm.actionEffectiveness.completedActions)}
        />
        <SummaryStat
          testId="post-grow-top-summary-alerts"
          label="Alerts reviewed"
          value="Alert Center"
          hint="Reviewed in the Alert Center"
        />
      </dl>
      <p
        className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground"
        data-testid="post-grow-source-honesty"
      >
        <Info className="h-3 w-3 mt-[2px] shrink-0" aria-hidden="true" />
        <span>{REPORT_SOURCE_HONESTY_COPY}</span>
      </p>
    </section>
  );
}

interface SummaryStatProps {
  readonly testId: string;
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}

function SummaryStat({ testId, label, value, hint }: SummaryStatProps) {
  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-border/50 bg-secondary/20 p-2"
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-display">{value}</p>
      {hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export interface PostGrowReportActionSafetyNoteProps {
  /** Reserved for future presenter overrides. Intentionally empty today. */
  readonly _reserved?: never;
}

export function PostGrowReportActionSafetyNote(
  _: PostGrowReportActionSafetyNoteProps = {},
) {
  return (
    <p
      data-testid="post-grow-action-safety-note"
      className="text-[11px] text-muted-foreground"
    >
      {REPORT_ACTION_SAFETY_COPY}
    </p>
  );
}

export interface DataCompletenessBadgeProps {
  readonly vm: PostGrowLearningReportViewModel;
}

export function DataCompletenessBadge({ vm }: DataCompletenessBadgeProps) {
  return (
    <div className="glass rounded-2xl p-3" data-testid="post-grow-completeness-badge">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Data completeness</span>
        <Badge variant="outline" className="text-[10px] uppercase">
          {vm.dataCompleteness.label} · {vm.dataCompleteness.score}%
        </Badge>
      </div>
      <div className="mt-2 h-2 rounded-full bg-secondary overflow-hidden" aria-hidden="true">
        <div
          className="h-full bg-primary"
          style={{ width: `${vm.dataCompleteness.score}%` }}
        />
      </div>
      {vm.dataCompleteness.missing.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Missing: {vm.dataCompleteness.missing.join(", ")}
        </p>
      )}
    </div>
  );
}

export function PostGrowExecutiveSummaryCard({ vm }: { vm: PostGrowLearningReportViewModel }) {
  const lines = vm.executiveSummary;
  return (
    <ReportCard
      title="Executive Summary"
      subtitle={REPORT_SECTION_LABELS.whatChanged}
      testId="post-grow-executive-summary"
    >
      {lines.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="post-grow-executive-summary-empty"
        >
          {REPORT_EMPTY_SUMMARY_COPY}
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {lines.map((line) => (
            <li key={line} className="text-muted-foreground">
              {line}
            </li>
          ))}
        </ul>
      )}
    </ReportCard>
  );
}

export function EnvironmentStabilityCard({ metrics }: { metrics: MetricAggregateView[] }) {
  return (
    <ReportCard
      title="Environment Stability"
      subtitle={`${REPORT_SECTION_LABELS.whatWasLogged} (environment)`}
      testId="post-grow-environment-stability"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {metrics.map((metric) => (
          <div key={metric.key} className="rounded-xl border border-border/50 bg-secondary/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{metric.label}</span>
              <Badge variant="outline" className="text-[10px]">
                {metric.count} readings
              </Badge>
            </div>
            <p className="mt-1 text-lg font-display">
              {display(metric.avg, metric.key === "vpd_kpa" ? 2 : 1)} {metric.unit}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Range {display(metric.min, metric.key === "vpd_kpa" ? 2 : 1)}–{display(metric.max, metric.key === "vpd_kpa" ? 2 : 1)} {metric.unit}
            </p>
            <Sparkline points={metric.sparkline} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Stability window: {metric.stablePct === null ? "not enough data" : `${metric.stablePct}% in practical range`}
            </p>
          </div>
        ))}
      </div>
    </ReportCard>
  );
}

export function PostHarvestPerformanceCard({ vm }: { vm: PostGrowLearningReportViewModel }) {
  return (
    <ReportCard title="Post-Harvest Performance" subtitle={`${REPORT_SECTION_LABELS.whatWasLogged} (harvest)`} testId="post-grow-post-harvest">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <Stat label="Final yield" value={vm.postHarvest.yieldGrams === null ? "—" : `${display(vm.postHarvest.yieldGrams)} g`} />
        <Stat label="Weight loss" value={vm.postHarvest.weightLossPct === null ? "—" : `${display(vm.postHarvest.weightLossPct)}%`} />
        <Stat
          label="RH stabilization"
          value={vm.postHarvest.rhStabilized === null ? "Thin data" : vm.postHarvest.rhStabilized ? "Stable" : "Still moving"}
        />
      </div>
      {vm.postHarvest.points.length === 0 ? (
        <p className="text-sm text-muted-foreground">No dry/cure checkpoint events found yet.</p>
      ) : (
        <div className="space-y-2">
          {vm.postHarvest.points.map((point) => (
            <PostHarvestPointRow key={`${point.capturedAt}-${point.label}`} point={point} />
          ))}
        </div>
      )}
    </ReportCard>
  );
}

function PostHarvestPointRow({ point }: { point: PostHarvestPoint }) {
  return (
    <div className="rounded-xl border border-border/50 bg-secondary/20 p-2 text-xs flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{new Date(point.capturedAt).toLocaleDateString()}</span>
      <span>{point.weightGrams === null ? "Weight —" : `${display(point.weightGrams)} g`}</span>
      <span>{point.rhPct === null ? "RH —" : `${display(point.rhPct)}% RH`}</span>
    </div>
  );
}

export function ActionEffectivenessCard({ vm }: { vm: PostGrowLearningReportViewModel }) {
  return (
    <ReportCard title="Action Effectiveness" subtitle={REPORT_SECTION_LABELS.actionsReviewed} testId="post-grow-action-effectiveness">
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Stat label="Completed actions" value={String(vm.actionEffectiveness.completedActions)} />
        <Stat label="Outcome notes" value={String(vm.actionEffectiveness.outcomeNotes)} />
      </div>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {vm.actionEffectiveness.observations.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Correlation only. Verdant does not claim a single action caused the harvest result.
      </p>
    </ReportCard>
  );
}

export function LessonsCard({
  vm,
  lesson,
  onLessonChange,
  onSave,
  onApply,
  busy,
}: {
  vm: PostGrowLearningReportViewModel;
  lesson: string;
  onLessonChange: (value: string) => void;
  onSave: () => void;
  onApply: () => void;
  busy: boolean;
}) {
  return (
    <ReportCard title="My Lessons & Notes" subtitle={`${REPORT_SECTION_LABELS.repeatNextRun} · ${REPORT_SECTION_LABELS.avoidNextRun}`} testId="post-grow-lessons">
      <Textarea
        value={lesson}
        onChange={(e) => onLessonChange(e.target.value)}
        placeholder="What should be repeated or avoided next run?"
        rows={5}
        data-testid="post-grow-lesson-textarea"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={onSave} disabled={busy} data-testid="post-grow-save-lesson">
          Save lesson
        </Button>
        <Button
          variant="outline"
          onClick={onApply}
          disabled={busy}
          data-testid="post-grow-apply-lesson"
          title="Creates a pending Action Queue item. It does not execute anything."
        >
          <ListChecks className="h-4 w-4 mr-1" /> Apply lesson to next grow
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to={actionsPath(vm.header.growId)}>Open Action Queue</Link>
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Apply creates a pending, approval-required Action Queue item only. No device command is sent.
      </p>
    </ReportCard>
  );
}

export function PhotoGridCard({ vm }: { vm: PostGrowLearningReportViewModel }) {
  return (
    <ReportCard title="Photo Grid" subtitle={`${REPORT_SECTION_LABELS.whatWasLogged} (photos)`} testId="post-grow-photo-grid">
      {vm.photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos found for this grow.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {vm.photos.map((photo) => (
            <figure key={photo.id} className="overflow-hidden rounded-xl border border-border/50 bg-secondary/20">
              <img src={photo.url} alt={photo.alt} className="aspect-square w-full object-cover" />
              <figcaption className="p-2 text-[10px] text-muted-foreground">
                Visual record · no AI analysis
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </ReportCard>
  );
}

export function ExportSummaryButtons({ vm }: { vm: PostGrowLearningReportViewModel }) {
  return (
    <div className="flex flex-col items-end gap-1" data-testid="post-grow-export-actions">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePrint(vm)}
          data-testid="post-grow-export-print"
        >
          <Printer className="h-4 w-4 mr-1" /> Print / Save PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadText(
              `post-grow-report-${vm.header.growId}.svg`,
              buildPostGrowReportImageSvg(vm),
              "image/svg+xml",
            )
          }
        >
          <ImageIcon className="h-4 w-4 mr-1" /> Export image
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            downloadText(
              `post-grow-report-${vm.header.growId}.txt`,
              buildPostGrowReportSummaryText(vm),
              "text/plain",
            )
          }
        >
          <Download className="h-4 w-4 mr-1" /> Summary text
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground" data-testid="post-grow-export-helper">
        {PRINT_HELPER_COPY}
      </p>
    </div>
  );
}

interface ReportCardProps {
  readonly title: string;
  readonly subtitle?: React.ReactNode;
  readonly testId: string;
  readonly children: React.ReactNode;
}

function ReportCard({ title, subtitle, testId, children }: ReportCardProps) {
  return (
    <section className="glass rounded-2xl p-4" data-testid={testId} aria-label={title}>
      <div className="mb-3">
        <h2 className="font-display font-semibold">{title}</h2>
        {subtitle ? (
          <p
            className="text-[11px] uppercase tracking-wide text-muted-foreground"
            data-testid={`${testId}-subtitle`}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-secondary/20 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-display">{value}</p>
    </div>
  );
}

function Sparkline({ points }: { points: Array<{ x: number; y: number }> }) {
  if (points.length === 0) {
    return <div className="mt-2 h-8 rounded bg-secondary/50" aria-label="No sparkline data" />;
  }
  const maxX = Math.max(...points.map((p) => p.x), 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(p.x / maxX) * 100},${32 - p.y * 28}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 36" className="mt-2 h-9 w-full" role="img" aria-label="Metric sparkline">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="3" className="text-primary" />
    </svg>
  );
}
