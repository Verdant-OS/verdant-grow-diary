/**
 * LinkedActionCountBadge — read-only presenter for "Has linked action" /
 * "N linked actions" affordance shared by Alerts Index and Alert Detail.
 *
 * Safety:
 *  - Presenter only. No I/O, no mutations.
 *  - Renders nothing when there are no open linked actions.
 *  - Never exposes raw `[alert:<id>]` / `[session:<id>]` tokens — receives
 *    only the parsed count + optional single action id from the shared
 *    pure view-model helper.
 *  - Copy intentionally avoids automation/execution/transition verbs.
 */
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { actionDetailPath, actionQueueAlertContextPath } from "@/lib/routes";
import type { AlertLinkedActionsSummary } from "@/lib/alertsLinkedActionsViewModel";

export interface LinkedActionCountBadgeProps {
  alertId: string;
  summary: AlertLinkedActionsSummary | undefined;
  growId?: string | null;
  /** Test id namespace, e.g. "alert-row" or "alert-detail". */
  testIdPrefix?: string;
}

export function LinkedActionCountBadge({
  alertId,
  summary,
  growId,
  testIdPrefix = "alert-row",
}: LinkedActionCountBadgeProps) {
  if (!summary || summary.count <= 0) return null;
  const isSingle = summary.count === 1 && summary.singleActionId;
  const label =
    summary.count === 1
      ? "Has linked action"
      : `${summary.count} linked actions`;
  const containerTestId = `${testIdPrefix}-linked-action`;
  const anchorTestId = `${testIdPrefix}-linked-action-anchor`;
  return (
    <div
      data-testid={containerTestId}
      data-alert-id={alertId}
      className="flex items-center gap-2 flex-wrap"
    >
      <Badge
        variant="outline"
        className="text-[10px] uppercase border-primary text-primary"
      >
        {label}
      </Badge>
      {isSingle ? (
        <Link
          data-testid={anchorTestId}
          to={actionDetailPath(summary.singleActionId as string)}
          className="text-[11px] text-primary hover:underline"
        >
          View linked action
        </Link>
      ) : (
        <Link
          data-testid={anchorTestId}
          to={actionsPath(growId ?? undefined)}
          className="text-[11px] text-primary hover:underline"
        >
          View linked actions
        </Link>
      )}
    </div>
  );
}
