/**
 * quickLogEventTypes — canonical Quick Log event type identifiers for
 * V0 harvest/cure logging.
 *
 * Pure constants. No React, no I/O.
 *
 * NOTE on wiring scope:
 *  - `harvest` already exists in `src/lib/diary.ts#EVENT_TYPES`.
 *  - `cure_check` is new and intentionally NOT added to the legacy
 *    QuickLog RPC allow-list (`SUPPORTED_LEGACY_EVENT_TYPES`) in this
 *    slice, because that path is gated by a DB-side validate trigger
 *    (`watering | feeding | training | observation | photo | environment`).
 *    Adding it to the RPC would require schema/trigger changes, which
 *    this slice explicitly excludes.
 *  - The constants, rules, and presenter view-model below are wired into
 *    the timeline rendering layer and are the safe foundation for the
 *    follow-up slice that adds the RPC/trigger support.
 */

export const QUICK_LOG_HARVEST_EVENT_TYPE = "harvest" as const;
export const QUICK_LOG_CURE_CHECK_EVENT_TYPE = "cure_check" as const;

export type QuickLogHarvestCureEventType =
  | typeof QUICK_LOG_HARVEST_EVENT_TYPE
  | typeof QUICK_LOG_CURE_CHECK_EVENT_TYPE;

export const QUICK_LOG_HARVEST_CURE_EVENT_TYPES: readonly QuickLogHarvestCureEventType[] =
  [QUICK_LOG_HARVEST_EVENT_TYPE, QUICK_LOG_CURE_CHECK_EVENT_TYPE] as const;

export const QUICK_LOG_HARVEST_CURE_LABELS: Record<
  QuickLogHarvestCureEventType,
  string
> = {
  harvest: "Harvest",
  cure_check: "Cure check",
};

export const QUICK_LOG_TRIM_STYLES = [
  "wet_trim",
  "dry_trim",
  "partial_trim",
  "unknown",
] as const;
export type QuickLogTrimStyle = (typeof QUICK_LOG_TRIM_STYLES)[number];

export const QUICK_LOG_KEEPER_STATUSES = ["yes", "no", "undecided"] as const;
export type QuickLogKeeperStatus = (typeof QUICK_LOG_KEEPER_STATUSES)[number];

export const QUICK_LOG_MOLD_CHECK_STATUSES = [
  "clear",
  "concern",
  "unknown",
] as const;
export type QuickLogMoldCheckStatus =
  (typeof QUICK_LOG_MOLD_CHECK_STATUSES)[number];

export const QUICK_LOG_BURPED_VALUES = ["yes", "no"] as const;
export type QuickLogBurpedValue = (typeof QUICK_LOG_BURPED_VALUES)[number];

/**
 * Cautious memory-only copy. Used by the timeline presenter for harvest
 * cards. Never claims yield / quality / certainty.
 */
export const QUICK_LOG_HARVEST_RECORDED_NOTE =
  "Harvest data is recorded as grow memory; outcomes should be compared after dry/cure.";

/**
 * Caution copy for cure_check when mold_check === "concern". Renders as
 * grower-decision text only — never triggers an alert or Action Queue
 * item from this layer.
 */
export const QUICK_LOG_CURE_MOLD_CONCERN_NOTE =
  "Observed concern — grower decision required. Check again and document next observation.";
