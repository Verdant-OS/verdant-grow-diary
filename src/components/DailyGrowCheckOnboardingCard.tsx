/**
 * DailyGrowCheckOnboardingCard — compact, read-only guidance card that
 * surfaces the single most useful next setup step for the Daily Grow Check
 * loop. Reuses existing add/edit/move surfaces. No writes here.
 */
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardCheck, HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTents } from "@/hooks/use-tents";
import { usePlants } from "@/hooks/use-plants";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { useDiaryEntries } from "@/hooks/use-diary-entries";
import {
  deriveDailyGrowCheckOnboarding,
  type OnboardingGuidance,
} from "@/lib/dailyGrowCheckOnboardingRules";
import { deriveDailyGrowCheckStatus } from "@/lib/dailyGrowCheckStatusRules";

interface Props {
  compact?: boolean;
  /** Optional plant focus (e.g. coming from /daily-check?plantId=). */
  focusedPlantId?: string | null;
  /** Optional tent focus (e.g. coming from /tents/:id). */
  focusedTentId?: string | null;
  /** Optional scope filter for "any snapshot/quicklog exists" checks. */
  tentIds?: string[] | null;
  /** When true, the card hides itself once setup is ready. */
  hideWhenReady?: boolean;
  className?: string;
}

export default function DailyGrowCheckOnboardingCard({
  compact = false,
  focusedPlantId = null,
  focusedTentId = null,
  tentIds = null,
  hideWhenReady = false,
  className,
}: Props) {
  const { data: tents = [] } = useTents();
  const { data: plants = [] } = usePlants();
  const { data: rawReadings = [] } = useSensorReadings();
  const { data: rawDiary = [] } = useDiaryEntries();

  const scoped = tentIds && tentIds.length > 0 ? new Set(tentIds) : null;

  const manualReadings = rawReadings.filter((r) => r.source === "manual");
  const scopedManual = scoped
    ? manualReadings.filter((r) => r.tent_id && scoped.has(r.tent_id))
    : manualReadings;
  const scopedDiary = scoped
    ? rawDiary.filter((e) => e.tent_id && scoped.has(e.tent_id))
    : rawDiary;

  const status = deriveDailyGrowCheckStatus({
    now: new Date(),
    manualReadings: scopedManual.map((r) => ({
      ts: r.ts,
      created_at: r.created_at,
      id: r.id,
      tent_id: r.tent_id,
      source: r.source,
    })),
    diaryEntries: scopedDiary.map((e) => ({
      entry_at: e.entry_at,
      created_at: e.created_at,
      id: e.id,
      tent_id: e.tent_id,
      plant_id: e.plant_id,
    })),
  });

  const focusedPlant = focusedPlantId
    ? plants.find((p) => p.id === focusedPlantId)
    : null;

  const guidance: OnboardingGuidance = deriveDailyGrowCheckOnboarding({
    tentsCount: tents.length,
    plantsCount: plants.length,
    plantsWithoutTentCount: plants.filter((p) => !p.tent_id).length,
    focusedPlantId: focusedPlant?.id ?? null,
    focusedPlantTentId: focusedPlant?.tent_id ?? null,
    focusedTentId:
      focusedTentId ?? focusedPlant?.tent_id ?? (tents.length === 1 ? tents[0].id : null),
    hasAnyManualSnapshot: scopedManual.length > 0,
    hasAnyQuickLog: scopedDiary.length > 0,
    hasTodayCheckActivity: status.occurredToday,
  });

  if (hideWhenReady && guidance.isReady) return null;

  return (
    <Card
      data-testid="daily-grow-check-onboarding-card"
      data-step={guidance.step}
      data-compact={compact ? "1" : "0"}
      className={[
        "p-4",
        compact
          ? "flex items-center gap-3"
          : "space-y-3",
        className ?? "",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardCheck className="h-4 w-4" />
          <span data-testid="daily-grow-check-onboarding-title">
            {guidance.title}
          </span>
        </div>
        <p
          className="text-sm text-foreground/90"
          data-testid="daily-grow-check-onboarding-subtitle"
        >
          {guidance.subtitle}
        </p>
      </div>
      <Button
        asChild
        size={compact ? "sm" : "default"}
        className="gradient-leaf text-primary-foreground shrink-0"
        data-testid="daily-grow-check-onboarding-cta"
      >
        <Link to={guidance.ctaHref}>
          {guidance.ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </Card>
  );
}
