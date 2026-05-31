/**
 * Reports — Grow Learning Hub
 *
 * Read-only index page that brings together existing grow learning surfaces:
 *  - Action Outcome Learning
 *  - Recent Outcomes
 *  - Environment Alerts
 *  - Sensor Context / Recent Readings
 *  - Timeline Activity Summary
 *
 * SAFETY:
 *  - No writes. No automation. No device control. No ai-coach call.
 *  - All aggregation lives in `src/lib/reportsHubViewModel.ts`.
 *  - Copy is observational. Never claims an action fixed an issue.
 */
import { Link } from "react-router-dom";
import { LineChart, ArrowRight } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { useScopedGrow } from "@/hooks/useScopedGrow";
import { useGrows } from "@/store/grows";
import { useReportsHubData } from "@/hooks/useReportsHubData";
import {
  buildReportsHubSummary,
  REPORTS_HUB_EMPTY_COPY,
  REPORTS_HUB_SUBTITLE_COPY,
  type ReportsHubCard,
} from "@/lib/reportsHubViewModel";
import { buildReportsReviewQueue } from "@/lib/reportsHubReviewQueue";
import { LEARNING_GROUP_SAMPLE_THRESHOLD } from "@/lib/actionOutcomeLearningRules";
import ReportsReviewQueueSection from "@/components/ReportsReviewQueueSection";
import { buildReportsHubOnboarding } from "@/lib/reportsHubOnboarding";
import ReportsHubOnboardingSection from "@/components/ReportsHubOnboardingSection";
import { growDetailPath } from "@/lib/routes";

export default function Reports() {
  const { scopedGrow } = useScopedGrow();
  const { activeGrow, grows, loading: growsLoading } = useGrows();
  const grow = scopedGrow ?? activeGrow ?? null;
  const data = useReportsHubData(grow?.id ?? null);

  const summary = grow
    ? buildReportsHubSummary({
        growId: grow.id,
        growName: grow.name,
        outcomeSummary: data.outcomeSummary,
        outcomeLearning: data.outcomeLearning,
        alertsOpen: data.alertsOpen,
        alertsCritical: data.alertsCritical,
        alertsWarning: data.alertsWarning,
        latestSensorCapturedAt: data.latestSensorCapturedAt,
        recentSensorReadingCount: data.recentSensorReadingCount,
        diaryEntriesLast7d: data.diaryEntriesLast7d,
        diaryEntriesTotal: data.diaryEntriesTotal,
      })
    : null;

  const learningGroups = data.outcomeLearning?.groups ?? [];
  const lowSampleGroups = learningGroups.filter((g) => g.needs_more_data);
  const lowSampleSmallestCount = lowSampleGroups.length
    ? lowSampleGroups.reduce(
        (min, g) => Math.min(min, g.totals?.total ?? Infinity),
        Infinity,
      )
    : null;
  const reviewQueue = grow
    ? buildReportsReviewQueue({
        growId: grow.id,
        pendingOutcomeReviewCount: data.pendingOutcomeReviewCount,
        firstPendingActionId: data.firstPendingActionId,
        oldestPendingCompletedAt: data.oldestPendingCompletedAt,
        alertsOpen: data.alertsOpen,
        firstOpenAlertId: data.firstOpenAlertId,
        firstOpenAlertSeverity: data.firstOpenAlertSeverity,
        firstOpenAlertCreatedAt: data.firstOpenAlertCreatedAt,
        latestSensorCapturedAt: data.latestSensorCapturedAt,
        recentSensorReadingCount: data.recentSensorReadingCount,
        lowSampleLearningGroups: lowSampleGroups.length,
        lowSampleSmallestCount:
          lowSampleSmallestCount === Infinity ? null : lowSampleSmallestCount,
        lowSampleThreshold: LEARNING_GROUP_SAMPLE_THRESHOLD,
      })
    : { items: [], empty: true };



  const onboarding = buildReportsHubOnboarding({
    growId: grow?.id ?? null,
    diaryEntriesTotal: data.diaryEntriesTotal,
    recentSensorReadingCount: data.recentSensorReadingCount,
    latestSensorCapturedAt: data.latestSensorCapturedAt,
    outcomeTotal: data.outcomeSummary?.total ?? 0,
    alertsOpen: data.alertsOpen,
  });

  const hasNoGrow = !growsLoading && grows.length === 0;
  const showOnboarding =
    !hasNoGrow && grow !== null && data.status === "ready" && onboarding.visible;
  const showEmptyState =
    hasNoGrow ||
    (summary !== null &&
      data.status === "ready" &&
      summary.allEmpty &&
      !showOnboarding);

  return (
    <div className="max-w-4xl mx-auto" data-testid="reports-page">
      <PageHeader
        title="Grow Learning Hub"
        description={REPORTS_HUB_SUBTITLE_COPY}
        icon={<LineChart className="h-5 w-5" />}
      />

      {grow && (
        <div
          className="glass rounded-2xl px-4 py-2 mb-4 flex items-center justify-between text-xs gap-2 flex-wrap"
          aria-label="Reports grow scope"
        >
          <span className="text-muted-foreground">
            Showing reports for{" "}
            <span className="text-foreground font-medium">{grow.name}</span>
          </span>
          <Link to={growDetailPath(grow.id)} className="text-primary hover:underline">
            Open grow detail
          </Link>
        </div>
      )}

      {showOnboarding && (
        <ReportsHubOnboardingSection cards={onboarding.cards} />
      )}

      {!showEmptyState && summary && !reviewQueue.empty && (
        <ReportsReviewQueueSection items={reviewQueue.items} />
      )}

      {showEmptyState ? (
        <EmptyState
          icon={<LineChart className="h-6 w-6" />}
          title="No reports yet"
          description={REPORTS_HUB_EMPTY_COPY}
        />
      ) : summary ? (
        <section
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          aria-label="Grow learning report cards"
        >
          {summary.cards.map((card) => (
            <ReportsCard key={card.id} card={card} />
          ))}
        </section>
      ) : (
        <EmptyState
          icon={<LineChart className="h-6 w-6" />}
          title="Loading reports…"
          description="Gathering your grow learning data."
        />
      )}
    </div>
  );
}

function ReportsCard({ card }: { card: ReportsHubCard }) {
  return (
    <article
      className="glass rounded-2xl p-4 flex flex-col gap-2"
      aria-label={card.title}
      data-testid={`reports-card-${card.id}`}
    >
      <header>
        <h2 className="text-sm font-semibold">{card.title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
      </header>
      <p className="text-base font-display">{card.primaryStat}</p>
      {card.secondaryStats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {card.secondaryStats.map((s) => (
            <Badge key={s} variant="outline" className="text-[10px]">
              {s}
            </Badge>
          ))}
        </div>
      )}
      {card.caveat && (
        <p className="text-[11px] text-muted-foreground">{card.caveat}</p>
      )}
      <div className="mt-auto pt-2">
        <Link
          to={card.href}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          data-testid={`reports-card-link-${card.id}`}
        >
          {card.hrefLabel}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}
