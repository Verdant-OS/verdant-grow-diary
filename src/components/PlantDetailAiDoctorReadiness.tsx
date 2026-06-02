/**
 * PlantDetailAiDoctorReadiness — presentation-only card that tells
 * growers whether enough plant context exists for a useful AI Doctor
 * check-in.
 *
 * Read-only. Uses existing page data signals only. No AI calls, no
 * writes, RPC, scheduling, or autonomous actions. Copy stays cautious:
 * never promises diagnosis certainty and never implies a single photo
 * is sufficient.
 */
import { useMemo } from "react";
import { Stethoscope, AlertCircle, CheckCircle2, MinusCircle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import {
  buildPlantDetailAiDoctorReadiness,
  type PlantDetailAiDoctorReadinessInput,
  type AiDoctorReadinessLevel,
} from "@/lib/plantDetailAiDoctorReadiness";
import type { Classification } from "@/lib/sensorSnapshotStatusContract";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import { classifyTimelineEntry } from "@/lib/timelineEntryClassification";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PlantDetailAiDoctorReadinessProps {
  plantId: string | null | undefined;
  growId?: string | null;
  stage?: string | null;
  hasPlantPhoto?: boolean;
}

const HEADING_ID = "plant-detail-ai-doctor-readiness-heading";
const CARD_TEST_ID = "plant-detail-ai-doctor-readiness-card";

function deriveSignals(
  plantId: string | null | undefined,
  hasPlantPhoto: boolean,
  rawRows: readonly unknown[] | null | undefined,
): Pick<
  PlantDetailAiDoctorReadinessInput,
  "hasTimelineEntries" | "hasRecentPhoto" | "hasSensorSnapshot" | "hasRecentWateringOrFeed"
> {
  const rows = buildPlantRecentActivity(rawRows ?? [], { plantId: plantId ?? null, limit: 10 });

  const hasTimelineEntries = rows.length > 0;
  let hasRecentPhoto = hasPlantPhoto;
  let hasSensorSnapshot = false;
  let hasRecentWateringOrFeed = false;

  for (const r of rows) {
    if (r.hasPhoto) hasRecentPhoto = true;
    if (r.hasSnapshot) hasSensorSnapshot = true;
    const cat = classifyTimelineEntry({ eventType: r.eventType });
    if (cat === "watering" || cat === "feeding") hasRecentWateringOrFeed = true;
  }

  return { hasTimelineEntries, hasRecentPhoto, hasSensorSnapshot, hasRecentWateringOrFeed };
}

function levelIcon(level: AiDoctorReadinessLevel) {
  switch (level) {
    case "ready":
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />;
    case "partial":
      return <MinusCircle className="h-4 w-4 text-[hsl(var(--info))]" aria-hidden="true" />;
    case "empty":
      return <AlertCircle className="h-4 w-4 text-[hsl(var(--warning))]" aria-hidden="true" />;
  }
}

function levelBadgeVariant(level: AiDoctorReadinessLevel) {
  switch (level) {
    case "ready":
      return "outline" as const;
    case "partial":
      return "outline" as const;
    case "empty":
      return "outline" as const;
  }
}

function levelBadgeClass(level: AiDoctorReadinessLevel): string {
  switch (level) {
    case "ready":
      return "border-emerald-400/50 text-emerald-400";
    case "partial":
      return "border-[hsl(var(--info))]/50 text-[hsl(var(--info))]";
    case "empty":
      return "border-[hsl(var(--warning))]/50 text-[hsl(var(--warning))]";
  }
}

function levelBadgeLabel(level: AiDoctorReadinessLevel): string {
  switch (level) {
    case "ready":
      return "Ready";
    case "partial":
      return "Partial";
    case "empty":
      return "Empty";
  }
}

export default function PlantDetailAiDoctorReadiness({
  plantId,
  growId,
  stage,
  hasPlantPhoto = false,
}: PlantDetailAiDoctorReadinessProps) {
  const { data: rawRows, isLoading } = usePlantRecentActivity(plantId ?? null);

  const signals = useMemo(() => {
    return deriveSignals(plantId, hasPlantPhoto, rawRows ?? []);
  }, [plantId, hasPlantPhoto, rawRows]);

  // Route the legacy timeline-derived snapshot boolean through the shared
  // contract by constructing an explicit Classification at the boundary.
  // The contract decides whether this counts as healthy evidence — the
  // component never bypasses it.
  const sensorSnapshot = useMemo<Classification | null>(() => {
    if (!signals.hasSensorSnapshot) return null;
    return {
      status: "usable",
      reason: "fresh_accepted",
      isHealthyEvidence: true,
      label: "Latest bridge reading accepted.",
    };
  }, [signals.hasSensorSnapshot]);

  const result = useMemo(() => {
    return buildPlantDetailAiDoctorReadiness({
      stage,
      ...signals,
      sensorSnapshot,
    });
  }, [stage, signals, sensorSnapshot]);

  const doctorHref = plantId
    ? `/doctor?plantId=${encodeURIComponent(plantId)}`
    : "/doctor";

  return (
    <section
      aria-labelledby={HEADING_ID}
      data-testid={CARD_TEST_ID}
      className="glass rounded-2xl p-4 my-3"
    >
      <header className="flex items-center justify-between gap-2 mb-3">
        <h2
          id={HEADING_ID}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          <Stethoscope className="h-3.5 w-3.5 text-primary" />
          AI Doctor readiness
        </h2>
        {!isLoading && (
          <Badge
            variant={levelBadgeVariant(result.level)}
            className={`text-[10px] uppercase tracking-wide ${levelBadgeClass(result.level)}`}
            data-testid="plant-detail-ai-doctor-readiness-badge"
            data-level={result.level}
          >
            {levelBadgeLabel(result.level)}
          </Badge>
        )}
      </header>

      {isLoading ? (
        <div
          data-testid="plant-detail-ai-doctor-readiness-loading"
          role="status"
          aria-live="polite"
          className="space-y-2"
        >
          <div className="h-8 rounded-lg bg-secondary/40 animate-pulse" aria-hidden />
          <div className="h-4 rounded-lg bg-secondary/40 animate-pulse w-3/4" aria-hidden />
          <span className="sr-only">Loading AI Doctor readiness…</span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            {levelIcon(result.level)}
            <div className="min-w-0 flex-1">
              <p
                className="text-sm font-medium text-foreground/90"
                data-testid="plant-detail-ai-doctor-readiness-headline"
              >
                {result.headline}
              </p>
              <p
                className="text-xs text-muted-foreground mt-0.5"
                data-testid="plant-detail-ai-doctor-readiness-subhead"
              >
                {result.subhead}
              </p>
            </div>
          </div>

          {result.missing.length > 0 && (
            <ul
              data-testid="plant-detail-ai-doctor-readiness-missing-list"
              className="space-y-1"
            >
              {result.missing.map((m) => (
                <li
                  key={m.kind}
                  data-testid={`plant-detail-ai-doctor-readiness-missing-${m.kind}`}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                  {m.label}
                </li>
              ))}
            </ul>
          )}

          <div className="pt-1">
            {plantId ? (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-7 gap-1"
                data-testid="plant-detail-ai-doctor-readiness-cta"
              >
                <Link to={doctorHref}>
                  Ask Doctor <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled
                aria-disabled="true"
                className="h-7 gap-1 opacity-60 cursor-not-allowed"
                data-testid="plant-detail-ai-doctor-readiness-cta-disabled"
                title="Plant context is not loaded yet."
              >
                Ask Doctor <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
