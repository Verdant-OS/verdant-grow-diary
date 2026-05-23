/**
 * Render-only panel: pending-approval action_queue items for the plant's
 * assigned tent.
 *
 * Reads from `public.action_queue` via `usePlantAssignedTentActions` (RLS-
 * scoped) and filters in the pure rules layer. No writes. No approve /
 * reject / execute. Recommendations and risk are never invented — only
 * fields already stored render.
 */
import { Link } from "react-router-dom";
import { ArrowRight, ListTodo } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { usePlantAssignedTentActions } from "@/hooks/usePlantAssignedTentActions";
import type { PlantAssignedTentActionRow } from "@/lib/plantAssignedTentActionRules";

interface Props {
  tentId: string | null | undefined;
  tentName?: string | null;
  growId: string | null | undefined;
}

function riskClass(risk: string | null): string {
  switch (risk) {
    case "critical":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "high":
      return "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30";
    case "medium":
      return "bg-[hsl(var(--info))]/15 text-[hsl(var(--info))] border-[hsl(var(--info))]/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function fmt(ts: string | null): string {
  if (!ts) return "";
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return "";
  return formatDistanceToNow(new Date(t), { addSuffix: true });
}

function ActionRowItem({ row }: { row: PlantAssignedTentActionRow }) {
  return (
    <li
      className="rounded-lg border bg-card/40 p-3 text-sm"
      data-testid="plant-assigned-tent-action-row"
      data-action-id={row.id}
      data-status={row.status}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="secondary"
            className="capitalize"
            data-testid="plant-assigned-tent-action-status"
          >
            Pending approval
          </Badge>
          {row.riskLevel ? (
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${riskClass(row.riskLevel)}`}
              data-testid="plant-assigned-tent-action-risk"
            >
              {row.riskLevel}
            </span>
          ) : null}
          {row.source ? (
            <Badge
              variant="outline"
              className="text-[11px]"
              data-testid="plant-assigned-tent-action-source"
            >
              {row.source}
            </Badge>
          ) : null}
          {row.targetMetric ? (
            <Badge
              variant="outline"
              className="capitalize"
              data-testid="plant-assigned-tent-action-metric"
            >
              {row.targetMetric}
            </Badge>
          ) : null}
        </div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1"
          data-testid="plant-assigned-tent-action-view"
        >
          <Link to={`/actions/${row.id}`}>
            View Action <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      {row.suggestedChange ? (
        <p className="mt-2 font-medium leading-snug">{row.suggestedChange}</p>
      ) : null}
      {row.reason ? (
        <p className="mt-1 text-xs text-muted-foreground leading-snug">
          {row.reason}
        </p>
      ) : null}
      {row.createdAt ? (
        <p
          className="mt-1 text-[11px] text-muted-foreground"
          data-testid="plant-assigned-tent-action-timestamp"
        >
          Created {fmt(row.createdAt)}
        </p>
      ) : null}
    </li>
  );
}

export default function PlantAssignedTentActionsPanel({
  tentId,
  tentName,
  growId,
}: Props) {
  const enabled = !!tentId;
  const { rows, isLoading, isError } = usePlantAssignedTentActions(
    tentId ?? null,
    growId ?? null,
  );

  return (
    <Card data-testid="plant-assigned-tent-actions-panel" className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <ListTodo className="h-4 w-4" /> Assigned Tent Action Queue
          {tentName ? (
            <span className="text-xs font-normal text-muted-foreground">
              · {tentName}
            </span>
          ) : null}
        </CardTitle>
        {enabled ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1"
            data-testid="plant-assigned-tent-actions-open-queue"
          >
            <Link to="/actions">
              Open Action Queue <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="text-sm">
        {!enabled ? (
          <p
            className="text-muted-foreground"
            data-testid="plant-assigned-tent-actions-empty-no-tent"
          >
            Assign this plant to a tent to see pending actions.
          </p>
        ) : isLoading ? (
          <p className="text-muted-foreground">Loading pending actions…</p>
        ) : isError ? (
          <p
            className="text-muted-foreground"
            data-testid="plant-assigned-tent-actions-unavailable"
          >
            Pending actions are temporarily unavailable.
          </p>
        ) : rows.length === 0 ? (
          <p
            className="text-muted-foreground"
            data-testid="plant-assigned-tent-actions-empty"
          >
            No pending actions for this assigned tent.
          </p>
        ) : (
          <ul
            className="space-y-2"
            data-testid="plant-assigned-tent-actions-list"
          >
            {rows.map((r) => (
              <ActionRowItem key={r.id} row={r} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
