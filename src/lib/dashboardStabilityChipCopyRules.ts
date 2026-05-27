/**
 * dashboardStabilityChipCopyRules — pure helper that maps a StabilityResult
 * into the compact chip copy shown on the Dashboard per-tent strip.
 *
 * Read-only. No I/O, no React, no persistence, no queue, no AI calls.
 */
import type { StabilityResult } from "@/lib/environmentStabilityRules";

export interface StabilityChipView {
  /** Short copy shown inside the chip. */
  copy: string;
  /** Tailwind tone class for the chip border + text. */
  toneClass: string;
}

const TONE_NEUTRAL = "border-border/50 text-muted-foreground";
const TONE_WATCH = "border-[hsl(var(--warning))] text-[hsl(var(--warning))]";
const TONE_BAD = "border-destructive/60 text-destructive";

export function formatStabilityChipView(
  result: StabilityResult,
): StabilityChipView {
  switch (result.status) {
    case "stage_unknown":
      return { copy: "Set stage for VPD stability", toneClass: TONE_NEUTRAL };
    case "context_only":
      return { copy: "VPD context only", toneClass: TONE_NEUTRAL };
    case "unavailable":
      return { copy: "Stability: unavailable", toneClass: TONE_NEUTRAL };
    case "unstable":
      return {
        copy: `Outside 24h: ${formatHours(result.last24h.hoursOutside)}`,
        toneClass: TONE_BAD,
      };
    case "watch":
      return {
        copy: `Outside 24h: ${formatHours(result.last24h.hoursOutside)}`,
        toneClass: TONE_WATCH,
      };
    case "stable":
    default:
      return {
        copy: `Outside 24h: ${formatHours(result.last24h.hoursOutside)}`,
        toneClass: TONE_NEUTRAL,
      };
  }
}

function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "0h";
  return `${Math.round(h * 10) / 10}h`;
}
