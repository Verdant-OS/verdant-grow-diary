/**
 * PostGrowLearningReport — Phase 1 on-demand post-grow report.
 *
 * Presenter-only UI. All aggregation is delegated to pure lib rules; all data
 * access is in usePostGrowLearningReportData. No AI generation, no automation,
 * no device control, and no schema changes.
 */
import { useEffect, useMemo, useState } from "react";
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
  PostGrowReportActionSafetyNote,
  PostGrowReportHeaderHelper,
  PostGrowReportTopSummaryPanel,
  PostHarvestPerformanceCard,
} from "@/components/PostGrowLearningReportCards";
import { usePostGrowLearningReportData } from "@/hooks/usePostGrowLearningReportData";
import { usePlantMemoryEpisodes } from "@/hooks/usePlantMemoryEpisodes";
import { buildPostGrowLearningLoopSummary } from "@/lib/postGrowLearningLoopSummaryRules";
import { growDetailPath } from "@/lib/routes";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { checkPremiumExportEntitlement } from "@/hooks/usePremiumExportServerGate";
import PaywallCta from "@/components/PaywallCta";
import { buildPaywallCtaViewModel } from "@/lib/paywallCtaViewModel";

function resultMessage(result: unknown, fallback: string): string {
  if (typeof result !== "object" || result === null || !("message" in result)) return fallback;
  const message = (result as { message?: unknown }).message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

export default function PostGrowLearningReport() {
  const { growId } = useParams<{ growId: string }>();
  const { status, report, error, saveLesson, applyLessonToNextGrow } =
    usePostGrowLearningReportData(growId);
  const { state: episodesState } = usePlantMemoryEpisodes({
    growId: growId ?? null,
    includeSensorEvidence: true,
  });
  const learningSummary = useMemo(
    () =>
      episodesState.status === "ok"
        ? buildPostGrowLearningLoopSummary(episodesState.episodes)
        : undefined,
    [episodesState],
  );
  const [lesson, setLesson] = useState("");
  const [busy, setBusy] = useState(false);

  // Pro gate. Pricing has always sold this report as Pro-only; the page
  // now enforces it: client hint avoids a content flash, and the
  // fail-closed `post_grow_report` server check is authoritative.
  const { entitlement, loading: entitlementLoading } = useMyEntitlements();
  const clientIsPremium = entitlement.capabilities.advancedExports === true;
  const [gateStatus, setGateStatus] = useState<"loading" | "allowed" | "denied" | "error">(
    "loading",
  );
  useEffect(() => {
    let cancelled = false;
    if (!growId) return;
    setGateStatus("loading");
    checkPremiumExportEntitlement("post_grow_report", { growId }).then((res) => {
      if (cancelled) return;
      if (res.ok) setGateStatus("allowed");
      else if (res.state === "network_error") setGateStatus("error");
      else setGateStatus("denied");
    });
    return () => {
      cancelled = true;
    };
  }, [growId]);

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

  const serverDecided = gateStatus !== "loading";
  const showLocked = serverDecided
    ? gateStatus !== "allowed"
    : // While the server decides, the non-authoritative client hint
      // prevents a flash of report content for free users.
      !entitlementLoading && !clientIsPremium;

  if (showLocked) {
    const paywallVm = buildPaywallCtaViewModel({
      featureTitle: "Unlock the Post-Grow Learning Report",
      requiredPlanLabel: "Pro",
    });
    return (
      <div
        className="mx-auto max-w-5xl"
        data-testid="post-grow-report-locked"
        data-server-gate-status={gateStatus}
      >
        <PageHeader
          title="Post-Grow Learning Report"
          description="Plant memory, sensor truth, and lessons for the next run."
          icon={<Leaf className="h-5 w-5" />}
        />
        <p
          className="text-sm text-muted-foreground mb-4"
          data-testid="post-grow-report-gate-message"
        >
          {gateStatus === "error"
            ? "The report entitlement check did not complete. Nothing was generated."
            : "The Post-Grow Learning Report is a Pro feature."}
        </p>
        <PaywallCta vm={paywallVm} data-testid="post-grow-report-paywall" />
      </div>
    );
  }

  if (status === "loading" || status === "idle" || gateStatus === "loading") {
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
          description={
            report.ineligibleReason ?? "Archive or complete this grow before generating a report."
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl pb-10" data-testid="post-grow-report-page">
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to={growDetailPath(report.header.growId)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to grow
        </Link>
      </Button>

      <div className="glass rounded-3xl p-4 sm:p-6 mb-4 border-primary/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <PageHeader
            title="Post-Grow Learning Report"
            description="Plant memory, sensor truth, and lessons for the next run."
            icon={<Leaf className="h-5 w-5" />}
          />
          <ExportSummaryButtons vm={report} learningSummary={learningSummary} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{report.header.growName}</Badge>
          <Badge variant="outline">{report.header.stageLabel}</Badge>
          {report.header.archived && <Badge variant="outline">Archived</Badge>}
          {report.header.yieldGrams !== null && (
            <Badge variant="outline">Yield {report.header.yieldGrams.toFixed(1)} g</Badge>
          )}
        </div>
        <div className="mt-3">
          <PostGrowReportHeaderHelper />
        </div>
      </div>

      <div className="mb-4">
        <PostGrowReportTopSummaryPanel vm={report} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] gap-4 mb-4">
        <PostGrowExecutiveSummaryCard vm={report} />
        <DataCompletenessBadge vm={report} />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <EnvironmentStabilityCard
          metrics={report.environment}
          sensorSourceKinds={report.sensorReadingSources.map((r) => r.source)}
        />
        <PostHarvestPerformanceCard vm={report} />
        <ActionEffectivenessCard vm={report} />
        <LessonsCard
          vm={report}
          lesson={lesson}
          onLessonChange={setLesson}
          onSave={handleSaveLesson}
          onApply={handleApplyLesson}
          busy={busy}
        />
        <PhotoGridCard vm={report} />
      </div>

      <div className="mt-4">
        <PostGrowReportActionSafetyNote />
      </div>
    </div>
  );
}
