/**
 * PlantDetailAiDoctorReadiness — presentation-only card that tells
 * growers whether enough plant context exists for a useful AI Doctor
 * check-in.
 *
 * Read-only. Uses existing page data signals only. No AI calls, no
 * writes, RPC, scheduling, or autonomous actions. Copy stays cautious:
 * never promises diagnosis certainty and never implies a single photo
 * is sufficient.
 *
 * Sensor evidence is sourced from the REAL intake classification via
 * `useSensorBridgeHealth()` → `classificationFromStatusResult()` and
 * passed to the readiness builder. The legacy timeline presence boolean
 * is NOT promoted into a synthesized `usable` Classification — only the
 * real contract classifier can grant healthy evidence.
 */
import { useMemo } from "react";
import {
  Stethoscope,
  AlertCircle,
  CheckCircle2,
  MinusCircle,
  ArrowRight,
  ShieldAlert,
  Clock,
  HelpCircle,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";

import {
  buildPlantDetailAiDoctorReadiness,
  type PlantDetailAiDoctorReadinessInput,
  type AiDoctorReadinessLevel,
  type AiDoctorSensorEvidenceMode,
} from "@/lib/plantDetailAiDoctorReadiness";
import {
  classificationFromStatusResult,
  type Classification,
  type SnapshotStatus,
} from "@/lib/sensorSnapshotStatusContract";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { useSensorBridgeHealth } from "@/hooks/useSensorBridgeHealth";
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

function modeBadgeClass(mode: AiDoctorSensorEvidenceMode): string {
  switch (mode) {
    case "healthy":
      return "border-emerald-400/50 text-emerald-400";
    case "cautionary":
      return "border-[hsl(var(--warning))]/50 text-[hsl(var(--warning))]";
    case "unsafe":
      return "border-destructive/50 text-destructive";
    case "missing":
      return "border-muted-foreground/40 text-muted-foreground";
    default:
      return "border-muted-foreground/40 text-muted-foreground";
  }
}

function modeIcon(mode: AiDoctorSensorEvidenceMode) {
  switch (mode) {
    case "healthy":
      return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
    case "cautionary":
      return <Clock className="h-3.5 w-3.5" aria-hidden="true" />;
    case "unsafe":
      return <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />;
    case "missing":
      return <Plus className="h-3.5 w-3.5" aria-hidden="true" />;
    default:
      return <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  }
}

interface NextAction {
  label: string;
  to: string;
}

function nextActionForStatus(status: SnapshotStatus | null): NextAction | null {
  switch (status) {
    case "stale":
      return { label: "Add fresh sensor snapshot", to: "/sensors" };
    case "invalid":
      return { label: "Review sensor intake", to: "/pi-ingest-status" };
    case "needs_review":
      return { label: "Review snapshot issue", to: "/pi-ingest-status" };
    case "no_data":
      return { label: "Add sensor snapshot", to: "/sensors" };
    case "usable":
    default:
      return null;
  }
}

export default function PlantDetailAiDoctorReadiness({
  plantId,
  growId,
  stage,
  hasPlantPhoto = false,
}: PlantDetailAiDoctorReadinessProps) {
  const { data: rawRows, isLoading } = usePlantRecentActivity(plantId ?? null);
  const { data: bridgeHealth } = useSensorBridgeHealth();

  const signals = useMemo(() => {
    return deriveSignals(plantId, hasPlantPhoto, rawRows ?? []);
  }, [plantId, hasPlantPhoto, rawRows]);

  // Source the REAL intake classification from the bridge health view-model.
  // Presence in the timeline NEVER produces a `usable` Classification — only
  // the shared contract classifier can. When no bridge data is available,
  // we pass null and the readiness builder treats sensor evidence as
  // `no_data`.
  const sensorSnapshot = useMemo<Classification | null>(() => {
    if (!bridgeHealth) return null;
    return classificationFromStatusResult({
      status: bridgeHealth.status,
      reasonCode: bridgeHealth.latestReasonCode,
    });
  }, [bridgeHealth]);

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

  const sensor = result.sensorEvidence;
  const nextAction = nextActionForStatus(sensor.status);

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
            variant="outline"
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

          {/* Sensor evidence panel — real intake classification. */}
          <div
            data-testid="plant-detail-ai-doctor-sensor-evidence-panel"
            data-status={sensor.status ?? "unknown"}
            data-reason={sensor.reason ?? "unknown"}
            data-mode={sensor.mode}
            data-counts-as-healthy={sensor.countsAsHealthyEvidence ? "true" : "false"}
            className="mt-2 rounded-lg border border-border/40 bg-secondary/20 p-2 space-y-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Sensor evidence
              </span>
              <Badge
                variant="outline"
                className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide ${modeBadgeClass(sensor.mode)}`}
                data-testid="plant-detail-ai-doctor-sensor-evidence-mode-badge"
              >
                {modeIcon(sensor.mode)}
                {sensor.mode}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span data-testid="plant-detail-ai-doctor-sensor-evidence-status">
                status: <span className="font-mono text-foreground/80">{sensor.status ?? "unknown"}</span>
              </span>
              <span data-testid="plant-detail-ai-doctor-sensor-evidence-reason">
                reason: <span className="font-mono text-foreground/80">{sensor.reason ?? "unknown"}</span>
              </span>
              <span data-testid="plant-detail-ai-doctor-sensor-evidence-healthy">
                healthy evidence:{" "}
                <span className="font-mono text-foreground/80">
                  {sensor.countsAsHealthyEvidence ? "yes" : "no"}
                </span>
              </span>
            </div>
            <p
              className="text-xs text-muted-foreground"
              data-testid="plant-detail-ai-doctor-sensor-evidence-explanation"
            >
              {sensor.label}
            </p>
            {nextAction && (
              <div className="pt-1">
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1"
                  data-testid={`plant-detail-ai-doctor-sensor-evidence-next-action-${sensor.status}`}
                  data-next-action-status={sensor.status ?? "unknown"}
                >
                  <Link to={nextAction.to}>
                    {nextAction.label} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            )}
          </div>

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
