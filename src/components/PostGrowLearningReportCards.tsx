import { Download, Image as ImageIcon, ListChecks, Printer } from "lucide-react";
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

export function DataCompletenessBadge({ vm }: { vm: PostGrowLearningReportViewModel }) {
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
  return (
    <ReportCard title="Executive Summary" testId="post-grow-executive-summary">
      <ul className="space-y-2 text-sm">
        {vm.executiveSummary.map((line) => (
          <li key={line} className="text-muted-foreground">
            {line}
          </li>
        ))}
      </ul>
    </ReportCard>
  );
}

export function EnvironmentStabilityCard({ metrics }: { metrics: MetricAggregateView[] }) {
  return (
    <ReportCard title="Environment Stability" testId="post-grow-environment-stability">
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
    <ReportCard title="Post-Harvest Performance" testId="post-grow-post-harvest">
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
    <ReportCard title="Action Effectiveness" testId="post-grow-action-effectiveness">
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
    <ReportCard title="My Lessons & Notes" testId="post-grow-lessons">
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
    <ReportCard title="Photo Grid" testId="post-grow-photo-grid">
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

function ReportCard({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-2xl p-4" data-testid={testId} aria-label={title}>
      <h2 className="font-display font-semibold mb-3">{title}</h2>
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
