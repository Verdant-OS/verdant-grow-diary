import {
  PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID,
  PLANT_PHOTOS_ANCHOR_ID,
  PLANT_RELATIVE_TIMELINE_ANCHOR_ID,
} from "@/lib/plantDetailQuickActions";
import { PLANT_DETAIL_SECTION_ANCHORS } from "@/lib/plantDetailSectionAnchors";

export type PlantDetailDisclosureGroup = "history" | "harvest" | "ai";

export const PLANT_AI_DOCTOR_CONTEXT_PANEL_ANCHOR_ID = "plant-ai-doctor-context-panel" as const;
export const PLANT_DETAIL_HARVEST_EVIDENCE_ANCHOR_ID = "plant-harvest-evidence" as const;
export const PLANT_RECENT_ACTIVITY_ANCHOR_ID = "plant-recent-activity" as const;

const ANCHOR_GROUPS = {
  [PLANT_DETAIL_SECTION_ANCHORS.overview]: null,
  [PLANT_PHOTOS_ANCHOR_ID]: null,
  [PLANT_RELATIVE_TIMELINE_ANCHOR_ID]: "history",
  [PLANT_RECENT_ACTIVITY_ANCHOR_ID]: "history",
  [PLANT_DETAIL_SECTION_ANCHORS.alerts]: null,
  [PLANT_DETAIL_SECTION_ANCHORS.actions]: null,
  [PLANT_DETAIL_SECTION_ANCHORS.doctor]: "ai",
  [PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID]: "ai",
  [PLANT_AI_DOCTOR_CONTEXT_PANEL_ANCHOR_ID]: "ai",
  [PLANT_DETAIL_HARVEST_EVIDENCE_ANCHOR_ID]: "harvest",
} as const satisfies Record<string, PlantDetailDisclosureGroup | null>;

export type PlantDetailKnownAnchorId = keyof typeof ANCHOR_GROUPS;

export interface PlantDetailDisclosureTarget {
  anchorId: PlantDetailKnownAnchorId;
  group: PlantDetailDisclosureGroup | null;
}

function normalizeAnchorTarget(target: unknown): string | null {
  if (typeof target !== "string" || target.length === 0) return null;
  const anchorId = target.startsWith("#") ? target.slice(1) : target;
  if (!anchorId || anchorId.includes("#")) return null;
  return anchorId;
}

/**
 * Resolves only exact, static Plant Detail anchors. It intentionally does not
 * trim or decode input, so encoded, whitespace-padded, path-like, and control
 * character variants fail closed instead of opening unrelated page content.
 */
export function resolvePlantDetailDisclosureTarget(
  target: unknown,
): PlantDetailDisclosureTarget | null {
  const anchorId = normalizeAnchorTarget(target);
  if (!anchorId || !Object.prototype.hasOwnProperty.call(ANCHOR_GROUPS, anchorId)) {
    return null;
  }
  const knownAnchorId = anchorId as PlantDetailKnownAnchorId;
  return {
    anchorId: knownAnchorId,
    group: ANCHOR_GROUPS[knownAnchorId],
  };
}

export function resolvePlantDetailDisclosureGroup(
  target: unknown,
): PlantDetailDisclosureGroup | null {
  return resolvePlantDetailDisclosureTarget(target)?.group ?? null;
}
