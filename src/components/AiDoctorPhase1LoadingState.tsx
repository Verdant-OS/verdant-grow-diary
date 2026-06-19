/**
 * AI Doctor Phase 1 — Loading / Skeleton state (read-only).
 *
 * Pure presenter. No I/O, no fetch, no Supabase, no AI/model calls.
 * Rendered while the smart wrapper is compiling context / awaiting the
 * local stubbed `executeAiDoctorEngine` result for the selected plant.
 *
 * Skeleton blocks mirror the eventual result surface so the layout does
 * not jump in: selected-plant header, confidence/risk cards, evidence
 * list, sensor summary/drilldown, action suggestion review area.
 *
 * Never renders any fake summary/likely-issue/evidence/metrics, and
 * never reveals action-suggestion details before a real derived result.
 */
import * as React from "react";

function SkeletonBar(props: { width?: string; height?: string }): JSX.Element {
  return (
    <div
      aria-hidden
      className="animate-pulse rounded bg-muted"
      style={{ width: props.width ?? "100%", height: props.height ?? "0.75rem" }}
    />
  );
}

export function AiDoctorPhase1LoadingState(): JSX.Element {
  return (
    <section
      data-testid="ai-doctor-phase1-loading-state"
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="space-y-4 rounded-md border border-border bg-card p-4"
    >
      <header className="space-y-1">
        <h2
          data-testid="ai-doctor-phase1-loading-title"
          className="text-base font-semibold text-foreground"
        >
          Preparing AI Doctor context
        </h2>
        <p
          data-testid="ai-doctor-phase1-loading-body"
          className="text-xs text-muted-foreground"
        >
          Reviewing plant logs, sensor snapshots, and missing evidence.
        </p>
        <p
          data-testid="ai-doctor-phase1-loading-safety"
          className="text-xs text-muted-foreground"
        >
          Read-only review. Nothing is being saved or sent to equipment.
        </p>
      </header>

      <div
        data-testid="ai-doctor-phase1-loading-skeleton-plant-header"
        className="space-y-2"
      >
        <SkeletonBar width="40%" height="1rem" />
        <SkeletonBar width="60%" />
      </div>

      <div
        data-testid="ai-doctor-phase1-loading-skeleton-confidence-risk"
        className="flex gap-2"
      >
        <SkeletonBar width="6rem" height="1.5rem" />
        <SkeletonBar width="6rem" height="1.5rem" />
      </div>

      <div
        data-testid="ai-doctor-phase1-loading-skeleton-evidence"
        className="space-y-2"
      >
        <SkeletonBar width="30%" height="0.75rem" />
        <SkeletonBar />
        <SkeletonBar width="85%" />
        <SkeletonBar width="70%" />
      </div>

      <div
        data-testid="ai-doctor-phase1-loading-skeleton-sensor-summary"
        className="space-y-2"
      >
        <SkeletonBar width="35%" height="0.75rem" />
        <SkeletonBar />
        <SkeletonBar width="90%" />
      </div>

      <div
        data-testid="ai-doctor-phase1-loading-skeleton-action-suggestion"
        className="space-y-2"
      >
        <SkeletonBar width="45%" height="0.75rem" />
        <SkeletonBar width="55%" />
      </div>
    </section>
  );
}
