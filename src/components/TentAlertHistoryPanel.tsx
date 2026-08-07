/**
 * TentAlertHistoryPanel — Pro presenter for closed tent alerts.
 *
 * Surfaces resolved/dismissed rows already loaded with open alerts
 * ("what went wrong in this tent, and how it closed"). No new network
 * reads when parent passes historyRows; no schema; no invented fix
 * narratives; no writes; no Action Queue.
 *
 * Gated with `canUseFeature(..., "tent_alert_history")` — same Pro-plan
 * presentation class as pheno tracker / advanced timeline filters.
 */
import { Link } from "@/lib/react-router-compat";
import { ArrowRight, History, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { usePlantAssignedTentAlerts } from "@/hooks/usePlantAssignedTentAlerts";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { canUseFeature, canReadExistingFeatureData } from "@/lib/featureEntitlements";
import {
  tentAlertHistoryClosureLabel,
  type PlantAssignedTentAlertRow,
} from "@/lib/plantAssignedTentAlertRules";
import { alertsPath } from "@/lib/routes";

export interface TentAlertHistoryPanelProps {
  tentId: string | null | undefined;
  tentName?: string | null;
  growId: string | null | undefined;
  /** Shared payload from parent open-alerts fetch — avoids a second listAlerts. */
  historyRows?: PlantAssignedTentAlertRow[];
  listStatus?: ReturnType<typeof usePlantAssignedTentAlerts>["status"];
}

function fmt(ts: string | null): string {
  if (!ts) return "";
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return "";
  return formatDistanceToNow(new Date(t), { addSuffix: true });
}

function HistoryRow({ row }: { row: PlantAssignedTentAlertRow }) {
  const closedAt = row.resolvedAt || row.lastSeenAt || row.firstSeenAt;
  return (
    <li
      className="rounded-lg border bg-card/40 p-3 text-sm"
      data-testid="tent-alert-history-row"
      data-alert-id={row.id}
      data-status={row.status}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className="capitalize"
            data-testid="tent-alert-history-closure"
          >
            {tentAlertHistoryClosureLabel(row.status)}
          </Badge>
          {row.metric ? (
            <Badge variant="outline" className="capitalize" data-testid="tent-alert-history-metric">
              {row.metric}
            </Badge>
          ) : null}
          <span className="text-[11px] text-muted-foreground capitalize">{row.severityLabel}</span>
        </div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1"
          data-testid="tent-alert-history-view"
        >
          <Link to={`/alerts/${row.id}`}>
            View <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      <p className="mt-2 font-medium leading-snug" data-testid="tent-alert-history-title">
        {row.title}
      </p>
      {row.reason ? (
        <p className="mt-1 text-xs text-muted-foreground leading-snug">{row.reason}</p>
      ) : null}
      {closedAt ? (
        <p
          className="mt-1 text-[11px] text-muted-foreground"
          data-testid="tent-alert-history-timestamp"
        >
          {row.status === "resolved" ? "Resolved" : "Closed"} {fmt(closedAt)}
        </p>
      ) : null}
    </li>
  );
}

function UpgradeTeaser({ tentName }: { tentName?: string | null }) {
  return (
    <div
      className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-4 text-sm"
      data-testid="tent-alert-history-upgrade"
    >
      <div className="flex items-start gap-2">
        <Lock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div>
          <p className="font-medium">Tent alert history is a Pro surface</p>
          <p className="mt-1 text-xs text-muted-foreground leading-snug">
            See what went wrong in{tentName ? ` ${tentName}` : " this tent"} and how each alert
            closed — resolved or dismissed — without inventing a fix story.
          </p>
          <Button asChild size="sm" className="mt-3" data-testid="tent-alert-history-upgrade-cta">
            <Link to="/pricing?plan=pro_annual">Upgrade to Pro</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TentAlertHistoryPanel({
  tentId,
  tentName,
  growId,
  historyRows: historyRowsProp,
  listStatus: listStatusProp,
}: TentAlertHistoryPanelProps) {
  const enabled = !!tentId;
  const { entitlement, loading: entLoading, lookupFailed } = useMyEntitlements();
  const unlocked =
    !lookupFailed &&
    (canUseFeature(entitlement, "tent_alert_history") ||
      canReadExistingFeatureData(entitlement, "tent_alert_history"));

  // Self-fetch only when unlocked and parent did not share the payload.
  const shouldSelfFetch = unlocked && historyRowsProp === undefined && enabled;
  const self = usePlantAssignedTentAlerts(
    shouldSelfFetch ? tentId : null,
    shouldSelfFetch ? growId : null,
    undefined,
    undefined,
    { enabled: shouldSelfFetch },
  );
  const historyRows = historyRowsProp ?? self.historyRows;
  const listStatus = listStatusProp ?? self.status;

  return (
    <Card data-testid="tent-alert-history-panel" className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" /> Tent alert history
          {tentName ? (
            <span className="text-xs font-normal text-muted-foreground">· {tentName}</span>
          ) : null}
          <Badge variant="outline" className="text-[10px] font-normal">
            Pro
          </Badge>
        </CardTitle>
        {enabled && unlocked ? (
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 gap-1">
            <Link to={alertsPath()}>
              All alerts <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="text-sm">
        {!enabled ? (
          <p className="text-muted-foreground" data-testid="tent-alert-history-empty-no-tent">
            Assign a tent to review closed alert history.
          </p>
        ) : entLoading ? (
          <p className="text-muted-foreground">Checking plan…</p>
        ) : lookupFailed ? (
          <p className="text-muted-foreground" data-testid="tent-alert-history-plan-unavailable">
            Plan check unavailable. Your alerts are unchanged.
          </p>
        ) : !unlocked ? (
          <UpgradeTeaser tentName={tentName} />
        ) : listStatus === "loading" || listStatus === "idle" ? (
          <p className="text-muted-foreground">Loading history…</p>
        ) : listStatus === "unavailable" ? (
          <p className="text-muted-foreground" data-testid="tent-alert-history-unavailable">
            Alert history is temporarily unavailable.
          </p>
        ) : historyRows.length === 0 ? (
          <p className="text-muted-foreground" data-testid="tent-alert-history-empty">
            No resolved or dismissed alerts for this tent yet.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="tent-alert-history-list">
            {historyRows.map((r) => (
              <HistoryRow key={r.id} row={r} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
