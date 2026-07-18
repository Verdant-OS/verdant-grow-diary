/**
 * PlantDetailAiDoctorLiveReview — grower-initiated, gated AI Doctor review
 * entry point.
 *
 * Hard constraints:
 *  - Reuses the readiness gate for ordinary reviews. Insufficient current
 *    context stays blocked unless a separate pure rule finds enough
 *    sanitized CSV history for a limited historical review.
 *  - Historical eligibility never upgrades current-context readiness and
 *    always preserves the missing-current-reading caveat.
 *  - A successful review delegates one saved-session snapshot to the
 *    existing ownership-checked persistence helper. It never writes alerts,
 *    Action Queue rows, sensor readings, or device commands.
 *  - Failure / timeout / invalid / missing-config all render the same
 *    calm failure copy. Fail closed.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTimelineMemory, TIMELINE_MEMORY_DEFAULT_LIMIT } from "@/hooks/useTimelineMemory";
import {
  evaluateAiDoctorContextFromSources,
  type AiDoctorContextPlantSource,
} from "@/lib/aiDoctorContextViewModel";
import {
  AI_DOCTOR_REVIEW_PACKET_CSV_ROW_CAP,
  buildAiDoctorReviewRequestPacket,
} from "@/lib/aiDoctorReviewRequestPacket";
import {
  AI_DOCTOR_CURRENT_SENSOR_ROW_CAP,
  AI_DOCTOR_CURRENT_SENSOR_SOURCES,
  classifyAiDoctorCurrentSensorEvidence,
} from "@/lib/aiDoctorCurrentSensorSnapshotRules";
import { useAiDoctorLiveReview } from "@/hooks/useAiDoctorLiveReview";
import AiDoctorReviewResultPreview from "@/components/AiDoctorReviewResultPreview";

import AiCreditRemainingBadge from "@/components/AiCreditRemainingBadge";
import AiCreditLimitNotice from "@/components/AiCreditLimitNotice";
import AiCreditServiceDegradedNotice from "@/components/AiCreditServiceDegradedNotice";
import { useSensorReadingsByTents } from "@/hooks/use-sensor-readings";
import { useImportedSensorHistory } from "@/hooks/useImportedSensorHistory";
import { isUuid } from "@/lib/isUuid";
import { plantDetailPath } from "@/lib/routes";
import { buildPlantAiDoctorReviewPath } from "@/lib/aiDoctorEntryRules";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { buildAiCreditLimitNoticeViewModel } from "@/lib/aiCreditLimitNoticeViewModel";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import type { Classification } from "@/lib/sensorSnapshotStatusContract";
import { evaluateAiDoctorReviewEligibility } from "@/lib/aiDoctorReviewEligibilityRules";

/** Stable empty-array identity so the packet memo does not churn. */
const NO_TENT_SENSOR_ROWS: never[] = [];

export const AI_DOCTOR_LIVE_REVIEW_LOADING_COPY = "Preparing cautious AI Doctor review…";
export const AI_DOCTOR_LIVE_REVIEW_FAILURE_COPY =
  "AI Doctor review could not be safely displayed. Add more context or try again later.";
export const AI_DOCTOR_LIVE_REVIEW_PARTIAL_COPY =
  "Context is partial — review may have limited confidence.";
export const AI_DOCTOR_LIVE_REVIEW_STRONG_COPY = "Context is strong enough for a cautious review.";
export const AI_DOCTOR_LIVE_REVIEW_HISTORICAL_COPY =
  "Historical review only — this is imported CSV history, not live telemetry. It may show patterns, but it cannot establish current conditions.";
export const AI_DOCTOR_LIVE_REVIEW_VALIDATED_LABEL = "Validated AI Doctor review.";
export const AI_DOCTOR_LIVE_REVIEW_START_LABEL = "Run cautious AI Doctor review";
export const AI_DOCTOR_LIVE_REVIEW_RETRY_LABEL = "Try once more";
export const AI_DOCTOR_HISTORY_SAVING_COPY = "Saving this review to AI Doctor history…";
export const AI_DOCTOR_HISTORY_SAVED_COPY = "Saved to AI Doctor history.";
export const AI_DOCTOR_HISTORY_SAVE_FAILED_COPY =
  "Review shown, but it could not be saved to history. Your result is still available below.";
export const AI_DOCTOR_HISTORY_SAVE_SKIPPED_COPY =
  "Review shown, but it could not be linked to history because grow context is missing.";

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
  const historicalStartTrackedRef = useRef(false);
  const reviewStartTrackedRef = useRef(false);
  const acceptedReviewModeRef = useRef<"standard" | "historical_review" | null>(null);
  const trackedResultRef = useRef<unknown>(null);
  const trackedSessionIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    historicalStartTrackedRef.current = false;
    reviewStartTrackedRef.current = false;
    acceptedReviewModeRef.current = null;
    trackedResultRef.current = null;
    trackedSessionIdRef.current = null;
  }, [plantId]);
  const { items } = useTimelineMemory({ kind: "plant", plantId }, TIMELINE_MEMORY_DEFAULT_LIMIT);
  // Dedicated bounded imported-history read. It filters permitted CSV source
  // identities before the cap and orders by historical `captured_at`, so the
  // AI packet receives the newest observations rather than newest imports.
  const importedHistory = useImportedSensorHistory(
    isUuid(tentId) ? tentId : null,
    AI_DOCTOR_REVIEW_PACKET_CSV_ROW_CAP,
  );
  const tentSensorRows = importedHistory.data ?? NO_TENT_SENSOR_ROWS;
  // Separate bounded current-source read. Keeping it distinct from the CSV
  // query prevents a high-frequency current stream from crowding history
  // out, and prevents historical rows from being mistaken for the latest
  // live/manual snapshot.
  const { byTent: currentReadingsByTent, statusByTent: currentSensorStatusByTent } =
    useSensorReadingsByTents(
      isUuid(tentId) ? [tentId] : [],
      AI_DOCTOR_CURRENT_SENSOR_ROW_CAP,
      AI_DOCTOR_CURRENT_SENSOR_SOURCES,
    );
  const currentSensorRows = tentId
    ? (currentReadingsByTent[tentId] ?? NO_TENT_SENSOR_ROWS)
    : NO_TENT_SENSOR_ROWS;
  // While either bounded sensor read is in flight, hold the start gate so
  // a click cannot send a packet that treats pending evidence as confirmed
  // absent. A FAILED read proceeds by omission — never a fabricated value.
  const csvHistoryPending = isUuid(tentId) && importedHistory.isFetching;
  const currentSensorPending =
    isUuid(tentId) && (currentSensorStatusByTent[tentId] ?? "loading") === "loading";
  const sensorContextPending = csvHistoryPending || currentSensorPending;

  const context = useMemo(
    () =>
      evaluateAiDoctorContextFromSources({
        plant,
        timelineItems: items,
      }),
    [plant, items],
  );

  // Row-level, provenance-aware classification. The ingest audit only knows
  // counts/source transport and cannot distinguish a UI test packet from a
  // physical sensor, so it must never grant healthy evidence here.
  const sensorClassification = useMemo<Classification | null>(() => {
    if (sensorClassificationOverride !== undefined) {
      return sensorClassificationOverride;
    }
    return classifyAiDoctorCurrentSensorEvidence(currentSensorRows);
  }, [currentSensorRows, sensorClassificationOverride]);

  // Build the bounded, sanitized candidate before eligibility is resolved so
  // the gate inspects the exact imported-history summary that would reach the
  // server. This is pure and cannot trigger a model call or persistence.
  const candidatePacket = useMemo(
    () =>
      buildAiDoctorReviewRequestPacket({
        plant,
        timelineItems: items,
        context,
        csvHistoryRows: tentSensorRows,
        currentSensorRows,
        // This explicit signal is derived from the same filtered rows as
        // the packet snapshot. Diagnostic/testbench packets, manual
        // snapshots, and CSV history can never set it.
        hasFreshLiveSensorReadings: sensorClassification?.status === "usable",
      }),
    [plant, items, context, tentSensorRows, currentSensorRows, sensorClassification],
  );

  const eligibility = useMemo(
    () =>
      evaluateAiDoctorReviewEligibility({
        context,
        hasPlantProfile: plant !== null,
        importedHistory: candidatePacket.imported_sensor_history,
        historicalRows: tentSensorRows,
        missingLiveSensorReadings: candidatePacket.missingLiveSensorReadings === true,
      }),
    [
      candidatePacket.imported_sensor_history,
      candidatePacket.missingLiveSensorReadings,
      context,
      plant,
      tentSensorRows,
    ],
  );
  const allowed = eligibility.allowed;
  const packet = allowed ? candidatePacket : null;

  const handlePersisted = useCallback(
    (_sessionId: string) => {
      void queryClient.invalidateQueries({ queryKey: ["ai_doctor_sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["timeline_memory"] });
    },
    [queryClient],
  );

  const review = useAiDoctorLiveReview({
    // Hold the gate while either sensor context read is in flight.
    enabled: allowed && !sensorContextPending,
    packet,
    invoke,
    growId: growId ?? null,
    tentId: tentId ?? null,
    plantId,
    sensorClassification,
    persist,
    onPersisted: handlePersisted,
  });

  const { entitlement } = useMyEntitlements();

  // Keep route construction aligned with the shared route contract.
  // AiCreditLimitNotice validates it again before it reaches the pricing link.
  const returnTo = useMemo(
    () =>
      buildPlantAiDoctorReviewPath({ plantId, tentId: tentId ?? null }) ?? plantDetailPath(plantId),
    [plantId, tentId],
  );

  // Keep funnel tracking aligned with the notice's server-plan + defensive
  // entitlement rules. Paid, founder, and unknown denials must never register
  // as an upgrade opportunity.
  const creditNoticeKind = useMemo(() => {
    if (review.status !== "error" || review.reason !== "credit_denied" || !review.credit) {
      return null;
    }

    return buildAiCreditLimitNoticeViewModel({
      credit: review.credit,
      surface: "doctor",
      returnTo,
      viewerEntitlement: entitlement,
    }).kind;
  }, [entitlement, returnTo, review.credit, review.reason, review.status]);

  useEffect(() => {
    if (creditNoticeKind === "upsell") {
      trackFunnelEvent("paywall_viewed", { surface: "ai_doctor_limit" });
    }
  }, [creditNoticeKind]);

  useEffect(() => {
    // These events describe value the grower can actually see. If eligibility
    // disappears while the request is in flight, the component renders
    // nothing and neither the result nor durable-save milestone is counted.
    if (!allowed || review.status !== "result" || !review.result) return;
    const surface = acceptedReviewModeRef.current;
    if (!surface) return;
    if (trackedResultRef.current !== review.result) {
      trackedResultRef.current = review.result;
      trackFunnelEvent("ai_doctor_result_received", { surface });
    }

    // Persistence can resolve in the same microtask turn as the model result.
    // Emit from this post-render effect so saved can never precede result.
    if (
      review.persistence.status === "saved" &&
      trackedSessionIdRef.current !== review.persistence.sessionId
    ) {
      trackedSessionIdRef.current = review.persistence.sessionId;
      trackFunnelEvent("ai_doctor_session_saved", { surface });
    }
  }, [allowed, review.persistence, review.result, review.status]);

  if (!allowed) return null;

  const handleInitialStart = () => {
    if (!review.canStart) return;
    const acceptedMode =
      eligibility.mode === "historical_review" ? "historical_review" : "standard";
    acceptedReviewModeRef.current = acceptedMode;
    if (!reviewStartTrackedRef.current) {
      reviewStartTrackedRef.current = true;
      trackFunnelEvent("ai_doctor_review_started", { surface: acceptedMode });
    }
    if (eligibility.mode === "historical_review") {
      if (!historicalStartTrackedRef.current) {
        historicalStartTrackedRef.current = true;
        trackFunnelEvent("historical_ai_review_started");
      }
    }
    review.start();
  };

  const confidenceCopy =
    eligibility.mode === "historical_review"
      ? AI_DOCTOR_LIVE_REVIEW_HISTORICAL_COPY
      : context.readiness === "partial"
        ? AI_DOCTOR_LIVE_REVIEW_PARTIAL_COPY
        : AI_DOCTOR_LIVE_REVIEW_STRONG_COPY;

  return (
    <section
      aria-labelledby="plant-ai-doctor-live-review-heading"
      data-testid="plant-ai-doctor-live-review"
      data-readiness={context.readiness}
      data-review-mode={eligibility.mode}
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
            onClick={review.status === "error" ? review.retry : handleInitialStart}
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
        review.reason === "credit_denied" && review.credit ? (
          <AiCreditLimitNotice
            credit={review.credit}
            surface="doctor"
            returnTo={returnTo}
            data-testid="plant-ai-doctor-live-review-credit-denied"
          />
        ) : review.reason === "upstream_credit_exhausted" ? (
          <AiCreditServiceDegradedNotice
            surface="doctor"
            data-testid="plant-ai-doctor-live-review-upstream-credit-exhausted"
          />
        ) : (
          <p
            className="text-xs text-amber-200"
            data-testid="plant-ai-doctor-live-review-failure"
            role="status"
            aria-live="polite"
          >
            {AI_DOCTOR_LIVE_REVIEW_FAILURE_COPY}
          </p>
        )
      ) : null}

      {review.status === "result" && review.result ? (
        <div data-testid="plant-ai-doctor-live-review-result-wrap">
          <p
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200"
            data-testid="plant-ai-doctor-live-review-validated-label"
          >
            {AI_DOCTOR_LIVE_REVIEW_VALIDATED_LABEL}
          </p>
          {review.persistence.status === "saving" ? (
            <p
              className="mt-2 text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
              data-testid="plant-ai-doctor-history-saving"
            >
              {AI_DOCTOR_HISTORY_SAVING_COPY}
            </p>
          ) : review.persistence.status === "saved" ? (
            <div
              className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emerald-200"
              role="status"
              aria-live="polite"
              data-testid="plant-ai-doctor-history-saved"
            >
              <span>{AI_DOCTOR_HISTORY_SAVED_COPY}</span>
              <Link
                to={`/doctor/sessions/${review.persistence.sessionId}`}
                className="font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="plant-ai-doctor-history-saved-link"
              >
                View saved session
              </Link>
            </div>
          ) : review.persistence.status === "failed" ? (
            <div
              className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-100"
              role="alert"
              data-testid="plant-ai-doctor-history-save-failed"
              data-failure-category={review.persistence.diagnostic.category}
            >
              <p>{AI_DOCTOR_HISTORY_SAVE_FAILED_COPY}</p>
              {review.canRetrySave ? (
                <button
                  type="button"
                  onClick={review.retrySave}
                  className="mt-2 rounded-md border border-amber-300/40 px-2 py-1 font-medium hover:bg-amber-500/10"
                  data-testid="plant-ai-doctor-history-save-retry"
                >
                  Retry saving to history
                </button>
              ) : null}
            </div>
          ) : review.persistence.status === "skipped" ? (
            <p
              className="mt-2 text-xs text-amber-100"
              role="status"
              data-testid="plant-ai-doctor-history-save-skipped"
            >
              {AI_DOCTOR_HISTORY_SAVE_SKIPPED_COPY}
            </p>
          ) : null}
          {review.creditRemaining ? (
            <AiCreditRemainingBadge
              credit={review.creditRemaining}
              data-testid="plant-ai-doctor-live-review-credit-remaining"
            />
          ) : null}
          <AiDoctorReviewResultPreview result={review.result} testIdPrefix="plant-detail-live" />
        </div>
      ) : null}
    </section>
  );
}
