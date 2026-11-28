/**
 * At-a-glance name list for the top of Grow and Tent pages (Cheek,
 * 2026-11-28): the first names show right away, a busy list shows a total and
 * a "See all" control that expands on the same page, and desktop shows more
 * names than a phone. Pure: no React, no I/O, no clock.
 */

export interface GlanceNameItem {
  id: string;
  label: string;
  href: string;
}

/** Names shown before "See all" on a phone, and from the sm breakpoint up. */
export const GLANCE_MOBILE_LIMIT = 6;
export const GLANCE_DESKTOP_LIMIT = 12;

export type GlanceItemVisibility = "always" | "desktop" | "expanded";

export interface GlanceNameListView {
  state: "loading" | "unknown" | "empty" | "list";
  /** Verified total, or null while the read is not complete. */
  total: number | null;
  items: Array<GlanceNameItem & { visibility: GlanceItemVisibility }>;
  /** Show the See all / Show fewer control at all. */
  showToggle: boolean;
  /** The control is only needed on a phone (every name fits on desktop). */
  toggleMobileOnly: boolean;
  expanded: boolean;
}

export interface GlanceNameListInput {
  items: readonly GlanceNameItem[] | null | undefined;
  /** True when the list read is current and complete, so an empty list means none. */
  complete: boolean;
  /** True while the first read is still pending. */
  loading: boolean;
  expanded: boolean;
  mobileLimit?: number;
  desktopLimit?: number;
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}

export function buildGlanceNameListView(input: GlanceNameListInput): GlanceNameListView {
  const rows = (input.items ?? []).filter(
    (item) => item != null && typeof item.id === "string" && item.id.length > 0,
  );
  const mobile = positiveLimit(input.mobileLimit, GLANCE_MOBILE_LIMIT);
  const desktop = Math.max(mobile, positiveLimit(input.desktopLimit, GLANCE_DESKTOP_LIMIT));
  const base = { expanded: input.expanded, showToggle: false, toggleMobileOnly: false };

  if (rows.length === 0) {
    // Never claim "none" from a read that has not completed.
    if (input.complete) return { ...base, state: "empty", total: 0, items: [] };
    return { ...base, state: input.loading ? "loading" : "unknown", total: null, items: [] };
  }

  const visibilityAt = (index: number): GlanceItemVisibility => {
    if (input.expanded || index < mobile) return "always";
    return index < desktop ? "desktop" : "expanded";
  };
  const items = rows.map((item, index) => ({ ...item, visibility: visibilityAt(index) }));
  const showToggle = rows.length > mobile;
  return {
    state: "list",
    total: input.complete ? rows.length : null,
    items,
    expanded: input.expanded,
    showToggle,
    // When collapsed and every name fits the desktop limit, the control is a phone-only need.
    toggleMobileOnly: showToggle && !input.expanded && rows.length <= desktop,
  };
}

/** "See all 24 plants" / "Show fewer plants". */
export function formatGlanceToggleLabel(
  view: Pick<GlanceNameListView, "expanded" | "total" | "items">,
  noun: { singular: string; plural: string },
): string {
  if (view.expanded) return `Show fewer ${noun.plural}`;
  const count = view.total ?? view.items.length;
  return `See all ${count} ${count === 1 ? noun.singular : noun.plural}`;
}

/** Heading count, e.g. "Plants (24)"; no count while the total is unverified. */
export function formatGlanceHeading(
  title: string,
  view: Pick<GlanceNameListView, "total">,
): string {
  return view.total === null ? title : `${title} (${view.total})`;
}

/** Stable order by label (case-insensitive), then id. */
export function sortGlanceItemsByLabel(items: readonly GlanceNameItem[]): GlanceNameItem[] {
  return items.slice().sort((a, b) => {
    const byLabel = a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    if (byLabel !== 0) return byLabel;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
