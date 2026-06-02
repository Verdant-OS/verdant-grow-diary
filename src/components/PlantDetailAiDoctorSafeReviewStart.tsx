/**
 * PlantDetailAiDoctorSafeReviewStart — presenter-only safe review entry
 * point + read-only preparation panel.
 *
 * Hard constraints:
 *  - No model/API calls, no AI Doctor session writes, no alerts /
 *    action_queue / sensor_readings writes.
 *  - Renders nothing for "insufficient" readiness (gate stays in charge).
 *  - All copy + variant rules live in the view-model, never in JSX.
 */
import { useMemo, useState } from "react";
import { useTimelineMemory, TIMELINE_MEMORY_DEFAULT_LIMIT } from "@/hooks/useTimelineMemory";
import {
  evaluateAiDoctorContextFromSources,
  type AiDoctorContextPlantSource,
} from "@/lib/aiDoctorContextViewModel";
import {
  buildAiDoctorSafeReviewStart,
} from "@/lib/aiDoctorSafeReviewStartViewModel";

export interface PlantDetailAiDoctorSafeReviewStartProps {
  plantId: string;
  plant: AiDoctorContextPlantSource | null;
}

export default function PlantDetailAiDoctorSafeReviewStart({
  plantId,
  plant,
}: PlantDetailAiDoctorSafeReviewStartProps) {
  const { items } = useTimelineMemory(
    { kind: "plant", plantId },
    TIMELINE_MEMORY_DEFAULT_LIMIT,
  );

  const result = useMemo(
    () =>
      evaluateAiDoctorContextFromSources({
        plant,
        timelineItems: items,
      }),
    [plant, items],
  );

  const view = useMemo(
    () => buildAiDoctorSafeReviewStart(result),
    [result],
  );

  const [open, setOpen] = useState(false);

  if (!view.allowStart) return null;

  const prep = view.preparation!;
  return (
    <section
      aria-labelledby="plant-ai-doctor-safe-review-heading"
      data-testid="plant-ai-doctor-safe-review-start"
      data-variant={view.variant}
      className="glass rounded-2xl p-4 my-3 space-y-3"
    >
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <h2
          id="plant-ai-doctor-safe-review-heading"
          className="text-base font-semibold tracking-tight"
        >
          {prep.title}
        </h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          data-testid="plant-ai-doctor-safe-review-start-button"
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-3 py-1.5 text-xs font-medium hover:bg-background/60"
        >
          {open ? "Hide preparation" : view.startLabel}
        </button>
      </header>

      <p
        className="text-xs text-muted-foreground"
        data-testid="plant-ai-doctor-safe-review-readiness-notice"
      >
        {prep.readinessNotice}
      </p>

      {open ? (
        <div
          className="space-y-3 rounded-md border border-border/40 bg-background/30 p-3"
          data-testid="plant-ai-doctor-safe-review-preparation"
        >
          <p
            className="text-xs font-medium text-amber-300"
            data-testid="plant-ai-doctor-safe-review-no-request-notice"
          >
            {prep.noRequestNotice}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div data-testid="plant-ai-doctor-safe-review-evidence">
              <h3 className="font-semibold mb-1">Evidence available</h3>
              {prep.evidence.length === 0 ? (
                <p className="text-muted-foreground">None.</p>
              ) : (
                <ul className="list-disc pl-4 space-y-0.5">
                  {prep.evidence.map((e) => (
                    <li key={e.code}>{e.label}</li>
                  ))}
                </ul>
              )}
            </div>
            <div data-testid="plant-ai-doctor-safe-review-missing">
              <h3 className="font-semibold mb-1">Missing information</h3>
              {prep.missing.length === 0 ? (
                <p className="text-muted-foreground">None.</p>
              ) : (
                <ul className="list-disc pl-4 space-y-0.5">
                  {prep.missing.map((m) => (
                    <li key={m.code}>{m.label}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-1 text-xs">
            <div data-testid="plant-ai-doctor-safe-review-timeline-summary">
              <dt className="font-semibold inline">Timeline: </dt>
              <dd className="inline text-muted-foreground">
                {prep.timelineSummary}
              </dd>
            </div>
            <div data-testid="plant-ai-doctor-safe-review-snapshot-summary">
              <dt className="font-semibold inline">Sensor snapshots: </dt>
              <dd className="inline text-muted-foreground">
                {prep.snapshotSummary}
              </dd>
            </div>
            <div data-testid="plant-ai-doctor-safe-review-warnings-summary">
              <dt className="font-semibold inline">Warnings: </dt>
              <dd className="inline text-muted-foreground">
                {prep.warningsSummary}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            disabled
            aria-disabled="true"
            data-testid="plant-ai-doctor-safe-review-disabled-submit"
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/20 px-3 py-1.5 text-xs font-medium opacity-60 cursor-not-allowed"
          >
            {prep.disabledButtonLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}
