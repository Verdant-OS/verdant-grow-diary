/**
 * dashboardStabilityRollupRules — pure helper that summarizes per-tent
 * StabilityResult values into a compact rollup chip for the Dashboard.
 *
 * Read-only. No I/O, no React, no persistence, no queue, no AI calls.
 */
import type { StabilityResult } from "@/lib/environmentStabilityRules";

export type StabilityRollupTone =
  | "stable"
  | "watch"
  | "unstable"
  | "unavailable";

export interface StabilityRollupView {
  total: number;
  driftingCount: number;
  unavailableCount: number;
  stageUnknownCount: number;
  contextOnlyCount: number;
  stableCount: number;
  copy: string;
  tone: StabilityRollupTone;
}

export function computeStabilityRollup(
  results: ReadonlyArray<StabilityResult>,
): StabilityRollupView {
  const total = results.length;
  let driftingCount = 0;
  let unavailableCount = 0;
  let stageUnknownCount = 0;
  let contextOnlyCount = 0;
  let stableCount = 0;
  let watchCount = 0;
  let unstableCount = 0;

  for (const r of results) {
    switch (r.status) {
      case "unstable":
        unstableCount += 1;
        driftingCount += 1;
        break;
      case "watch":
        watchCount += 1;
        driftingCount += 1;
        break;
      case "unavailable":
        unavailableCount += 1;
        break;
      case "stage_unknown":
        stageUnknownCount += 1;
        break;
      case "context_only":
        contextOnlyCount += 1;
        break;
      case "stable":
      default:
        stableCount += 1;
        break;
    }
  }

  let copy: string;
  let tone: StabilityRollupTone;

  if (total === 0) {
    copy = "No tents to evaluate";
    tone = "unavailable";
  } else if (driftingCount > 0) {
    copy = `${driftingCount} of ${total} ${pluralTent(total)} drifting`;
    tone = unstableCount > 0 ? "unstable" : "watch";
  } else if (stableCount > 0) {
    copy = `0 of ${total} ${pluralTent(total)} drifting`;
    tone = "stable";
  } else if (stageUnknownCount > 0) {
    copy = `Set stage for ${stageUnknownCount} ${pluralTent(stageUnknownCount)}`;
    tone = "unavailable";
  } else if (unavailableCount > 0) {
    copy = `${unavailableCount} ${pluralTent(unavailableCount)} unavailable`;
    tone = "unavailable";
  } else if (contextOnlyCount > 0) {
    copy = `${contextOnlyCount} ${pluralTent(contextOnlyCount)} context only`;
    tone = "unavailable";
  } else {
    copy = `0 of ${total} ${pluralTent(total)} drifting`;
    tone = "stable";
  }

  return {
    total,
    driftingCount,
    unavailableCount,
    stageUnknownCount,
    contextOnlyCount,
    stableCount,
    copy,
    tone,
  };
}

function pluralTent(n: number): string {
  return n === 1 ? "tent" : "tents";
}

export const STABILITY_ROLLUP_TONE_CLASS: Record<StabilityRollupTone, string> = {
  stable: "border-border/50 text-muted-foreground",
  watch: "border-[hsl(var(--warning))] text-[hsl(var(--warning))]",
  unstable: "border-destructive/60 text-destructive",
  unavailable: "border-border/50 text-muted-foreground",
};
