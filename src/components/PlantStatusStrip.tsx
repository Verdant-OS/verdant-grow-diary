/**
 * Render-only "status at a glance" strip for Plant Detail.
 *
 * Surfaces the four signals growers want to see first on mobile:
 *   1. Assigned tent (or "No tent")
 *   2. Current environment freshness / source (live / manual / stale)
 *   3. Open alert count for the assigned tent
 *   4. Pending task count for the assigned tent
 *
 * Pulls from the SAME read-only hooks the panels below already use, so this
 * never invents telemetry or counts. Missing data renders as "Unknown" — it
 * is never silently zero-filled.
 *
 * No writes. No automation. No device strings. No new queries beyond what the
 * existing panels would issue anyway (React Query dedupes by key).
 */
import { Link } from "react-router-dom";
import { AlertTriangle, Bell, Box, Gauge, ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { usePlantTentLatestReadings } from "@/hooks/usePlantTentLatestReadings";
import { buildPlantTentEnvironmentView } from "@/lib/plantTentEnvironmentRules";
import { usePlantAssignedTentAlerts } from "@/hooks/usePlantAssignedTentAlerts";
import { usePlantAssignedTentActions } from "@/hooks/usePlantAssignedTentActions";

interface Props {
  tentId: string | null | undefined;
  tentName?: string | null;
  growId: string | null | undefined;
}

export default function PlantStatusStrip({ tentId, tentName, growId }: Props) {
  const hasTent = !!tentId;
  const { data: readings, isLoading: envLoading } = usePlantTentLatestReadings(
    hasTent ? tentId ?? null : null,
  );
  const env = buildPlantTentEnvironmentView(hasTent ? readings ?? [] : []);

  const { rows: alertRows, status: alertStatus } = usePlantAssignedTentAlerts(
    hasTent ? tentId ?? null : null,
    growId ?? null,
  );
  const { rows: actionRows, isLoading: actionsLoading } =
    usePlantAssignedTentActions(
      hasTent ? tentId ?? null : null,
      growId ?? null,
    );

  const envKnown = hasTent && !envLoading && env.hasReadings;
  const envLabel = !hasTent
    ? "No tent"
    : envLoading
      ? "Loading…"
      : !env.hasReadings
        ? "Unknown"
        : env.stale
          ? `Stale${env.sourceLabel ? ` · ${env.sourceLabel}` : ""}`
          : env.sourceLabel ?? "Live";

  const alertsKnown = hasTent && alertStatus === "ok";
  const alertCount = alertsKnown ? alertRows.length : null;
  const actionsKnown = hasTent && !actionsLoading;
  const actionCount = actionsKnown ? actionRows.length : null;

  return (
    <div
      className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2"
      data-testid="plant-status-strip"
    >
      {/* Tent */}
      {hasTent && tentId ? (
        <Link
          to={`/tents/${tentId}`}
          className="rounded-lg border bg-card/40 p-2.5 hover:bg-card/70 transition"
          data-testid="plant-status-tent"
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Box className="h-3 w-3" /> Tent
          </div>
          <div className="text-sm font-medium truncate mt-0.5">
            {tentName ?? "Assigned"}
          </div>
        </Link>
      ) : (
        <div
          className="rounded-lg border bg-card/40 p-2.5"
          data-testid="plant-status-tent"
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Box className="h-3 w-3" /> Tent
          </div>
          <div className="text-sm font-medium mt-0.5 flex items-center gap-1 text-[hsl(var(--warning))]">
            <AlertTriangle className="h-3 w-3" /> No tent
          </div>
        </div>
      )}

      {/* Environment */}
      <div
        className="rounded-lg border bg-card/40 p-2.5"
        data-testid="plant-status-environment"
        data-known={String(envKnown)}
        data-stale={String(env.stale)}
      >
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Gauge className="h-3 w-3" /> Environment
        </div>
        <div
          className={`text-sm font-medium mt-0.5 truncate ${
            env.stale ? "text-[hsl(var(--warning))]" : ""
          }`}
        >
          {envLabel}
        </div>
      </div>

      {/* Open alerts */}
      <div
        className="rounded-lg border bg-card/40 p-2.5"
        data-testid="plant-status-alerts"
        data-count={alertCount ?? "unknown"}
      >
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Bell className="h-3 w-3" /> Open Alerts
        </div>
        <div className="text-sm font-medium mt-0.5 flex items-center gap-2">
          {!hasTent ? (
            <span className="text-muted-foreground">—</span>
          ) : !alertsKnown ? (
            <span className="text-muted-foreground">Unknown</span>
          ) : alertCount === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            <Badge
              variant="secondary"
              className="bg-destructive/15 text-destructive border-destructive/30"
            >
              {alertCount}
            </Badge>
          )}
        </div>
      </div>

      {/* Pending tasks */}
      <div
        className="rounded-lg border bg-card/40 p-2.5"
        data-testid="plant-status-tasks"
        data-count={actionCount ?? "unknown"}
      >
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <ListTodo className="h-3 w-3" /> Pending Tasks
        </div>
        <div className="text-sm font-medium mt-0.5 flex items-center gap-2">
          {!hasTent ? (
            <span className="text-muted-foreground">—</span>
          ) : !actionsKnown ? (
            <span className="text-muted-foreground">Unknown</span>
          ) : actionCount === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            <Badge variant="secondary">{actionCount}</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
