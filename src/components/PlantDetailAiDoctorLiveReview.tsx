/**
 * PlantDetailAiDoctorLiveReview — grower-initiated, gated live AI Doctor
 * review entry point. Renders nothing for "insufficient" readiness.
 *
 * Hard constraints:
 *  - Reuses the readiness gate (insufficient blocked, partial/strong
 *    allowed with limited-confidence copy when partial).
 *  - Never writes DB rows. Never persists sessions, alerts, action queue,
 *    sensor readings. No approve/reject buttons. No device control.
 *  - Failure / timeout / invalid / missing-config all render the same
 *    calm failure copy. Fail closed.
 */
import { useMemo } from "react";
import {
  useTimelineMemory,
  TIMELINE_MEMORY_DEFAULT_LIMIT,
} from "@/hooks/useTimelineMemory";
import {
  evaluateAiDoctorContextFromSources,
  type AiDoctorContextPlantSource,
} from "@/lib/aiDoctorContextViewModel";
import { buildAiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacket";
import { useAiDoctorLiveReview } from "@/hooks/useAiDoctorLiveReview";
import AiDoctorReviewResultPreview from "@/components/AiDoctorReviewResultPreview";
import { useSensorBridgeHealth } from "@/hooks/useSensorBridgeHealth";
import {
  classificationFromStatusResult,
  type Classification,
} from "@/lib/sensorSnapshotStatusContract";

export const AI_DOCTOR_LIVE_REVIEW_LOADING_COPY =
  "Preparing cautious AI Doctor review…";
export const AI_DOCTOR_LIVE_REVIEW_FAILURE_COPY =
  "AI Doctor review could not be safely displayed. Add more context or try again later.";
export const AI_DOCTOR_LIVE_REVIEW_PARTIAL_COPY =
  "Context is partial — review may have limited confidence.";
export const AI_DOCTOR_LIVE_REVIEW_STRONG_COPY =
  "Context is strong enough for a cautious review.";
export const AI_DOCTOR_LIVE_REVIEW_VALIDATED_LABEL =
  "Validated AI Doctor review.";
export const AI_DOCTOR_LIVE_REVIEW_START_LABEL =
  "Run cautious AI Doctor review";
export const AI_DOCTOR_LIVE_REVIEW_RETRY_LABEL = "Try once more";

export interface PlantDetailAiDoctorLiveReviewProps {
  plantId: string;
  plant: (AiDoctorContextPlantSource & { potSize?: string | null }) | null;
  /** Scope IDs used to write the AI Doctor sensor evidence audit row. */
  growId?: string | null;
  tentId?: string | null;
  /** Test seam: override edge invoke. */
  invoke?: Parameters<typeof useAiDoctorLiveReview>[0]["invoke"];
  /** Test seam: override audit persist. */
  persist?: Parameters<typeof useAiDoctorLiveReview>[0]["persist"];
  /** Test seam: pre-resolved sensor classification (otherwise read live). */
  sensorClassificationOverride?: Classification | null;
}

export default function PlantDetailAiDoctorLiveReview({
  plantId,
  plant,
  growId,
  tentId,
  invoke,
  persist,
  sensorClassificationOverride,
}: PlantDetailAiDoctorLiveReviewProps) {
  const { items } = useTimelineMemory(
    { kind: "plant", plantId },
    TIMELINE_MEMORY_DEFAULT_LIMIT,
  );
  const { data: bridgeHealth } = useSensorBridgeHealth();

  const context = useMemo(
    () =>
      evaluateAiDoctorContextFromSources({
        plant,
        timelineItems: items,
      }),
    [plant, items],
  );

  const allowed =
    context.readiness === "partial" || context.readiness === "strong";

  const packet = useMemo(
    () =>
      allowed
        ? buildAiDoctorReviewRequestPacket({
            plant,
            timelineItems: items,
            context,
          })
        : null,
    [allowed, plant, items, context],
  );

  // Real intake classification — never synthesized from presence.
  const sensorClassification = useMemo<Classification | null>(() => {
    if (sensorClassificationOverride !== undefined) {
      return sensorClassificationOverride;
    }
    if (!bridgeHealth) return null;
    return classificationFromStatusResult({
      status: bridgeHealth.status,
      reasonCode: bridgeHealth.latestReasonCode,
    });
  }, [bridgeHealth, sensorClassificationOverride]);

  const review = useAiDoctorLiveReview({
    enabled: allowed,
    packet,
    invoke,
    growId: growId ?? null,
    tentId: tentId ?? null,
    plantId,
    sensorClassification,
    persist,
  });

  if (!allowed) return null;

  const confidenceCopy =
    context.readiness === "partial"
      ? AI_DOCTOR_LIVE_REVIEW_PARTIAL_COPY
      : AI_DOCTOR_LIVE_REVIEW_STRONG_COPY;

  return (
    <section
      aria-labelledby="plant-ai-doctor-live-review-heading"
      data-testid="plant-ai-doctor-live-review"
      data-readiness={context.readiness}
      data-status={review.status}
      className="glass rounded-2xl p-4 my-3 space-y-3"
    >
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <h2
          id="plant-ai-doctor-live-review-heading"
          className="text-base font-semibold tracking-tight"
        >
          Cautious AI Doctor review
        </h2>
        {review.status === "idle" || review.status === "error" ? (
          <button
            type="button"
            onClick={review.status === "error" ? review.retry : review.start}
            disabled={!review.canStart}
            data-testid={
              review.status === "error"
                ? "plant-ai-doctor-live-review-retry"
                : "plant-ai-doctor-live-review-start"
            }
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-3 py-1.5 text-xs font-medium hover:bg-background/60 disabled:opacity-50"
          >
            {review.status === "error"
              ? AI_DOCTOR_LIVE_REVIEW_RETRY_LABEL
              : AI_DOCTOR_LIVE_REVIEW_START_LABEL}
          </button>
        ) : null}
      </header>

      <p
        className="text-xs text-muted-foreground"
        data-testid="plant-ai-doctor-live-review-confidence-copy"
      >
        {confidenceCopy}
      </p>

      {review.status === "loading" ? (
        <p
          className="text-xs text-amber-200"
          data-testid="plant-ai-doctor-live-review-loading"
          role="status"
          aria-live="polite"
        >
          {AI_DOCTOR_LIVE_REVIEW_LOADING_COPY}
        </p>
      ) : null}

      {review.status === "error" ? (
        <p
          className="text-xs text-amber-200"
          data-testid="plant-ai-doctor-live-review-failure"
          role="status"
          aria-live="polite"
        >
          {AI_DOCTOR_LIVE_REVIEW_FAILURE_COPY}
        </p>
      ) : null}

      {review.status === "result" && review.result ? (
        <div data-testid="plant-ai-doctor-live-review-result-wrap">
          <p
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200"
            data-testid="plant-ai-doctor-live-review-validated-label"
          >
            {AI_DOCTOR_LIVE_REVIEW_VALIDATED_LABEL}
          </p>
          <AiDoctorReviewResultPreview
            result={review.result}
            testIdPrefix="plant-detail-live"
          />
        </div>
      ) : null}
    </section>
  );
}
