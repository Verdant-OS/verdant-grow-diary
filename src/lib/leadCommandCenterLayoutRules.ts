/**
 * Pure logic for the read-only Leads Command Center section layout.
 *
 * UI-only. No I/O, no Supabase calls, no lead data persisted.
 * Persists only section id + collapsed + order index under a single
 * localStorage key. Safe parse/sanitize.
 */

export type LeadCommandCenterSectionId =
  | "guidance"
  | "status_summary"
  | "pipeline_health"
  | "priority_queue"
  | "analytics"
  | "saved_views";

export interface LeadCommandCenterSection {
  id: LeadCommandCenterSectionId;
  label: string;
  collapsed: boolean;
  order: number;
}

export interface LeadCommandCenterLayout {
  sections: LeadCommandCenterSection[];
}

export const LEAD_COMMAND_CENTER_LAYOUT_STORAGE_KEY =
  "verdant.leads.commandCenterLayout.v1";

export const DEFAULT_SECTION_ORDER: readonly LeadCommandCenterSectionId[] = [
  "saved_views",
  "guidance",
  "status_summary",
  "pipeline_health",
  "priority_queue",
  "analytics",
] as const;

const SECTION_LABELS: Record<LeadCommandCenterSectionId, string> = {
  guidance: "Operator Guidance",
  status_summary: "Status Summary",
  pipeline_health: "Pipeline Health",
  priority_queue: "Priority Queue",
  analytics: "Analytics",
  saved_views: "Saved Views",
};

const KNOWN_IDS = new Set<LeadCommandCenterSectionId>(DEFAULT_SECTION_ORDER);

export function defaultLeadCommandCenterLayout(): LeadCommandCenterLayout {
  return {
    sections: DEFAULT_SECTION_ORDER.map((id, idx) => ({
      id,
      label: SECTION_LABELS[id],
      collapsed: false,
      order: idx,
    })),
  };
}

interface RawSection {
  id?: unknown;
  collapsed?: unknown;
  order?: unknown;
}

/**
 * Deterministically sanitize an arbitrary payload into a valid layout:
 *  - drop unknown ids
 *  - drop duplicates (first occurrence wins)
 *  - repair missing sections by appending in default order
 *  - reset order indices contiguously
 */
export function sanitizeLeadCommandCenterLayout(
  raw: unknown,
): LeadCommandCenterLayout {
  if (!raw || typeof raw !== "object") return defaultLeadCommandCenterLayout();
  const obj = raw as { sections?: unknown };
  if (!Array.isArray(obj.sections)) return defaultLeadCommandCenterLayout();

  const seen = new Set<LeadCommandCenterSectionId>();
  const cleaned: LeadCommandCenterSection[] = [];

  // Stable sort incoming entries by their provided order index, then by
  // discovery order, to keep deterministic output for the same input.
  const indexed = obj.sections
    .map((s, i) => ({ s: s as RawSection, i }))
    .filter((entry) => entry.s && typeof entry.s === "object");

  indexed.sort((a, b) => {
    const ao = typeof a.s.order === "number" ? a.s.order : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.s.order === "number" ? b.s.order : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.i - b.i;
  });

  for (const { s } of indexed) {
    const id = s.id;
    if (typeof id !== "string") continue;
    if (!KNOWN_IDS.has(id as LeadCommandCenterSectionId)) continue;
    const typed = id as LeadCommandCenterSectionId;
    if (seen.has(typed)) continue;
    seen.add(typed);
    cleaned.push({
      id: typed,
      label: SECTION_LABELS[typed],
      collapsed: s.collapsed === true,
      order: cleaned.length,
    });
  }

  // Repair missing sections by appending in default order.
  for (const id of DEFAULT_SECTION_ORDER) {
    if (seen.has(id)) continue;
    cleaned.push({
      id,
      label: SECTION_LABELS[id],
      collapsed: false,
      order: cleaned.length,
    });
  }

  return { sections: cleaned };
}

/**
 * Toggle collapsed state for a section. Returns a new layout; does not
 * mutate the input.
 */
export function toggleSectionCollapsed(
  layout: LeadCommandCenterLayout,
  id: LeadCommandCenterSectionId,
): LeadCommandCenterLayout {
  return {
    sections: layout.sections.map((s) =>
      s.id === id ? { ...s, collapsed: !s.collapsed } : s,
    ),
  };
}

export interface LayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Load + sanitize from storage. Empty/malformed yields defaults. */
export function loadLeadCommandCenterLayout(
  storage?: LayoutStorage | null,
): LeadCommandCenterLayout {
  if (!storage) return defaultLeadCommandCenterLayout();
  let raw: string | null = null;
  try {
    raw = storage.getItem(LEAD_COMMAND_CENTER_LAYOUT_STORAGE_KEY);
  } catch {
    return defaultLeadCommandCenterLayout();
  }
  if (!raw) return defaultLeadCommandCenterLayout();
  try {
    return sanitizeLeadCommandCenterLayout(JSON.parse(raw));
  } catch {
    return defaultLeadCommandCenterLayout();
  }
}

/**
 * Serialize ONLY UI layout preferences. Never includes lead data,
 * derived analytics, names, emails, notes, or any lead fields.
 */
export function serializeLeadCommandCenterLayout(
  layout: LeadCommandCenterLayout,
): string {
  return JSON.stringify({
    sections: layout.sections.map((s) => ({
      id: s.id,
      collapsed: s.collapsed === true,
      order: s.order,
    })),
  });
}

export function saveLeadCommandCenterLayout(
  layout: LeadCommandCenterLayout,
  storage?: LayoutStorage | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      LEAD_COMMAND_CENTER_LAYOUT_STORAGE_KEY,
      serializeLeadCommandCenterLayout(layout),
    );
  } catch {
    /* ignore quota / unavailable storage */
  }
}
