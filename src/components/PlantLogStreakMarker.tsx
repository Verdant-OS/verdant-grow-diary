/**
 * PlantLogStreakMarker — compact "logged today" + streak row for Plant Detail.
 *
 * Presentation-only: reads recent diary entry timestamps (usePlantLogDays)
 * and the client entitlement hint (useMyEntitlements), renders the pure
 * plantLogStreakRules view. For free plans with real history it adds a calm,
 * one-line Pro teaser linking to /pricing — it never hides or gates the
 * grower's own data.
 *
 * No writes, no AI calls, no device control, no checkout logic.
 */
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlantLogDays } from "@/hooks/usePlantLogDays";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { buildPlantLogStreakView } from "@/lib/plantLogStreakRules";

interface Props {
  plantId: string | null | undefined;
}

export default function PlantLogStreakMarker({ plantId }: Props) {
  const { data: entryAts, isLoading } = usePlantLogDays(plantId ?? null);
  const { entitlement, loading: entitlementLoading } = useMyEntitlements();

  // Quietly absent while loading or without a plant — this is a garnish row,
  // never a blocking surface.
  if (!plantId || isLoading || !entryAts) return null;

  const view = buildPlantLogStreakView({
    entryAts,
    now: Date.now(),
    // Fail toward NOT teasing: while the plan is unresolved, treat as paid.
    isFreePlan: !entitlementLoading && entitlement.effectivePlanId === "free",
  });

  return (
    <div
      data-testid="plant-log-streak-marker"
      data-logged-today={view.loggedToday ? "true" : "false"}
      data-streak-days={view.streakDays}
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/40 bg-card/30 px-3 py-1.5 text-xs"
    >
      <span
        data-testid="plant-log-streak-status"
        className={cn(
          "inline-flex items-center gap-1.5",
          view.loggedToday
            ? "text-[hsl(var(--success))]"
            : "text-muted-foreground",
        )}
      >
        {view.loggedToday ? (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Circle className="h-3.5 w-3.5" aria-hidden />
        )}
        {view.statusLabel}
      </span>

      {view.streakLabel ? (
        <span
          data-testid="plant-log-streak-count"
          className="inline-flex items-center gap-1 text-muted-foreground"
        >
          <Flame
            className="h-3.5 w-3.5 text-[hsl(var(--warning))]"
            aria-hidden
          />
          {view.streakLabel}
        </span>
      ) : null}

      {view.teaser.show ? (
        <span
          data-testid="plant-log-streak-teaser"
          className="inline-flex flex-wrap items-center gap-1 text-muted-foreground"
        >
          {view.teaser.copy}{" "}
          <Link
            to={view.teaser.href}
            className="text-primary underline-offset-4 hover:underline"
          >
            {view.teaser.ctaLabel}
          </Link>
        </span>
      ) : null}
    </div>
  );
}
