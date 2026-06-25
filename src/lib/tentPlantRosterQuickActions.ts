/**
 * tentPlantRosterQuickActions — pure helper that builds the compact
 * row-level quick-action menu for the Tent Plant Roster.
 *
 * Deterministic. No React, no I/O, no Supabase, no AI/model calls, no
 * alerts, no Action Queue writes, no device control.
 *
 * Builds entries that either:
 *   - navigate to existing Plant Detail (optionally with an in-page anchor),
 *   - dispatch the existing `verdant:open-quicklog` event with already-known
 *     plant/tent/grow context as the event detail
 *     (PLANT_QUICKLOG_PREFILL_EVENT).
 *
 * Read-only. Does NOT create a new Quick Log save path, does NOT mutate
 * tent/plant data, does NOT add Harvest Watch recommendations.
 */
import { plantDetailPath } from "@/lib/routes";
import {
  PLANT_RELATIVE_TIMELINE_ANCHOR_ID,
  PLANT_PHOTOS_ANCHOR_ID,
} from "@/lib/plantDetailQuickActions";
import {
  PLANT_QUICKLOG_PREFILL_EVENT,
  type PlantQuickLogPrefill,
} from "@/lib/plantQuickLogPrefillRules";

export { PLANT_QUICKLOG_PREFILL_EVENT };

export type TentPlantRosterQuickActionKind =
  | "view_diary"
  | "add_quicklog"
  | "view_photos";

export interface TentPlantRosterQuickActionContext {
  tentId: string | null | undefined;
  tentName?: string | null;
  growId?: string | null;
}

export interface TentPlantRosterQuickActionPlantInput {
  plantId: string | null | undefined;
  plantName?: string | null;
}

export interface TentPlantRosterQuickActionsInput
  extends TentPlantRosterQuickActionPlantInput,
    TentPlantRosterQuickActionContext {
  /**
   * Override for the photos anchor availability. Defaults to true now that
   * Plant Detail renders a dedicated `plant-photos` anchor. Tests/storybook
   * can pass `false` to force the fallback (no-anchor) behavior.
   */
  photosAnchorAvailable?: boolean;
}

/** UI copy surfaced under the View Photos entry when the anchor is unavailable. */
export const TENT_PLANT_ROSTER_PHOTOS_FALLBACK_HINT_COPY =
  "Photos open on Plant Detail. Dedicated photo jump is not available yet.";

export interface TentPlantRosterQuickActionEntry {
  kind: TentPlantRosterQuickActionKind;
  label: string;
  /** Defined when the entry navigates to an existing route. */
  href?: string;
  /** Defined when the entry dispatches a global event instead of navigating. */
  event?: "open-quicklog";
  /** Forwarded as CustomEvent `detail` for `event` entries. */
  eventPayload?: PlantQuickLogPrefill | null;
  /** Stable testId for assertions. */
  testId: string;
  /**
   * True when the entry navigates to Plant Detail but the requested
   * in-page anchor is not available. Presenter may surface a small
   * observational note; the entry is still actionable.
   */
  anchorBlocked?: boolean;
  /** Disabled when required context (plantId) is missing. */
  disabled?: boolean;
  disabledReason?: string;
}

const DIARY_ANCHOR_AVAILABLE = true;
const PHOTOS_ANCHOR_AVAILABLE_DEFAULT = true;

function buildPrefill(
  input: TentPlantRosterQuickActionsInput,
): PlantQuickLogPrefill | null {
  const { plantId, tentId, growId } = input;
  if (!plantId || !tentId || !growId) return null;
  return {
    plantId,
    plantName: input.plantName ?? null,
    growId,
    tentId,
    tentName: input.tentName ?? null,
    eventType: "observation",
    suggestSnapshot: true,
  };
}

/** Accessible label for the row trigger including the plant name. */
export function tentPlantRosterQuickActionsTriggerLabel(
  plantName: string | null | undefined,
): string {
  const name =
    typeof plantName === "string" && plantName.trim().length > 0
      ? plantName.trim()
      : "this plant";
  return `Open actions for ${name}`;
}

export function buildTentPlantRosterQuickActions(
  input: TentPlantRosterQuickActionsInput,
): TentPlantRosterQuickActionEntry[] {
  const plantId =
    typeof input.plantId === "string" && input.plantId.length > 0
      ? input.plantId
      : null;

  const photosAnchorAvailable =
    input.photosAnchorAvailable === false ? false : PHOTOS_ANCHOR_AVAILABLE_DEFAULT;

  const plantDetailHref = plantId ? plantDetailPath(plantId) : "#";
  const diaryHref = plantId
    ? DIARY_ANCHOR_AVAILABLE
      ? `${plantDetailHref}#${PLANT_RELATIVE_TIMELINE_ANCHOR_ID}`
      : plantDetailHref
    : "#";
  const photosHref = plantId
    ? photosAnchorAvailable
      ? `${plantDetailHref}#${PLANT_PHOTOS_ANCHOR_ID}`
      : plantDetailHref
    : "#";

  const prefill = buildPrefill(input);

  const testIdBase = plantId
    ? `tent-plant-roster-row-${plantId}-action`
    : "tent-plant-roster-row-action";

  return [
    {
      kind: "view_diary",
      label: "View diary",
      href: diaryHref,
      testId: `${testIdBase}-view-diary`,
      anchorBlocked: !DIARY_ANCHOR_AVAILABLE,
      disabled: !plantId,
      disabledReason: plantId ? undefined : "Plant context is not loaded yet.",
    },
    {
      kind: "add_quicklog",
      label: "Add Quick Log",
      event: "open-quicklog",
      eventPayload: prefill,
      testId: `${testIdBase}-add-quicklog`,
      disabled: !prefill,
      disabledReason: prefill
        ? undefined
        : "Plant, tent, or grow context is not loaded yet.",
    },
    {
      kind: "view_photos",
      label: "View photos",
      href: photosHref,
      testId: `${testIdBase}-view-photos`,
      anchorBlocked: !photosAnchorAvailable,
      disabled: !plantId,
      disabledReason: plantId ? undefined : "Plant context is not loaded yet.",
    },
  ];
}

/** Dispatches the existing Quick Log prefill event on `window`. */
export function dispatchTentPlantRosterQuickLog(
  payload: PlantQuickLogPrefill | null | undefined,
): void {
  if (typeof window === "undefined") return;
  if (!payload) return;
  window.dispatchEvent(
    new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: payload }),
  );
}
