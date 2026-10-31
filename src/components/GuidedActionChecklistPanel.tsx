/**
 * GuidedActionChecklistPanel — dashboard-scoped "next actions" surface.
 *
 * Presenter only. All ranking, deduplication, and gap detection happens in
 * `guidedActionChecklistRules.ts`. Every item is advisory: taps deep-link
 * into an existing authenticated screen (Daily Check, Alerts) and the grower
 * still saves. Never the public `/quick-log` starter.
 * Dismissals are stored per-browser via `guidedActionChecklistDismissals`
 * with a 12h TTL so a genuine gap eventually resurfaces.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { Link } from "@/lib/react-router-compat";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Gauge,
  ListChecks,
  Sparkles,
  Sprout,
  X,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDiaryEntries } from "@/hooks/use-diary-entries";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { useGrowPlants, useGrowTents } from "@/hooks/useGrowData";
import { useAlertsList } from "@/hooks/useAlertsList";
import { useNowTick } from "@/hooks/useNowTick";
import {
  resolveGuidedChecklistReadState,
  selectGuidedChecklistEvidence,
} from "@/lib/guidedChecklistEvidenceRules";
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";
import {
  buildGuidedActionChecklist,
  type GuidedActionItem,
  type GuidedActionItemKind,
  type GuidedChecklistGrowEvent,
} from "@/lib/guidedActionChecklistRules";
import { dismissItem, readActiveDismissals } from "@/lib/guidedActionChecklistDismissals";
import { resolveSensorReadingTentScope } from "@/lib/tentScopedSensorReadingsRules";

interface Props {
  scopedGrowId: string | null;
  className?: string;
}

const KIND_ICON: Record<GuidedActionItemKind, typeof Sparkles> = {
  alert_followup: AlertTriangle,
  sensor_context: Gauge,
  cadence: Sprout,
  stage_transition: Sparkles,
};

const KIND_LABEL: Record<GuidedActionItemKind, string> = {
  alert_followup: "Alert",
  sensor_context: "Sensor",
  cadence: "Cadence",
  stage_transition: "Stage",
};

const CHECKLIST_FEEDING_EVENT_TYPES = ["watering", "feeding"] as const;

/**
 * Grow-scoped grow_events read. The query filters grow_id, is_deleted = false,
 * and event_type in watering or feeding. It does not filter user_id.
 * RLS limits a non-operator to rows where auth.uid() = user_id. An operator
 * matches "Operators view all grow_events", so this read is not owner-scoped.
 * A failed or empty read returns no events, so a gap stays visible instead
 * of being treated as a recent feeding.
 */
async function readChecklistGrowFeedingEvents(growId: string): Promise<GuidedChecklistGrowEvent[]> {
  const { data, error } = await supabase
    .from("grow_events")
    .select("id, event_type, plant_id, tent_id, occurred_at")
    .eq("grow_id", growId)
    .eq("is_deleted", false)
    .in("event_type", [...CHECKLIST_FEEDING_EVENT_TYPES])
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  const events: GuidedChecklistGrowEvent[] = [];
  for (const row of data) {
    if (!row.id) continue;
    events.push({
      id: row.id,
      eventType: row.event_type,
      plantId: row.plant_id,
      tentId: row.tent_id,
      occurredAt: row.occurred_at,
    });
  }
  return events;
}

function priorityTone(priority: GuidedActionItem["priority"]): string {
  switch (priority) {
    case 1:
      return "border-destructive/40 bg-destructive/5";
    case 2:
      return "border-amber-500/40 bg-amber-500/5";
    case 3:
      return "border-border";
    default:
      return "border-border/60";
  }
}

export default function GuidedActionChecklistPanel({ scopedGrowId, className }: Props) {
  const ownerId = useAuth().user?.id ?? null;
  const [growEvents, setGrowEvents] = useState<readonly GuidedChecklistGrowEvent[]>([]);
  const [feedingReadNonce, setFeedingReadNonce] = useState(0);
  const plantsQuery = useGrowPlants(undefined, scopedGrowId ?? undefined);
  const tentsQuery = useGrowTents(scopedGrowId ?? undefined);
  const diaryQuery = useDiaryEntries();
  // Per-tent windows over this grow's tents; never the unscoped all-tents
  // read, which hit the Postgres statement timeout (BUG-003). With no grow in
  // scope the panel renders nothing, so it reads nothing. Unresolved or
  // failed tents keep the read pending/error, never an empty success.
  const tentScope = resolveSensorReadingTentScope({
    enabled: Boolean(scopedGrowId),
    tents: tentsQuery,
  });
  const readingsQuery = useSensorReadings(
    {
      tentIds: tentScope.tentIds,
      scopeError: tentScope.scopeError,
      retryScope: tentsQuery.refetch,
    },
    500,
  );
  const alertsQuery = useAlertsList(
    { growId: scopedGrowId ?? undefined, status: "open" },
    { enabled: Boolean(scopedGrowId) },
  );

  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const now = useNowTick();
  useEffect(() => {
    if (!scopedGrowId || !ownerId) {
      setGrowEvents([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await readChecklistGrowFeedingEvents(scopedGrowId);
        if (!cancelled) setGrowEvents(rows);
      } catch {
        if (!cancelled) setGrowEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopedGrowId, ownerId, feedingReadNonce]);
  const readState = resolveGuidedChecklistReadState(
    [plantsQuery, tentsQuery, diaryQuery, readingsQuery],
    alertsQuery.status,
  );
  useEffect(() => {
    setDismissedIds(readActiveDismissals());
  }, [scopedGrowId]);

  const items = useMemo<GuidedActionItem[]>(() => {
    if (!scopedGrowId || readState !== "ready") return [];
    const rawPlants = plantsQuery.data ?? [];
    const rawTents = tentsQuery.data ?? [];
    const rawDiary = diaryQuery.data ?? [];
    const rawReadings = readingsQuery.data ?? [];
    const rawAlerts = alertsQuery.alerts;

    const plants = rawPlants.map((p) => ({
      id: p.id,
      name: p.name ?? "Unnamed plant",
      growId: p.growId ?? null,
      tentId: p.tentId ?? null,
      stage: (p.stage as string | null | undefined) ?? null,
    }));
    const tents = rawTents.map((t) => ({
      id: t.id,
      name: t.name ?? "Tent",
    }));

    const growDiary = normalizeDiaryEntries({ rawEntries: rawDiary }).filter(
      (e) => e.growId === scopedGrowId,
    );

    const latestReadingByTent = selectGuidedChecklistEvidence({
      now,
      growId: scopedGrowId,
      tentIds: tents.map((t) => t.id),
      readings: rawReadings,
      diaryEntries: rawDiary,
    });

    const openAlerts = rawAlerts.map((a) => ({
      id: a.id,
      title: a.title,
      severity: a.severity,
      plantId: a.plant_id,
      tentId: a.tent_id,
    }));

    return buildGuidedActionChecklist({
      now,
      scopedGrowId,
      plants,
      tents,
      diaryEntries: growDiary,
      growEvents,
      latestReadingByTent,
      openAlerts,
      dismissedIds,
    });
  }, [
    now,
    readState,
    scopedGrowId,
    plantsQuery.data,
    tentsQuery.data,
    diaryQuery.data,
    growEvents,
    readingsQuery.data,
    alertsQuery.alerts,
    dismissedIds,
  ]);

  const handleDismiss = (id: string) => {
    const next = dismissItem(id);
    setDismissedIds(next);
  };

  const retry = async () => {
    await Promise.allSettled([
      plantsQuery.refetch(),
      tentsQuery.refetch(),
      diaryQuery.refetch(),
      readingsQuery.refetch(),
      Promise.resolve(alertsQuery.reload()),
    ]);
    setFeedingReadNonce((nonce) => nonce + 1);
  };

  if (!scopedGrowId) return null;

  return (
    <Card className={cn("p-4 sm:p-5", className)} data-testid="guided-action-checklist-panel">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Next diary actions</h2>
        </div>
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Advisory · you decide
        </span>
      </header>

      {readState === "error" || readState === "paused" ? (
        <div role="status" className="py-4 text-sm text-muted-foreground">
          <p>
            {readState === "paused"
              ? "Waiting for connection to confirm your diary context."
              : "Could not confirm your diary context. Suggestions are unavailable until the reads succeed."}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void retry()}>
            Retry
          </Button>
        </div>
      ) : readState === "pending" ? (
        <p
          className="py-4 text-sm text-muted-foreground"
          data-testid="guided-action-checklist-loading"
        >
          Reviewing your timeline and sensor context…
        </p>
      ) : items.length === 0 ? (
        <div
          className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground"
          data-testid="guided-action-checklist-empty"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-medium text-foreground">No diary actions to show.</p>
            <p className="mt-0.5 text-xs">
              No suggestions from the loaded context. Dismissed suggestions stay hidden for 12
              hours.
            </p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="guided-action-checklist-items">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-start gap-3 rounded-md border px-3 py-2.5",
                  priorityTone(item.priority),
                )}
                data-testid={`guided-action-checklist-item-${item.id}`}
              >
                <Icon
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    <Badge
                      variant="outline"
                      className="h-4 px-1.5 text-[10px] uppercase tracking-wide"
                    >
                      {KIND_LABEL[item.kind]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.reason}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button asChild size="sm" variant="secondary" className="h-7 px-2 text-xs">
                      <Link
                        to={item.ctaHref}
                        data-testid={`guided-action-checklist-cta-${item.id}`}
                      >
                        {item.ctaLabel}
                        <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
                      </Link>
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleDismiss(item.id)}
                      className="inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Dismiss ${item.title} for 12 hours`}
                      title="Dismiss for 12 hours"
                      data-testid={`guided-action-checklist-dismiss-${item.id}`}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                      Dismiss
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
