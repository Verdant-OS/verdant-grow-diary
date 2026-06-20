/**
 * PostGrowLearningReport — Phase 1 on-demand post-grow report.
 *
 * Presenter-only UI. All aggregation is delegated to pure lib rules; all data
 * access is in usePostGrowLearningReportData. No AI generation, no automation,
 * no device control, and no schema changes.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Leaf, Loader2 } from "lucide-react";
import { toast } from "sonner";

import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ActionEffectivenessCard,
  DataCompletenessBadge,
  EnvironmentStabilityCard,
  ExportSummaryButtons,
  LessonsCard,
  PhotoGridCard,
  PostGrowExecutiveSummaryCard,
  PostHarvestPerformanceCard,
} from "@/components/PostGrowLearningReportCards";
import { usePostGrowLearningReportData } from "@/hooks/usePostGrowLearningReportData";
import { growDetailPath } from "@/lib/routes";

function resultMessage(result: { message?: string }, fallback: string): string {
  return typeof result.message === "string" && result.message.length > 0 ? result.message : fallback;
}

export default function PostGrowLearningReport() {
  const { growId } = useParams<{ growId: string }>();
  const { status, report, error, saveLesson, applyLessonToNextGrow } =
    usePostGrowLearningReportData(growId);
  const [lesson, setLesson] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (report) setLesson(report.lesson.text);
  }, [report?.lesson.entryId, report?.lesson.text]);

  async function handleSaveLesson() {
    setBusy(true);
    const result = await saveLesson(lesson);
    setBusy(false);
    if (result.ok) toast.success("Lesson saved");
    else toast.error(resultMessage(result, "Lesson could not be saved."));
  }

  async function handleApplyLesson() {
    setBusy(true);
    const result = await applyLessonToNextGrow(lesson);
    setBusy(false);
    if (result.ok) toast.success("Added to Action Queue for review");
    else toast.error(resultMessage(result, "Lesson could not be added to the Action Queue."));
  }

  if (status === "loading" || status === "idle") {
    return (
      <div className="mx-auto max-w-5xl" data-testid="post-grow-report-loading">
        <EmptyState
          icon={<Loader2 className="h-6 w-6 animate-spin" />}
          title="Building post-grow report…"
          description="Collecting plant memory, sensor aggregates, harvest notes, and photos."
        />
      </div>
    );
  }

  if (status === "unavailable" || !report) {
    return (
      <div className="mx-auto max-w-5xl" data-testid="post-grow-report-error">
        <EmptyState
          icon={<Leaf className="h-6 w-6" />}
          title="Report unavailable"
          description={error ?? "This grow report could not be loaded."}
        />
      </div>
    );
  }

  if (!report.eligible) {
    return (
      <div className="mx-auto max-w-5xl" data-testid="post-grow-report-ineligible">
        <Button asChild variant="ghost" size="sm" className="mb-3">
          <Link to={growDetailPath(report.header.growId)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to grow
          </Link>
        </Button>
        <EmptyState
          icon={<Leaf className="h-6 w-6" />}
          title="Post-grow report not ready"
          description="Reports are available once a grow is completed, drying, or archived."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6" data-testid="post-grow-learning-report">
      <Button asChild variant="ghost" size="sm">
        <Link to={growDetailPath(report.header.growId)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to grow
        </Link>
      </Button>

      <PageHeader
        title="Post-Grow Learning Report"
        description={`${report.header.growName} • ${report.header.status} • ${report.header.plantCount} plants`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Completed grow</Badge>
        <DataCompletenessBadge badge={report.dataCompleteness} />
      </div>

      <PostGrowExecutiveSummaryCard summary={report.executiveSummary} />

      <div className="grid gap-4 lg:grid-cols-2">
        <EnvironmentStabilityCard stability={report.environmentStability} />
        <PostHarvestPerformanceCard performance={report.postHarvestPerformance} />
      </div>

      <ActionEffectivenessCard summary={report.actionEffectiveness} />
      <LessonsCard
        lesson={lesson}
        onLessonChange={setLesson}
        onSave={handleSaveLesson}
        onApply={handleApplyLesson}
        busy={busy}
        canApply={lesson.trim().length > 0}
      />
      <PhotoGridCard photos={report.photos} />
      <ExportSummaryButtons report={report} />
    </div>
  );
}
