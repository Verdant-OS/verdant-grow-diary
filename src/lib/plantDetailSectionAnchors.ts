/**
 * plantDetailSectionAnchors — pure view-model for the Plant Detail
 * section jump-link nav.
 *
 * Deterministic. No React, no I/O, no Supabase, no fetch, no privileged
 * keys. Produces a stable list of in-page jump targets keyed by safe
 * static DOM anchor ids — NEVER database ids. The Plant Detail page
 * mounts the matching anchor elements so the buttons can scroll/focus
 * them.
 *
 * When a section depends on context that is not present (e.g. Alerts and
 * Actions require an assigned tent), the entry is kept visible but
 * rendered as disabled with a short observational reason. Sections are
 * never silently removed unless they don't exist on this page.
 */

export type PlantDetailSectionKind =
  | "overview"
  | "timeline"
  | "alerts"
  | "actions"
  | "doctor";

/** Stable static DOM anchor ids. Safe to expose in the DOM. */
export const PLANT_DETAIL_SECTION_ANCHORS: Record<
  PlantDetailSectionKind,
  string
> = {
  overview: "plant-overview",
  timeline: "plant-relative-timeline",
  alerts: "plant-alerts",
  actions: "plant-actions",
  doctor: "plant-doctor",
};

export interface PlantDetailSectionEntry {
  kind: PlantDetailSectionKind;
  label: string;
  /** Stable static DOM id (never a database id). */
  anchorId: string;
  testId: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface PlantDetailSectionAnchorsInput {
  /** Whether an Alerts panel section is mounted (the panel itself may be empty). */
  hasAlertsSection?: boolean;
  /** Whether an Actions panel section is mounted. */
  hasActionsSection?: boolean;
  /** Whether an AI Doctor sessions panel section is mounted. */
  hasDoctorSection?: boolean;
  /**
   * Whether a tent is assigned to the plant. Alerts and Actions panels
   * are tent-scoped and render observational fallbacks without one, so
   * the jump link is marked disabled with a reason rather than hidden.
   */
  hasAssignedTent?: boolean;
}

const LABELS: Record<PlantDetailSectionKind, string> = {
  overview: "Overview",
  timeline: "Timeline",
  alerts: "Alerts",
  actions: "Actions",
  doctor: "Doctor",
};

const NO_TENT_REASON = "No tent assigned yet.";

/**
 * Build the ordered section list. Sections that don't exist on the page
 * (e.g. Doctor when no Doctor sessions panel is rendered) are omitted.
 * Sections that exist but lack context are kept visible and disabled.
 */
export function buildPlantDetailSectionAnchors(
  input: PlantDetailSectionAnchorsInput,
): PlantDetailSectionEntry[] {
  const {
    hasAlertsSection = true,
    hasActionsSection = true,
    hasDoctorSection = true,
    hasAssignedTent = false,
  } = input;

  const entries: PlantDetailSectionEntry[] = [
    {
      kind: "overview",
      label: LABELS.overview,
      anchorId: PLANT_DETAIL_SECTION_ANCHORS.overview,
      testId: "plant-detail-section-link-overview",
    },
    {
      kind: "timeline",
      label: LABELS.timeline,
      anchorId: PLANT_DETAIL_SECTION_ANCHORS.timeline,
      testId: "plant-detail-section-link-timeline",
    },
  ];

  if (hasAlertsSection) {
    entries.push({
      kind: "alerts",
      label: LABELS.alerts,
      anchorId: PLANT_DETAIL_SECTION_ANCHORS.alerts,
      testId: "plant-detail-section-link-alerts",
      disabled: !hasAssignedTent,
      disabledReason: hasAssignedTent ? undefined : NO_TENT_REASON,
    });
  }

  if (hasActionsSection) {
    entries.push({
      kind: "actions",
      label: LABELS.actions,
      anchorId: PLANT_DETAIL_SECTION_ANCHORS.actions,
      testId: "plant-detail-section-link-actions",
      disabled: !hasAssignedTent,
      disabledReason: hasAssignedTent ? undefined : NO_TENT_REASON,
    });
  }

  if (hasDoctorSection) {
    entries.push({
      kind: "doctor",
      label: LABELS.doctor,
      anchorId: PLANT_DETAIL_SECTION_ANCHORS.doctor,
      testId: "plant-detail-section-link-doctor",
    });
  }

  return entries;
}
