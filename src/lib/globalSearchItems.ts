/**
 * globalSearchItems — pure data source for the global command-palette
 * search. Kept generic: presenters receive a stable, typed list and
 * decide how to render/filter. No I/O, no React, no fetch.
 *
 * Additions here are the only place to add a searchable destination.
 * Keep labels aligned with the sidebar / mobile nav so nav↔search stays
 * consistent.
 */

export interface GlobalSearchItem {
  /** User-visible label. */
  label: string;
  /** In-app route to navigate to on select. */
  to: string;
  /** Group heading used to organize results. */
  group: string;
  /** Extra keywords to broaden fuzzy matches. */
  keywords?: readonly string[];
}

export const GLOBAL_SEARCH_ITEMS: readonly GlobalSearchItem[] = [
  // Today
  { label: "Dashboard", to: "/", group: "Today", keywords: ["home", "overview"] },
  { label: "Quick Log", to: "/daily-check", group: "Today", keywords: ["log", "diary"] },
  // Cultivation
  { label: "Tents", to: "/tents", group: "Cultivation" },
  { label: "Plants", to: "/plants", group: "Cultivation" },
  { label: "My Grows", to: "/grows", group: "Cultivation", keywords: ["harvest", "archive"] },
  // Daily
  { label: "Timeline", to: "/timeline", group: "Daily" },
  { label: "Alerts", to: "/alerts", group: "Daily" },
  { label: "Action Queue", to: "/actions", group: "Daily" },
  { label: "Tasks", to: "/tasks", group: "Daily" },
  // Insight
  { label: "Sensors", to: "/sensors", group: "Insight" },
  { label: "AI Doctor", to: "/doctor", group: "Insight", keywords: ["coach", "diagnosis"] },
  { label: "Reports", to: "/reports", group: "Insight", keywords: ["learning", "hub"] },
  // Advanced
  { label: "Lineage Repair", to: "/grow-lineage", group: "Advanced" },
  // Account
  { label: "Settings", to: "/settings", group: "Account" },
  { label: "Preferences", to: "/account/preferences", group: "Account" },
  // Guides
  { label: "Guides", to: "/guides", group: "Help" },
  { label: "Cannabis Plant Care FAQ", to: "/guides/cannabis-plant-care", group: "Help" },
];

/**
 * Filter items by a free-text query. Case-insensitive, matches on label,
 * route, and keywords. Empty query returns all items unchanged.
 */
export function filterGlobalSearchItems(
  items: readonly GlobalSearchItem[],
  query: string,
): GlobalSearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((it) => {
    const hay = [it.label, it.to, it.group, ...(it.keywords ?? [])]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
