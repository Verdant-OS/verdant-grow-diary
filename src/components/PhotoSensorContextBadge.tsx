/**
 * PhotoSensorContextBadge — read-only presenter for Quick Log Photo
 * events. Renders a non-AI "Photo log / Visual record only" badge and,
 * when safe context is available, the nearest sensor snapshot card.
 *
 * Hard constraints:
 *   - No fetches. No writes. No AI calls. No Action Queue. No alerts.
 *   - Never claims diagnosis or causation between the photo and the
 *     attached/nearest snapshot.
 *   - Stale / invalid / demo / missing context is surfaced through the
 *     existing `SensorSnapshotCard` warning copy — never re-classified.
 *   - Renders nothing sensitive: only the snapshot fields exposed by
 *     `resolveSensorSnapshotDisplay` make it to the DOM.
 */
import { cn } from "@/lib/utils";
import SensorSnapshotCard from "@/components/SensorSnapshotCard";
import {
  resolvePhotoSensorContext,
  formatPhotoContextDeltaLabel,
  PHOTO_LOG_BADGE_LABEL,
  PHOTO_LOG_BADGE_SUBLABEL,
  PHOTO_LOG_NON_AI_BADGE_LABEL,
  NEAREST_CONTEXT_HEADING,
  NEAREST_CONTEXT_NON_DIAGNOSTIC_COPY,
  NO_NEAREBY_CONTEXT_COPY,
  FUTURE_LOGS_HINT_COPY,
  type PhotoEventForContext,
  type PhotoContextCandidateSnapshot,
  type PhotoSensorContextOptions,
} from "@/lib/photoSensorContextLinkingRules";
import type { SensorSnapshotInput } from "@/lib/sensorSnapshotFreshnessRules";

export interface PhotoSensorContextBadgeProps {
  photo: PhotoEventForContext;
  /** Already-loaded sensor snapshots from the surrounding timeline. */
  nearbyCandidates?: readonly PhotoContextCandidateSnapshot[] | null;
  /** Window override for nearest selection (default 6h). */
  options?: PhotoSensorContextOptions;
  className?: string;
  testId?: string;
}

/**
 * Map an opaque candidate snapshot into the shape accepted by the
 * snapshot resolver. Only known-safe fields are forwarded; everything
 * else (raw_payload, vendor IDs, tokens) is dropped.
 */
function toSnapshotInput(
  snap: PhotoContextCandidateSnapshot,
): SensorSnapshotInput {
  const capturedAt =
    typeof snap.capturedAtIso === "string"
      ? snap.capturedAtIso
      : typeof snap.captured_at === "string"
        ? snap.captured_at
        : null;

  const sourceDetailRaw = (snap as Record<string, unknown>).source_detail;
  const sourceDetail = typeof sourceDetailRaw === "string" ? sourceDetailRaw : null;

  const confidenceRaw = (snap as Record<string, unknown>).confidence;
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? confidenceRaw
      : null;

  const metricsRaw = (snap as Record<string, unknown>).metrics;
  const metrics = Array.isArray(metricsRaw)
    ? (metricsRaw as SensorSnapshotInput["metrics"])
    : undefined;

  return {
    source: typeof snap.source === "string" ? snap.source : null,
    sourceDetail,
    capturedAt,
    confidence,
    metrics,
  };
}

export default function PhotoSensorContextBadge({
  photo,
  nearbyCandidates,
  options,
  className,
  testId = "photo-sensor-context",
}: PhotoSensorContextBadgeProps) {
  const result = resolvePhotoSensorContext(photo, nearbyCandidates, options);

  return (
    <section
      data-testid={testId}
      data-result-kind={result.kind}
      className={cn("space-y-2 text-xs", className)}
    >
      <div
        data-testid={`${testId}-badge`}
        className="flex flex-wrap items-center gap-1.5"
      >
        <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {PHOTO_LOG_BADGE_LABEL}
        </span>
        <span className="rounded border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {PHOTO_LOG_NON_AI_BADGE_LABEL}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {PHOTO_LOG_BADGE_SUBLABEL}
        </span>
      </div>

      {result.kind === "none" ? (
        <div
          data-testid={`${testId}-empty`}
          className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground space-y-1"
        >
          <p>{NO_NEAREBY_CONTEXT_COPY}</p>
          <p>{FUTURE_LOGS_HINT_COPY}</p>
        </div>
      ) : (
        <div data-testid={`${testId}-context`} className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              {NEAREST_CONTEXT_HEADING}
            </span>
            {result.kind === "nearest" && (
              <span
                data-testid={`${testId}-delta`}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {formatPhotoContextDeltaLabel(result.deltaMs, result.direction)}
              </span>
            )}
            {result.kind === "attached" && (
              <span
                data-testid={`${testId}-attached`}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                attached to photo
              </span>
            )}
          </div>
          <SensorSnapshotCard
            snapshot={toSnapshotInput(result.snapshot)}
            testId={`${testId}-snapshot`}
          />
          <p
            data-testid={`${testId}-non-diagnostic`}
            className="text-[11px] leading-snug text-muted-foreground"
          >
            {NEAREST_CONTEXT_NON_DIAGNOSTIC_COPY}
          </p>
        </div>
      )}
    </section>
  );
}
