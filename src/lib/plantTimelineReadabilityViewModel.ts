/**
 * plantTimelineReadabilityViewModel — pure, read-only view-model helpers
 * for the Plant Relative Timeline readability pass.
 *
 * Hard contract:
 *  - Pure, deterministic, null-safe. No I/O, no React, no side effects.
 *  - No writes, no Supabase, no AI calls, no automation, no device control.
 *  - Reads ONLY the already-derived counts/labels passed in by the
 *    presenter. Never inspects raw payloads, tokens, MACs, bridge IDs,
 *    or any private values.
 *  - Print output never includes raw IDs / internal debug fields; only
 *    the human-readable counts and filter label.
 *  - Copy is calm and factual: "current view", "visible entries",
 *    "filter active", "evidence shown in this view", "print summary".
 *    See paired test for the banned-wording list.
 */

export interface BuildPlantTimelineReadabilitySummaryInput {
  /** Total projected timeline entries (across all categories). */
  totalEntries: number | null | undefined;
  /** Entries currently visible after filter chips applied. */
  visibleEntries: number | null | undefined;
  /** Active filter chip key, e.g. "all" | "watering" | …. */
  filterKey?: string | null;
  /** Human label of the active filter chip, e.g. "All", "Watering". */
  filterLabel?: string | null;
  /** Number of stage/day group headers currently rendered. */
  groupCount: number | null | undefined;
  /** Optional: total category sections (typically 7). */
  totalSections?: number | null;
  /** Optional: category sections currently showing evidence. */
  sectionsWithEvidence?: number | null;
}

export interface PlantTimelineReadabilitySummaryPart {
  key:
    | "visible"
    | "groups"
    | "evidence-sections"
    | "filter-active"
    | "filter-cleared";
  label: string;
}

export interface PlantTimelineReadabilitySummary {
  isFiltered: boolean;
  visibleEntries: number;
  totalEntries: number;
  groupCount: number;
  totalSections: number;
  sectionsWithEvidence: number;
  /** Compact ordered parts the presenter can join with " · ". */
  parts: PlantTimelineReadabilitySummaryPart[];
  /** Single concatenated line for presenters that prefer one string. */
  line: string;
  /** Calm filter-state copy, always uses "current view" language. */
  filterCopy: string;
}

function toFiniteNonNegativeInt(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function isFilterKeyAll(key: string | null | undefined): boolean {
  return key == null || key === "" || key === "all";
}

function safeFilterLabel(label: string | null | undefined): string {
  if (typeof label !== "string") return "";
  return label.trim();
}

export function buildPlantTimelineReadabilitySummary(
  input: BuildPlantTimelineReadabilitySummaryInput | null | undefined,
): PlantTimelineReadabilitySummary {
  const src = input ?? ({} as BuildPlantTimelineReadabilitySummaryInput);
  const totalEntries = toFiniteNonNegativeInt(src.totalEntries);
  const visibleEntries = Math.min(
    toFiniteNonNegativeInt(src.visibleEntries),
    totalEntries === 0 ? toFiniteNonNegativeInt(src.visibleEntries) : totalEntries,
  );
  const groupCount = toFiniteNonNegativeInt(src.groupCount);
  const totalSections = toFiniteNonNegativeInt(src.totalSections);
  const sectionsWithEvidence = Math.min(
    toFiniteNonNegativeInt(src.sectionsWithEvidence),
    totalSections === 0 ? toFiniteNonNegativeInt(src.sectionsWithEvidence) : totalSections,
  );

  const isFiltered = !isFilterKeyAll(src.filterKey);
  const filterLabel = safeFilterLabel(src.filterLabel);

  const parts: PlantTimelineReadabilitySummaryPart[] = [];
  parts.push({
    key: "visible",
    label: `${visibleEntries} visible ${visibleEntries === 1 ? "entry" : "entries"}`,
  });
  parts.push({
    key: "groups",
    label: `${groupCount} ${groupCount === 1 ? "group" : "groups"}`,
  });
  if (totalSections > 0) {
    parts.push({
      key: "evidence-sections",
      label: `${sectionsWithEvidence}/${totalSections} sections with evidence`,
    });
  }

  let filterCopy: string;
  if (isFiltered) {
    const labelPart = filterLabel.length > 0 ? `: ${filterLabel}` : "";
    filterCopy = `Filter active${labelPart}. Showing the current view, not all time.`;
    parts.push({ key: "filter-active", label: `Filter: ${filterLabel || "active"}` });
  } else {
    filterCopy = "No filter active. Showing the current view of all logged entries.";
    parts.push({ key: "filter-cleared", label: "No filter" });
  }

  const line = parts.map((p) => p.label).join(" · ");

  return {
    isFiltered,
    visibleEntries,
    totalEntries,
    groupCount,
    totalSections,
    sectionsWithEvidence,
    parts,
    line,
    filterCopy,
  };
}

// ---------------------------------------------------------------------------
// Print-friendly summary
// ---------------------------------------------------------------------------

export interface BuildPlantTimelinePrintSummaryInput
  extends BuildPlantTimelineReadabilitySummaryInput {
  /** Optional plant display name (no internal IDs). */
  plantName?: string | null;
  /** Optional tent display name (no internal IDs). */
  tentName?: string | null;
  /** Optional grow display name (no internal IDs). */
  growName?: string | null;
}

export interface PlantTimelinePrintSummaryLine {
  key:
    | "title"
    | "context"
    | "filter"
    | "visible"
    | "groups"
    | "evidence-sections"
    | "safety";
  label: string;
}

export interface PlantTimelinePrintSummary {
  lines: PlantTimelinePrintSummaryLine[];
  safetyNote: string;
}

export const PLANT_TIMELINE_PRINT_SAFETY_NOTE =
  "This summary reflects the current filtered timeline view. It is diary context only and does not automate decisions.";

const PRIVATE_ID_TOKENS = [
  "user_id",
  "tent_id",
  "grow_id",
  "plant_id",
  "raw_payload",
  "bridge_token",
  "service_role",
  "access_token",
];

function stripPrivateTokens(value: string): string {
  let out = value;
  for (const token of PRIVATE_ID_TOKENS) {
    if (out.toLowerCase().includes(token)) {
      // Defensive: never let an upstream label leak token-like fields.
      out = out.replace(new RegExp(token, "ig"), "");
    }
  }
  // Strip UUID-like substrings (8-4-4-4-12 hex). Diary context only.
  out = out.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    "",
  );
  return out.replace(/\s{2,}/g, " ").trim();
}

function safeDisplayName(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return stripPrivateTokens(value);
}

export function buildPlantTimelinePrintSummary(
  input: BuildPlantTimelinePrintSummaryInput | null | undefined,
): PlantTimelinePrintSummary {
  const src = input ?? ({} as BuildPlantTimelinePrintSummaryInput);
  const summary = buildPlantTimelineReadabilitySummary(src);

  const lines: PlantTimelinePrintSummaryLine[] = [
    { key: "title", label: "Plant timeline — print summary" },
  ];

  const plantName = safeDisplayName(src.plantName);
  const tentName = safeDisplayName(src.tentName);
  const growName = safeDisplayName(src.growName);
  const contextParts: string[] = [];
  if (plantName) contextParts.push(`Plant: ${plantName}`);
  if (tentName) contextParts.push(`Tent: ${tentName}`);
  if (growName) contextParts.push(`Grow: ${growName}`);
  if (contextParts.length > 0) {
    lines.push({ key: "context", label: contextParts.join(" · ") });
  }

  lines.push({ key: "filter", label: summary.filterCopy });
  lines.push({
    key: "visible",
    label: `Visible entries: ${summary.visibleEntries} of ${summary.totalEntries} total in the current view.`,
  });
  lines.push({
    key: "groups",
    label: `Groups shown: ${summary.groupCount}.`,
  });
  if (summary.totalSections > 0) {
    lines.push({
      key: "evidence-sections",
      label: `Evidence shown in this view: ${summary.sectionsWithEvidence} of ${summary.totalSections} category sections.`,
    });
  }
  lines.push({ key: "safety", label: PLANT_TIMELINE_PRINT_SAFETY_NOTE });

  return { lines, safetyNote: PLANT_TIMELINE_PRINT_SAFETY_NOTE };
}
