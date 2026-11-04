/**
 * Visible grow switcher for Timeline (grower bug brief 2026-11-03, item 16:
 * "the grow switcher is a hidden native select").
 *
 * Pure. The URL `?growId=` already wins over the stored active grow on
 * Timeline, so switching writes only the URL. Plant/tent filters and an open
 * entry belong to the old grow and are dropped; date and source filters stay.
 */
import { SENSOR_PLANT_PARAM } from "@/lib/sensorSourceUrlRules";
import { TIMELINE_ENTRY_DETAIL_PARAM } from "@/lib/timelineEntryDetailPermalinkRules";

export const TIMELINE_GROW_SWITCHER_COPY = {
  label: "Grow",
  untitled: "Untitled grow",
  choose: "Choose a grow",
} as const;

export interface GrowLike {
  id: string;
  name?: string | null;
}

export interface TimelineGrowSwitcher {
  value: string;
  options: Array<{ id: string; label: string }>;
}

/** Null when there is nothing to switch between (fewer than two grows). */
export function buildTimelineGrowSwitcher(input: {
  grows: readonly GrowLike[] | null | undefined;
  activeGrowId: string | null | undefined;
}): TimelineGrowSwitcher | null {
  const options = (input.grows ?? [])
    .filter((g): g is GrowLike => typeof g?.id === "string" && g.id.trim().length > 0)
    .map((g) => ({ id: g.id, label: g.name?.trim() || TIMELINE_GROW_SWITCHER_COPY.untitled }));
  if (options.length < 2) return null;
  const active = input.activeGrowId?.trim() ?? "";
  return { value: options.some((o) => o.id === active) ? active : "", options };
}

/** URL params after choosing `growId`; grow-specific filters are dropped. */
export function timelineGrowSwitchSearch(
  current: URLSearchParams,
  growId: string,
): URLSearchParams {
  const next = new URLSearchParams(current);
  next.set("growId", growId);
  next.delete(SENSOR_PLANT_PARAM);
  next.delete("tentId");
  next.delete(TIMELINE_ENTRY_DETAIL_PARAM);
  return next;
}
