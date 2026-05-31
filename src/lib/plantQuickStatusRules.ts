/**
 * plantQuickStatusRules — pure view-model for the Plant Detail quick-status
 * strip.
 *
 * Read-only. No I/O, no React, no side effects, no writes, no automation,
 * no device control, no calendar / notification / email / scheduling.
 *
 * Inputs come from data the page already loads. Counts are optional — when
 * the host page cannot provide them without issuing new queries it omits
 * them and the strip only shows stage + last update.
 *
 * Never exposes IDs, tokens, raw payloads, user IDs, or provenance markers.
 */
import { getRelativeStagePreset } from "./relativeStageTimelineRules";
import {
  formatRelativeTimelineHeader,
  type RelativeTimelineItem,
} from "./relativeTimelineProjectionRules";

export interface PlantQuickStatusInput {
  stage?: string | null;
  timelineItems?: ReadonlyArray<RelativeTimelineItem> | null;
  /** Open alert count for the assigned tent. `null` / undefined → omitted. */
  alertCount?: number | null;
  /** Pending action queue count for the assigned tent. `null` / undefined → omitted. */
  actionCount?: number | null;
}

export interface PlantQuickStatusView {
  stageLabel: string;
  stageIsFallback: boolean;
  lastUpdateLabel: string;
  lastUpdateIsFallback: boolean;
  alertCount: number | null;
  hasAlertCount: boolean;
  alertLabel: string | null;
  actionCount: number | null;
  hasActionCount: boolean;
  actionLabel: string | null;
  /** Pre-joined compact one-liner used for accessibility / data-test attrs. */
  compact: string;
}

export const STAGE_UNKNOWN_LABEL = "Stage unknown";

function nonBlankTrimmed(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function resolveStageLabel(stage: string | null | undefined): {
  label: string;
  isFallback: boolean;
} {
  const raw = nonBlankTrimmed(stage);
  if (!raw) return { label: STAGE_UNKNOWN_LABEL, isFallback: true };
  const aliasMap: Record<string, string> = {
    veg: "vegetation",
    vegetative: "vegetation",
    flowering: "flower",
    drying: "dry",
    curing: "cure",
  };
  const key = raw.toLowerCase();
  const preset = getRelativeStagePreset(aliasMap[key] ?? key);
  if (preset) return { label: preset.label, isFallback: false };
  // Title-case the raw value as a soft fallback; still considered "known".
  const titled = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return { label: titled, isFallback: false };
}

function isCountProvided(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Build the compact Plant Detail quick-status view model. Pure, deterministic.
 */
export function buildPlantQuickStatusView(
  input: PlantQuickStatusInput | null | undefined,
): PlantQuickStatusView {
  const i = input ?? {};
  const stage = resolveStageLabel(i.stage ?? null);
  const header = formatRelativeTimelineHeader(i.timelineItems ?? []);

  const hasAlertCount = isCountProvided(i.alertCount);
  const alertCount = hasAlertCount ? (i.alertCount as number) : null;
  const alertLabel = hasAlertCount
    ? pluralize(alertCount as number, "open alert", "open alerts")
    : null;

  const hasActionCount = isCountProvided(i.actionCount);
  const actionCount = hasActionCount ? (i.actionCount as number) : null;
  const actionLabel = hasActionCount
    ? pluralize(actionCount as number, "pending action", "pending actions")
    : null;

  const parts: string[] = [
    `Stage: ${stage.label}`,
    header.lastUpdatedLabel,
  ];
  if (alertLabel) parts.push(alertLabel);
  if (actionLabel) parts.push(actionLabel);

  return {
    stageLabel: stage.label,
    stageIsFallback: stage.isFallback,
    lastUpdateLabel: header.lastUpdatedLabel,
    lastUpdateIsFallback: header.lastUpdatedIsFallback,
    alertCount,
    hasAlertCount,
    alertLabel,
    actionCount,
    hasActionCount,
    actionLabel,
    compact: parts.join(" · "),
  };
}
