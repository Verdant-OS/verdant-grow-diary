/**
 * Grow-Room Mode — read-only multi-tent operator view.
 *
 * Aggregates existing per-tent data (latest snapshot, persisted alerts,
 * pending Action Queue items) into one operator screen.
 *
 * STRICTLY READ-ONLY. NO WRITES. NO AUTOMATION. NO DEVICE CONTROL.
 *  - No .insert / .update / .delete / .upsert / .rpc anywhere on this page.
 *  - No Action Queue creation. Links only to existing detail pages.
 *  - No elevated keys. No executable equipment surface.
 *  - All business logic lives in src/lib/growRoomModeRules.ts.
 *
 * UI is mobile-first: large status cards, fast scan, clear warnings.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Box, ClipboardCheck, Clock, Sprout } from "lucide-react";

import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import EmptyState from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useTents } from "@/hooks/use-tents";
import { useAlertsList } from "@/hooks/useAlertsList";
import {
  EMPTY_SNAPSHOT,
  snapshotFromReadings,
  type SensorSnapshot,
} from "@/lib/sensorSnapshot";
import {
  buildGrowRoomTentCards,
  DATA_HEALTH_LABEL,
  RECOMMENDATION_LABEL,
  SNAPSHOT_STATE_LABEL,
  type DataHealth,
  type GrowRoomActionInput,
  type GrowRoomAlertInput,
  type GrowRoomTentCard,
  type SnapshotState,
} from "@/lib/growRoomModeRules";

const HEALTH_CLASS: Record<DataHealth, string> = {
  healthy: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  attention: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
  stale: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  missing: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

const STALE_OR_MISSING = new Set<SnapshotState>(["stale", "missing", "demo"]);

function fmt(v: number | null, unit: string) {
  return v === null || Number.isNaN(v) ? "—" : `${v}${unit}`;
}

function snapshotSummary(s: SensorSnapshot | null) {
  if (!s) return "No snapshot";
  // Temperature stored in Celsius, displayed in Fahrenheit (Verdant convention).
  const tempF =
    s.temp === null || !Number.isFinite(s.temp)
      ? "—"
      : `${(s.temp * 9 / 5 + 32).toFixed(1)}°F`;
  return [
    `Temp ${tempF}`,
    `RH ${fmt(s.rh, "%")}`,
    `VPD ${s.vpd === null ? "—" : `${s.vpd.toFixed(2)} kPa`}`,
  ].join(" · ");
}

function snapshotAgeLabel(ageMin: number | null): string {
  if (ageMin === null) return "age unknown";
  if (ageMin < 1) return "just now";
  if (ageMin < 60) return `${ageMin}m ago`;
  const h = Math.floor(ageMin / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function GrowRoomMode() {
  const { data: tents } = useTents();
  const { alerts } = useAlertsList({});

  // Latest sensor_readings per tent (read-only). One bounded query.
  const [snapshotsByTentId, setSnapshotsByTentId] = useState<
    Record<string, SensorSnapshot>
  >({});
  // Action Queue items (read-only). One bounded query.
  const [actions, setActions] = useState<GrowRoomActionInput[]>([]);
  const [loading, setLoading] = useState(true);

  const tentIds = useMemo(() => (tents ?? []).map((t) => t.id), [tents]);
  const tentKey = tentIds.join("|");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (tentIds.length === 0) {
          if (!cancelled) {
            setSnapshotsByTentId({});
            setActions([]);
          }
          return;
        }

        // READ-ONLY: latest sensor_readings for these tents.
        const { data: readingRows } = await supabase
          .from("sensor_readings")
          .select("tent_id,metric,value,ts,source,quality")
          .in("tent_id", tentIds)
          .order("ts", { ascending: false })
          .limit(500);

        const byTent: Record<string, SensorSnapshot> = {};
        if (readingRows && readingRows.length > 0) {
          const grouped = new Map<string, typeof readingRows>();
          for (const r of readingRows) {
            if (!r.tent_id) continue;
            const list = grouped.get(r.tent_id) ?? [];
            list.push(r);
            grouped.set(r.tent_id, list);
          }
          for (const [tid, rows] of grouped.entries()) {
            // snapshotFromReadings handles its own ordering / freshness rules.
            // Cast: snapshotFromReadings expects the broader reading row shape.
            byTent[tid] = snapshotFromReadings(
              rows as unknown as Parameters<typeof snapshotFromReadings>[0],
            );
          }
        }

        // READ-ONLY: action_queue rows for these tents (no insert/update).
        const { data: actionRows } = await supabase
          .from("action_queue")
          .select("id,tent_id,grow_id,status")
          .in("tent_id", tentIds)
          .limit(500);

        if (!cancelled) {
          setSnapshotsByTentId(byTent);
          setActions(
            (actionRows ?? []).map((r) => ({
              id: r.id,
              tent_id: r.tent_id,
              grow_id: r.grow_id ?? null,
              status: r.status as GrowRoomActionInput["status"],
            })),
          );
        }
      } catch {
        if (!cancelled) {
          setSnapshotsByTentId({});
          setActions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tentKey, tentIds]);

  const alertInputs: GrowRoomAlertInput[] = useMemo(
    () =>
      (alerts ?? []).map((a) => ({
        id: a.id,
        tent_id: a.tent_id,
        grow_id: a.grow_id,
        severity: a.severity,
        status: a.status,
        title: a.title,
        created_at: a.created_at,
      })),
    [alerts],
  );

  const cards: GrowRoomTentCard[] = useMemo(() => {
    if (!tents) return [];
    return buildGrowRoomTentCards({
      tents: tents.map((t) => ({
        id: t.id,
        name: t.name,
        grow_id: t.grow_id ?? null,
      })),
      snapshotsByTentId: tents.reduce<Record<string, SensorSnapshot>>((acc, t) => {
        acc[t.id] = snapshotsByTentId[t.id] ?? EMPTY_SNAPSHOT;
        return acc;
      }, {}),
      alerts: alertInputs,
      actions,
      now: Date.now(),
    });
  }, [tents, snapshotsByTentId, alertInputs, actions]);

  const showEmpty = !loading && (!tents || tents.length === 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Dashboard"
        description="Read-only operator view across your tents. Verdant never executes equipment changes."
        actions={
          <Button
            asChild
            size="lg"
            className="gradient-leaf text-primary-foreground h-11"
            data-testid="grow-room-daily-grow-check-entry"
          >
            <Link to="/daily-check">
              <ClipboardCheck className="h-4 w-4" /> Start Check
            </Link>
          </Button>
        }
      />


      {showEmpty && (
        <EmptyState
          icon={<Box className="h-8 w-8" />}
          title="No tents yet"
          description="Create a tent to see grow-room status here."
          action={
            <Link
              to="/tents"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Go to Tents <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      )}

      {!showEmpty && (
        <div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          data-testid="grow-room-cards"
        >
          {cards.map((card) => {
            const showWarning = STALE_OR_MISSING.has(card.snapshotState);
            return (
              <Card
                key={card.tentId}
                data-testid="grow-room-card"
                data-tent-id={card.tentId}
                data-health={card.dataHealth}
                className="p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Sprout className="h-3.5 w-3.5" />
                      <span className="truncate">Tent</span>
                    </div>
                    <h2 className="text-lg font-semibold truncate">
                      {card.tentName}
                    </h2>
                  </div>
                  <Badge
                    variant="outline"
                    className={HEALTH_CLASS[card.dataHealth]}
                    data-testid="grow-room-health"
                  >
                    {DATA_HEALTH_LABEL[card.dataHealth]}
                  </Badge>
                </div>

                <div className="text-sm text-foreground/90">
                  {snapshotSummary(card.snapshot)}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {snapshotAgeLabel(card.snapshotAgeMinutes)}
                  </span>
                  <span>·</span>
                  <span data-testid="grow-room-source">
                    {SNAPSHOT_STATE_LABEL[card.snapshotState]}
                  </span>
                  {card.snapshot?.source === "sim" && (
                    <Badge
                      variant="outline"
                      data-testid="grow-room-simulated-badge"
                      data-label="Simulated"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      Simulated
                    </Badge>
                  )}
                </div>

                {card.snapshot?.source === "sim" && (
                  <div
                    data-testid="grow-room-simulated-notice"
                    className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                    <span>
                      Simulated sensor data shown — for testing/demo only. Not real tent data and not used for persisted alerts.
                    </span>
                  </div>
                )}

                {showWarning && (
                  <div
                    data-testid="grow-room-stale-warning"
                    className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                    <span>
                      {card.snapshotState === "missing"
                        ? "No recent sensor data for this tent."
                        : card.snapshotState === "demo"
                          ? "Showing demo data — not a real reading."
                          : "Latest reading is older than 30 minutes."}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs">
                  <Link
                    to="/alerts"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {card.openAlertCount} open alert
                    {card.openAlertCount === 1 ? "" : "s"}
                  </Link>
                  <Link
                    to="/actions"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {card.pendingActionCount} pending action
                    {card.pendingActionCount === 1 ? "" : "s"}
                  </Link>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-3">
                  <span
                    className="text-sm font-medium"
                    data-testid="grow-room-recommendation"
                  >
                    {RECOMMENDATION_LABEL[card.primaryRecommendation]}
                  </span>
                  <Link
                    to={`/tents/${card.tentId}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Open tent <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
