import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildSubscriberGrowthSprintBoard,
  type SubscriberGrowthSprintPriority,
  type SubscriberGrowthSprintStatus,
} from "@/lib/subscriberGrowthSprintRules";
import type {
  SubscriberGrowthCounts,
  SubscriberGrowthProgress,
} from "@/lib/subscriberGrowthSnapshotRules";
import type { SignupAcquisitionCounts } from "@/lib/signupAcquisitionSnapshotRules";

export interface SubscriberGrowthSprintBoardProps {
  progress: SubscriberGrowthProgress;
  counts: SubscriberGrowthCounts;
  acquisitionCounts?: SignupAcquisitionCounts | null;
}

const STATUS_VARIANT: Readonly<
  Record<SubscriberGrowthSprintStatus, "default" | "destructive" | "outline" | "secondary">
> = Object.freeze({
  goal_reached: "default",
  deadline_passed: "destructive",
  on_pace: "secondary",
  behind_pace: "destructive",
});

const PRIORITY_VARIANT: Readonly<
  Record<SubscriberGrowthSprintPriority, "destructive" | "outline" | "secondary">
> = Object.freeze({
  urgent: "destructive",
  high: "secondary",
  normal: "outline",
});

function SprintMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** Read-only presenter. All pacing and action priority logic lives in the pure rules module. */
export default function SubscriberGrowthSprintBoard({
  progress,
  counts,
  acquisitionCounts,
}: SubscriberGrowthSprintBoardProps) {
  const board = buildSubscriberGrowthSprintBoard({ progress, counts, acquisitionCounts });

  return (
    <Card data-testid="subscriber-growth-sprint-board">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Next 7-day subscriber sprint</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">{board.summary}</CardDescription>
          </div>
          <Badge
            data-testid="subscriber-growth-sprint-status"
            data-status={board.status}
            variant={STATUS_VARIANT[board.status]}
          >
            {board.statusLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <SprintMetric
          label={
            board.windowDays > 0 ? `Paid needed — next ${board.windowDays}d` : "Paid still needed"
          }
          value={board.requiredPaidNextWindow}
        />
        <SprintMetric label="Paid added — last 7d" value={board.observedPaid7d} />
        <SprintMetric
          label="Account starts — last 7d"
          value={board.accounts7d === null ? "Unavailable" : board.accounts7d}
        />
        <SprintMetric label="Interest signals — last 7d" value={board.interest7d} />
        <SprintMetric label="Due follow-ups — now" value={board.followUpDue} />
        <SprintMetric label="Paid at risk" value={board.atRisk} />
      </CardContent>

      <CardContent className="border-t border-border/60 pt-6">
        <h3 className="text-sm font-semibold">Operator action order</h3>
        <ol className="mt-3 space-y-3">
          {board.actions.map((action) => (
            <li
              key={action.id}
              data-testid="subscriber-growth-sprint-action"
              data-action-id={action.id}
              data-priority={action.priority}
              className="flex flex-col gap-3 rounded-lg border border-border/50 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={PRIORITY_VARIANT[action.priority]}>{action.priority}</Badge>
                  <span className="font-semibold">{action.title}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
              </div>
              <Button asChild type="button" variant="outline" className="shrink-0">
                <Link to={action.href}>{action.ctaLabel}</Link>
              </Button>
            </li>
          ))}
        </ol>
        <p
          className="mt-4 text-xs text-muted-foreground"
          data-testid="subscriber-growth-sprint-comparison-note"
        >
          {board.comparisonNote}
        </p>
      </CardContent>
    </Card>
  );
}
