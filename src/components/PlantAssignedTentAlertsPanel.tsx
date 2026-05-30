/**
 * Render-only panel: open alerts for the plant's assigned tent.
 *
 * Reads from `public.alerts` via `useAlertsList` (RLS-scoped) and filters in
 * the pure rules layer. No writes. No action_queue handoff from this panel.
 * Recommendations are never invented — only fields already stored render.
 */
import { Link } from "react-router-dom";
import { ArrowRight, Bell, AlertCircle, AlertTriangle, Info, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { usePlantAssignedTentAlerts } from "@/hooks/usePlantAssignedTentAlerts";
import type { PlantAssignedTentAlertRow } from "@/lib/plantAssignedTentAlertRules";
import { alertsPath } from "@/lib/routes";

interface Props {
  tentId: string | null | undefined;
  tentName?: string | null;
  growId: string | null | undefined;
}

function severityClass(sev: PlantAssignedTentAlertRow["severity"]): string {
  switch (sev) {
    case "critical":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "warning":
      return "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30";
    case "watch":
      return "bg-[hsl(var(--info))]/15 text-[hsl(var(--info))] border-[hsl(var(--info))]/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function SeverityIcon({ sev }: { sev: PlantAssignedTentAlertRow["severity"] }) {
  if (sev === "critical") return <AlertCircle className="h-3 w-3" />;
  if (sev === "warning") return <AlertTriangle className="h-3 w-3" />;
  if (sev === "watch") return <Eye className="h-3 w-3" />;
  return <Info className="h-3 w-3" />;
}

function fmt(ts: string | null): string {
  if (!ts) return "";
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return "";
  return formatDistanceToNow(new Date(t), { addSuffix: true });
}

function AlertRowItem({ row }: { row: PlantAssignedTentAlertRow }) {
  return (
    <li
      className="rounded-lg border bg-card/40 p-3 text-sm"
      data-testid="plant-assigned-tent-alert-row"
      data-alert-id={row.id}
      data-severity={row.severity}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityClass(row.severity)}`}
            data-testid="plant-assigned-tent-alert-severity"
          >
            <SeverityIcon sev={row.severity} />
            {row.severityLabel}
          </span>
          {row.metric ? (
            <Badge variant="outline" className="capitalize" data-testid="plant-assigned-tent-alert-metric">
              {row.metric}
            </Badge>
          ) : null}
          <Badge variant="secondary" className="capitalize" data-testid="plant-assigned-tent-alert-status">
            {row.status}
          </Badge>
        </div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1"
          data-testid="plant-assigned-tent-alert-view"
        >
          <Link to={`/alerts/${row.id}`}>
            View Alert <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      <p className="mt-2 font-medium leading-snug">{row.title}</p>
      {row.reason ? (
        <p className="mt-1 text-xs text-muted-foreground leading-snug">{row.reason}</p>
      ) : null}
      {row.lastSeenAt ? (
        <p
          className="mt-1 text-[11px] text-muted-foreground"
          data-testid="plant-assigned-tent-alert-timestamp"
        >
          Last seen {fmt(row.lastSeenAt)}
        </p>
      ) : null}
    </li>
  );
}

export default function PlantAssignedTentAlertsPanel({ tentId, tentName, growId }: Props) {
  const enabled = !!tentId;
  const { status, rows } = usePlantAssignedTentAlerts(
    tentId ?? null,
    growId ?? null,
  );

  return (
    <Card data-testid="plant-assigned-tent-alerts-panel" className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" /> Tent Alerts
          {tentName ? (
            <span className="text-xs font-normal text-muted-foreground">· {tentName}</span>
          ) : null}
        </CardTitle>
        {enabled ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1"
            data-testid="plant-assigned-tent-alerts-open-alerts"
          >
            <Link to="/alerts">
              Open Alerts <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="text-sm">
        {!enabled ? (
          <p
            className="text-muted-foreground"
            data-testid="plant-assigned-tent-alerts-empty-no-tent"
          >
            Assign this plant to a tent to see tent alerts.
          </p>
        ) : status === "loading" || status === "idle" ? (
          <p className="text-muted-foreground">Loading tent alerts…</p>
        ) : status === "unavailable" ? (
          <p
            className="text-muted-foreground"
            data-testid="plant-assigned-tent-alerts-unavailable"
          >
            Tent alerts are temporarily unavailable.
          </p>
        ) : rows.length === 0 ? (
          <p
            className="text-muted-foreground"
            data-testid="plant-assigned-tent-alerts-empty"
          >
            No open alerts for this assigned tent.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="plant-assigned-tent-alerts-list">
            {rows.map((r) => (
              <AlertRowItem key={r.id} row={r} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
