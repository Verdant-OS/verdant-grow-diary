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
 * Never exposes IDs, tokens, raw payloads, user IDs, or provenance markers
 * in user-visible labels. Internal target identifiers (e.g. the newest
 * timeline item's id used for scroll targeting) are surfaced only on the
 * view-model so the component can wire `data-*` attributes for the
 * "View latest entry" affordance; never rendered as visible text.
 */
import { alertsPath, actionsPath } from "./routes";
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
  /** Loading flags — shown as muted "Checking…" copy / skeletons. */
  timelineLoading?: boolean;
  alertsLoading?: boolean;
  actionsLoading?: boolean;
  /** Route context for safe quick links. Null → link disabled with reason. */
  growId?: string | null;
  tentId?: string | null;
}

export type QuickStatusLoadState = "ready" | "loading" | "unavailable";

export interface PlantQuickStatusLink {
  label: string;
  href: string | null;
  disabled: boolean;
  disabledReason: string | null;
}

export interface PlantQuickStatusViewLatest {
  label: string;
  /** Newest timeline item's id, used for the scroll target. Never rendered visibly. */
  targetItemId: string | null;
  disabled: boolean;
  disabledReason: string | null;
}

export interface PlantQuickStatusView {
  stageLabel: string;
  stageIsFallback: boolean;
  lastUpdateLabel: string;
  lastUpdateIsFallback: boolean;

  // Counts (existing behavior preserved).
  alertCount: number | null;
  hasAlertCount: boolean;
  alertLabel: string | null;
  actionCount: number | null;
  hasActionCount: boolean;
  actionLabel: string | null;

  // Loading / unavailable states.
  timelineLoading: boolean;
  alertsState: QuickStatusLoadState;
  actionsState: QuickStatusLoadState;
  /** Copy to show when alerts are loading or unavailable. */
  alertsStatusLabel: string | null;
  actionsStatusLabel: string | null;

  // Quick links + scroll affordance.
  alertsLink: PlantQuickStatusLink;
  actionsLink: PlantQuickStatusLink;
  viewLatestEntry: PlantQuickStatusViewLatest;

  /** Pre-joined compact one-liner used for accessibility / data-test attrs. */
  compact: string;
}

export const STAGE_UNKNOWN_LABEL = "Stage unknown";
export const ALERTS_LOADING_LABEL = "Checking alerts…";
export const ACTIONS_LOADING_LABEL = "Checking actions…";
export const ALERTS_UNAVAILABLE_LABEL = "Alerts unavailable";
export const ACTIONS_UNAVAILABLE_LABEL = "Pending actions unavailable";
export const ALERTS_NONE_LABEL = "No open alerts";
export const ACTIONS_NONE_LABEL = "No pending actions";
export const VIEW_LATEST_LABEL = "View latest entry";
export const VIEW_LATEST_DISABLED_REASON =
  "Add a quick log, photo, or sensor snapshot to start the timeline.";
export const ALERTS_LINK_LABEL = "View alerts";
export const ACTIONS_LINK_LABEL = "View pending actions";
export const ALERTS_LINK_DISABLED_REASON =
  "Connect this plant to a grow to view alerts.";
export const ACTIONS_LINK_DISABLED_REASON =
  "Connect this plant to a grow to view pending actions.";

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
  const titled = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return { label: titled, isFallback: false };
}

function isCountProvided(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function countLabel(
  kind: "alert" | "action",
  count: number,
): string {
  if (count === 0) {
    return kind === "alert" ? ALERTS_NONE_LABEL : ACTIONS_NONE_LABEL;
  }
  return kind === "alert"
    ? pluralize(count, "open alert", "open alerts")
    : pluralize(count, "pending action", "pending actions");
}

function pickLatestItemId(
  items: ReadonlyArray<RelativeTimelineItem> | null | undefined,
): string | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  let bestMs = -Infinity;
  let bestId: string | null = null;
  for (const it of items) {
    const id = typeof it?.id === "string" && it.id.length > 0 ? it.id : null;
    if (!id) continue;
    const iso = it.occurredAt;
    if (typeof iso === "string" && iso) {
      const ms = Date.parse(iso);
      if (Number.isFinite(ms) && ms > bestMs) {
        bestMs = ms;
        bestId = id;
      }
    } else if (bestId === null) {
      // Fall back to first item with a usable id.
      bestId = id;
    }
  }
  return bestId;
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

  const timelineLoading = i.timelineLoading === true;
  const alertsLoading = i.alertsLoading === true;
  const actionsLoading = i.actionsLoading === true;

  const hasAlertCount = !alertsLoading && isCountProvided(i.alertCount);
  const alertCount = hasAlertCount ? (i.alertCount as number) : null;
  const alertLabel = hasAlertCount ? countLabel("alert", alertCount as number) : null;

  const hasActionCount = !actionsLoading && isCountProvided(i.actionCount);
  const actionCount = hasActionCount ? (i.actionCount as number) : null;
  const actionLabel = hasActionCount
    ? countLabel("action", actionCount as number)
    : null;

  const alertsState: QuickStatusLoadState = alertsLoading
    ? "loading"
    : hasAlertCount
      ? "ready"
      : "unavailable";
  const actionsState: QuickStatusLoadState = actionsLoading
    ? "loading"
    : hasActionCount
      ? "ready"
      : "unavailable";

  const alertsStatusLabel =
    alertsState === "loading"
      ? ALERTS_LOADING_LABEL
      : alertsState === "unavailable"
        ? ALERTS_UNAVAILABLE_LABEL
        : null;
  const actionsStatusLabel =
    actionsState === "loading"
      ? ACTIONS_LOADING_LABEL
      : actionsState === "unavailable"
        ? ACTIONS_UNAVAILABLE_LABEL
        : null;

  const growId = nonBlankTrimmed(i.growId ?? null);
  const alertsLink: PlantQuickStatusLink = growId
    ? {
        label: ALERTS_LINK_LABEL,
        href: alertsPath(growId),
        disabled: false,
        disabledReason: null,
      }
    : {
        label: ALERTS_LINK_LABEL,
        href: null,
        disabled: true,
        disabledReason: ALERTS_LINK_DISABLED_REASON,
      };
  const actionsLink: PlantQuickStatusLink = growId
    ? {
        label: ACTIONS_LINK_LABEL,
        href: actionsPath(growId),
        disabled: false,
        disabledReason: null,
      }
    : {
        label: ACTIONS_LINK_LABEL,
        href: null,
        disabled: true,
        disabledReason: ACTIONS_LINK_DISABLED_REASON,
      };

  const latestId = pickLatestItemId(i.timelineItems ?? null);
  const viewLatestEntry: PlantQuickStatusViewLatest = latestId
    ? {
        label: VIEW_LATEST_LABEL,
        targetItemId: latestId,
        disabled: false,
        disabledReason: null,
      }
    : {
        label: VIEW_LATEST_LABEL,
        targetItemId: null,
        disabled: true,
        disabledReason: VIEW_LATEST_DISABLED_REASON,
      };

  const parts: string[] = [
    `Stage: ${stage.label}`,
    header.lastUpdatedLabel,
  ];
  if (alertLabel) parts.push(alertLabel);
  else if (alertsStatusLabel) parts.push(alertsStatusLabel);
  if (actionLabel) parts.push(actionLabel);
  else if (actionsStatusLabel) parts.push(actionsStatusLabel);

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
    timelineLoading,
    alertsState,
    actionsState,
    alertsStatusLabel,
    actionsStatusLabel,
    alertsLink,
    actionsLink,
    viewLatestEntry,
    compact: parts.join(" · "),
  };
}
