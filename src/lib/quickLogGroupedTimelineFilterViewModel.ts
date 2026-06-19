import type { QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";

export const QUICK_LOG_GROUPED_TIMELINE_FILTERS = [
  "all",
  "water",
  "note",
  "environment",
  "ai-doctor-evidence",
] as const;

export type QuickLogGroupedTimelineFilter =
  (typeof QUICK_LOG_GROUPED_TIMELINE_FILTERS)[number];

export const QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS: Record<
  QuickLogGroupedTimelineFilter,
  string
> = {
  all: "All",
  water: "Water",
  note: "Note",
  environment: "Environment",
  "ai-doctor-evidence": "AI Doctor evidence",
};

export function isQuickLogGroupedTimelineFilter(
  v: unknown,
): v is QuickLogGroupedTimelineFilter {
  return (
    typeof v === "string" &&
    (QUICK_LOG_GROUPED_TIMELINE_FILTERS as ReadonlyArray<string>).includes(v)
  );
}

export function entryHasAiDoctorPhase1Evidence(
  entry: QuickLogTimelineEntry,
): boolean {
  if (entry.kind === "environment") return false;
  return !!entry.action.aiDoctorPhase1Evidence;
}

export function entryMatchesQuickLogGroupedTimelineFilter(
  entry: QuickLogTimelineEntry,
  filter: QuickLogGroupedTimelineFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "ai-doctor-evidence") {
    return entryHasAiDoctorPhase1Evidence(entry);
  }
  if (filter === "water") {
    if (entry.kind === "grouped") return entry.action.kind === "water";
    if (entry.kind === "action") return entry.action.kind === "water";
    return false;
  }
  if (filter === "note") {
    if (entry.kind === "grouped") return entry.action.kind === "note";
    if (entry.kind === "action") return entry.action.kind === "note";
    return false;
  }
  if (entry.kind === "environment") return true;
  if (entry.kind === "grouped") return true;
  return false;
}

export function filterQuickLogGroupedTimelineEntries(
  entries: ReadonlyArray<QuickLogTimelineEntry>,
  filter: QuickLogGroupedTimelineFilter,
): QuickLogTimelineEntry[] {
  return entries.filter((e) =>
    entryMatchesQuickLogGroupedTimelineFilter(e, filter),
  );
}

export const QUICK_LOG_GROUPED_TIMELINE_EMPTY_OVERALL_TEXT =
  "No QuickLog entries yet.";
export const QUICK_LOG_GROUPED_TIMELINE_EMPTY_FILTERED_TEXT =
  "No QuickLog entries match this filter.";
export const QUICK_LOG_GROUPED_TIMELINE_AI_EVIDENCE_EMPTY_TITLE_TEXT =
  "No AI Doctor Phase 1 evidence yet.";
export const QUICK_LOG_GROUPED_TIMELINE_AI_EVIDENCE_EMPTY_HINT_TEXT =
  "Saved Phase 1 evidence will appear here after you review AI Doctor context and save it as evidence.";
export const QUICK_LOG_GROUPED_TIMELINE_AI_EVIDENCE_RESULTS_BUTTON_LABEL =
  "Open AI Doctor Results";
export const QUICK_LOG_GROUPED_TIMELINE_CREATE_BUTTON_LABEL =
  "Create Quick Log";

export const QUICK_LOG_GROUPED_TIMELINE_EMPTY_TITLE_TEXT =
  "No timeline entries yet.";
export const QUICK_LOG_GROUPED_TIMELINE_EMPTY_HINT_TEXT =
  "Add a Quick Log to start this plant's history.";

export const QUICK_LOG_MANUAL_SOURCE_LABEL = "Manual";
export const QUICK_LOG_DEMO_SOURCE_LABEL = "Demo data";
export const QUICK_LOG_SAMPLE_SOURCE_LABEL = "Sample timeline entry";

export const QUICK_LOG_ACTION_LABELS = {
  water: "Watering",
  note: "Note",
} as const;

export function quickLogActionLabel(kind: "water" | "note"): string {
  return QUICK_LOG_ACTION_LABELS[kind];
}

export function formatQuickLogOccurredAt(
  iso: string | null | undefined,
): string {
  if (typeof iso !== "string" || iso.length === 0) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(new Date(ms)) + " UTC";
  } catch {
    return iso;
  }
}

export function quickLogSourceAccessibleLabel(sourceLabel: string): string {
  return `Source: ${sourceLabel}`;
}

export function quickLogOccurredAtAccessibleLabel(
  formattedOccurredAt: string,
): string {
  return `Occurred at ${formattedOccurredAt}`;
}
