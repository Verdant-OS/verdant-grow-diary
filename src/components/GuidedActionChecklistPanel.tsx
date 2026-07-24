/**
 * GuidedActionChecklistPanel — dashboard-scoped "next actions" surface.
 *
 * Presenter only. All ranking, deduplication, and gap detection happens in
 * `guidedActionChecklistRules.ts`. Every item is advisory: taps deep-link
 * into an existing screen (Quick Log, Alerts) and the grower still saves.
 * Dismissals are stored per-browser via `guidedActionChecklistDismissals`
 * with a 12h TTL so a genuine gap eventually resurfaces.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";
import {
  buildGuidedActionChecklist,
  type GuidedActionItem,
  type GuidedActionItemKind,
  type GuidedChecklistSensorReading,
} from "@/lib/guidedActionChecklistRules";
import {
  dismissItem,
  readActiveDismissals,
} from "@/lib/guidedActionChecklistDismissals";

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

export default function GuidedActionChecklistPanel({
  scopedGrowId,
  className,
}: Props) {
  const plantsQuery = useGrowPlants(undefined, scopedGrowId ?? undefined);
  const tentsQuery = useGrowTents(scopedGrowId ?? undefined);
  const diaryQuery = useDiaryEntries();
  const readingsQuery = useSensorReadings(undefined, 500);
  const alertsQuery = useAlertsList(
    { growId: scopedGrowId ?? undefined, status: "open" },
    { enabled: Boolean(scopedGrowId) },
  );

  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  useEffect(() => {
    setDismissedIds(readActiveDismissals());
  }, [scopedGrowId]);

  const items = useMemo<GuidedActionItem[]>(() => {
    if (!scopedGrowId) return [];
    const rawPlants = plantsQuery.data ?? [];
    const rawTents = tentsQuery.data ?? [];
    const rawDiary = diaryQuery.data ?? [];
    const rawReadings = readingsQuery.data ?? [];
    const rawAlerts = alertsQuery.alerts;

    const plants = rawPlants.map((p) => ({
      id: p.id,
      name: p.name ?? "Unnamed plant",
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

    // Latest reading per tent (readings are ordered newest-first upstream;
    // we defend with an explicit compare in case that ever changes).
    const latestReadingByTent: Record<
      string,
      GuidedChecklistSensorReading | null
    > = {};
    for (const t of tents) latestReadingByTent[t.id] = null;
    for (const r of rawReadings as ReadonlyArray<{
      tent_id?: string | null;
      captured_at?: string | null;
      created_at?: string | null;
      source?: string | null;
      quality?: string | null;
    }>) {
      const tentId = r.tent_id ?? null;
      if (!tentId || !(tentId in latestReadingByTent)) continue;
      const capturedAt = r.captured_at ?? r.created_at ?? null;
      const current = latestReadingByTent[tentId];
      const currentT = current?.capturedAt
        ? Date.parse(current.capturedAt)
        : -Infinity;
      const nextT = capturedAt ? Date.parse(capturedAt) : -Infinity;
      if (nextT > currentT) {
        latestReadingByTent[tentId] = {
          capturedAt,
          source: r.source ?? null,
          quality: r.quality ?? null,
        };
      }
    }

    const openAlerts = rawAlerts.map((a) => ({
      id: a.id,
      title: a.title,
      severity: a.severity,
      plantId: a.plant_id,
      tentId: a.tent_id,
    }));

    return buildGuidedActionChecklist({
      now: Date.now(),
      scopedGrowId,
      plants,
      tents,
      diaryEntries: growDiary,
      latestReadingByTent,
      openAlerts,
      dismissedIds,
    });
  }, [
    scopedGrowId,
    plantsQuery.data,
    tentsQuery.data,
    diaryQuery.data,
    readingsQuery.data,
    alertsQuery.alerts,
    dismissedIds,
  ]);

  const handleDismiss = (id: string) => {
    const next = dismissItem(id);
    setDismissedIds(next);
  };

  const isLoading =
    plantsQuery.isLoading ||
    tentsQuery.isLoading ||
    diaryQuery.isLoading ||
    readingsQuery.isLoading ||
    alertsQuery.status === "loading";

  if (!scopedGrowId) return null;

  return (
    <Card
      className={cn("p-4 sm:p-5", className)}
      data-testid="guided-action-checklist-panel"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Next diary actions</h2>
        </div>
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Advisory · you decide
        </span>
      </header>

      {isLoading && items.length === 0 ? (
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
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium text-foreground">You're up to date.</p>
            <p className="mt-0.5 text-xs">
              No overdue logs, stale sensor context, or open alerts. Verdant
              will surface the next thing when it appears.
            </p>
          </div>
        </div>
      ) : (
        <ul
          className="space-y-2"
          data-testid="guided-action-checklist-items"
        >
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
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.title}
                    </p>
                    <Badge
                      variant="outline"
                      className="h-4 px-1.5 text-[10px] uppercase tracking-wide"
                    >
                      {KIND_LABEL[item.kind]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.reason}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      asChild
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2 text-xs"
                    >
                      <Link
                        to={item.ctaHref}
                        data-testid={`guided-action-checklist-cta-${item.id}`}
                      >
                        {item.ctaLabel}
                        <ArrowRight
                          className="ml-1 h-3 w-3"
                          aria-hidden="true"
                        />
                      </Link>
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleDismiss(item.id)}
                      className="inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
