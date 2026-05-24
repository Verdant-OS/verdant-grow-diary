/**
 * Read-only Daily Grow Check status card.
 *
 * Derives "last check activity" from existing manual sensor readings and
 * QuickLog diary entries. No writes. No new persistence. Never claims
 * "completed" — only describes activity that has been observed today.
 */
import { Link } from "react-router-dom";
import { ClipboardCheck, ArrowRight, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTents } from "@/hooks/use-tents";
import { usePlants } from "@/hooks/use-plants";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { useDiaryEntries } from "@/hooks/use-diary-entries";
import {
  deriveDailyGrowCheckStatus,
  type DailyCheckStatus,
} from "@/lib/dailyGrowCheckStatusRules";

interface Props {
  /** Compact strip variant (used inside Live Dashboard). */
  compact?: boolean;
  /** Optional scope filter; when set, only activity for this tent counts. */
  tentIds?: string[] | null;
  className?: string;
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return formatDistanceToNow(new Date(t), { addSuffix: true });
}

export default function DailyGrowCheckStatusCard({
  compact = false,
  tentIds = null,
  className,
}: Props) {
  const { data: rawReadings = [] } = useSensorReadings();
  const { data: rawDiary = [] } = useDiaryEntries();
  const { data: tents = [] } = useTents();
  const { data: plants = [] } = usePlants();

  const scoped = tentIds && tentIds.length > 0 ? new Set(tentIds) : null;

  const manualReadings = rawReadings
    .filter((r) => r.source === "manual")
    .filter((r) => (scoped ? r.tent_id && scoped.has(r.tent_id) : true))
    .map((r) => ({
      ts: r.ts,
      created_at: r.created_at,
      id: r.id,
      tent_id: r.tent_id,
      source: r.source,
    }));

  const diaryEntries = rawDiary
    .filter((e) => (scoped ? e.tent_id && scoped.has(e.tent_id) : true))
    .map((e) => ({
      entry_at: e.entry_at,
      created_at: e.created_at,
      id: e.id,
      tent_id: e.tent_id,
      plant_id: e.plant_id,
    }));

  const status: DailyCheckStatus = deriveDailyGrowCheckStatus({
    now: new Date(),
    manualReadings,
    diaryEntries,
  });

  const tentName =
    status.tentId
      ? tents.find((t) => t.id === status.tentId)?.name ?? "Unknown tent"
      : null;
  const plantName =
    status.plantId
      ? plants.find((p) => p.id === status.plantId)?.name ?? "Unknown plant"
      : null;

  const isEmpty = status.kind === "none";
  const tone =
    status.kind === "both"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : status.kind === "none"
        ? "bg-zinc-500/15 text-zinc-300 border-zinc-500/30"
        : "bg-sky-500/15 text-sky-300 border-sky-500/30";

  return (
    <Card
      data-testid="daily-grow-check-status-card"
      data-kind={status.kind}
      data-compact={compact ? "1" : "0"}
      className={[
        "p-4 space-y-3",
        compact ? "md:flex md:items-center md:justify-between md:space-y-0 md:gap-4" : "",
        className ?? "",
      ].join(" ")}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardCheck className="h-4 w-4" />
          <span>Daily Grow Check</span>
          <Badge
            variant="outline"
            className={tone}
            data-testid="daily-grow-check-status-label"
          >
            {status.label}
          </Badge>
        </div>
        {!isEmpty ? (
          <div className="text-sm text-foreground/90 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span data-testid="daily-grow-check-last-activity">
                Last check activity {relTime(status.lastActivityAt)}
              </span>
            </span>
            {tentName && (
              <span data-testid="daily-grow-check-tent-name">· {tentName}</span>
            )}
            {plantName && (
              <span data-testid="daily-grow-check-plant-name">· {plantName}</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Run a quick check to log conditions and notes for today.
          </p>
        )}
      </div>
      <Button
        asChild
        size={compact ? "sm" : "default"}
        className="gradient-leaf text-primary-foreground shrink-0"
        data-testid="daily-grow-check-status-cta"
      >
        <Link to="/daily-check">
          Start Check <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </Card>
  );
}
