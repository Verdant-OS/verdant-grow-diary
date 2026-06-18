/**
 * harvestInspectionQuickLogPreviewRules — pure helpers for the Quick Log
 * preview that renders when Quick Log is opened from Harvest Watch with
 * a harvest inspection preset.
 *
 * Hard constraints:
 *   - Pure. No I/O. No React. No Supabase. No AI calls. No alerts. No
 *     Action Queue writes. No automation. No device control.
 *   - Read-only over the prefill the caller already received.
 *   - Caution & review copy are mandated literals enforced by tests.
 *   - Never recommends harvest action. Never contains forbidden harvest
 *     instruction phrasing ("harvest now", "ready to harvest", "optimal",
 *     "guaranteed", "chop", "flush", "dark period", "fix immediately",
 *     "plant is unhealthy").
 */
import {
  HARVEST_INSPECTION_PRESET_LABEL,
  type HarvestInspectionPreset,
} from "@/lib/harvestInspectionQuickLogRules";

export const HARVEST_INSPECTION_PREVIEW_SOURCE = "harvest-watch-inspection" as const;

export const HARVEST_INSPECTION_PREVIEW_CAUTION =
  "Harvest Watch is evidence-only. The grower decides." as const;

export const HARVEST_INSPECTION_PREVIEW_REVIEW_COPY =
  "Review this diary evidence before saving. This does not create an alert, Action Queue item, or harvest instruction." as const;

/** Visible preset labels (mandated copy). */
export const HARVEST_INSPECTION_PREVIEW_LABEL: Record<
  HarvestInspectionPreset,
  string
> = {
  trichome_inspection: "Trichome inspection",
  pistil_recession: "Pistil / recession observation",
  bud_maturity: "Bud maturity note",
  close_flower_photo: "Close flower photo",
};

const VALID_PRESETS: ReadonlySet<HarvestInspectionPreset> = new Set([
  "trichome_inspection",
  "pistil_recession",
  "bud_maturity",
  "close_flower_photo",
]);

export interface HarvestInspectionPrefillLike {
  source?: string | null;
  preset?: string | null;
  eventType?: string | null;
  note?: string | null;
}

/** True when the prefill was dispatched by Harvest Watch with a valid preset. */
export function isHarvestInspectionPrefill(
  prefill: HarvestInspectionPrefillLike | null | undefined,
): boolean {
  if (!prefill || typeof prefill !== "object") return false;
  if (prefill.source !== HARVEST_INSPECTION_PREVIEW_SOURCE) return false;
  return detectHarvestInspectionPreset(prefill) !== null;
}

/**
 * Identify the harvest inspection preset associated with this prefill, or
 * null if none. Prefers the explicit `preset` field; falls back to a
 * cautious note-text scan that uses the same vocabulary as the harvest
 * evidence presets.
 */
export function detectHarvestInspectionPreset(
  prefill: HarvestInspectionPrefillLike | null | undefined,
): HarvestInspectionPreset | null {
  if (!prefill || typeof prefill !== "object") return null;
  const explicit =
    typeof prefill.preset === "string" ? prefill.preset.trim() : "";
  if (explicit && VALID_PRESETS.has(explicit as HarvestInspectionPreset)) {
    return explicit as HarvestInspectionPreset;
  }
  if (prefill.source !== HARVEST_INSPECTION_PREVIEW_SOURCE) return null;
  const note = typeof prefill.note === "string" ? prefill.note : "";
  if (/Trichome inspection note/i.test(note)) return "trichome_inspection";
  if (/Pistil \/ recession observation/i.test(note)) return "pistil_recession";
  if (/Bud maturity note/i.test(note)) return "bud_maturity";
  if (/Close flower photo/i.test(note)) return "close_flower_photo";
  return null;
}

function eventTypeLabel(et: string | null | undefined): string {
  const t = typeof et === "string" ? et.trim().toLowerCase() : "";
  if (t === "photo") return "Photo";
  if (t === "observation") return "Observation";
  return t ? t : "Observation";
}

export interface HarvestInspectionPreviewViewModel {
  show: boolean;
  preset: HarvestInspectionPreset | null;
  presetLabel: string;
  eventTypeLabel: string;
  caution: string;
  reviewCopy: string;
  note: string;
  /** True only for the close-flower-photo preset. */
  showPhotoComparison: boolean;
}

/**
 * Build the preview view-model. When the prefill is not a Harvest Watch
 * inspection prefill, `show` is false and the rest of the fields are safe
 * defaults — callers should simply not render the panel.
 */
export function buildHarvestInspectionPreviewViewModel(
  prefill: HarvestInspectionPrefillLike | null | undefined,
): HarvestInspectionPreviewViewModel {
  const preset = detectHarvestInspectionPreset(prefill);
  const show = !!prefill && prefill?.source === HARVEST_INSPECTION_PREVIEW_SOURCE && preset !== null;
  return {
    show,
    preset,
    presetLabel: preset ? HARVEST_INSPECTION_PREVIEW_LABEL[preset] : "",
    eventTypeLabel: eventTypeLabel(prefill?.eventType ?? null),
    caution: HARVEST_INSPECTION_PREVIEW_CAUTION,
    reviewCopy: HARVEST_INSPECTION_PREVIEW_REVIEW_COPY,
    note: typeof prefill?.note === "string" ? prefill.note : "",
    showPhotoComparison: preset === "close_flower_photo",
  };
}

// ---------------------------------------------------------------------------
// Optional close-flower-photo comparison fields (UI-only this slice)
// ---------------------------------------------------------------------------

export type HarvestPhotoAngle =
  | "top"
  | "side"
  | "macro"
  | "whole_cola"
  | "other";

export type HarvestPhotoLighting =
  | "natural"
  | "grow_light"
  | "flash"
  | "loupe_microscope"
  | "other";

export interface HarvestPhotoOption<T extends string> {
  value: T;
  label: string;
}

export const HARVEST_PHOTO_COMPARISON_ANGLES: ReadonlyArray<
  HarvestPhotoOption<HarvestPhotoAngle>
> = [
  { value: "top", label: "Top" },
  { value: "side", label: "Side" },
  { value: "macro", label: "Macro" },
  { value: "whole_cola", label: "Whole cola" },
  { value: "other", label: "Other" },
];

export const HARVEST_PHOTO_COMPARISON_LIGHTINGS: ReadonlyArray<
  HarvestPhotoOption<HarvestPhotoLighting>
> = [
  { value: "natural", label: "Natural" },
  { value: "grow_light", label: "Grow light" },
  { value: "flash", label: "Flash" },
  { value: "loupe_microscope", label: "Loupe / microscope" },
  { value: "other", label: "Other" },
];

export interface HarvestPhotoComparison {
  angle?: HarvestPhotoAngle;
  lighting?: HarvestPhotoLighting;
}

const ANGLES = new Set<HarvestPhotoAngle>([
  "top",
  "side",
  "macro",
  "whole_cola",
  "other",
]);
const LIGHTINGS = new Set<HarvestPhotoLighting>([
  "natural",
  "grow_light",
  "flash",
  "loupe_microscope",
  "other",
]);

/**
 * Normalize a raw comparison input. Unknown / empty values are dropped.
 * Returns `null` if neither field resolves to a valid value, so callers
 * can avoid attaching empty metadata.
 */
export function normalizeHarvestPhotoComparison(
  input: { angle?: string | null; lighting?: string | null } | null | undefined,
): HarvestPhotoComparison | null {
  if (!input || typeof input !== "object") return null;
  const out: HarvestPhotoComparison = {};
  const a = typeof input.angle === "string" ? input.angle.trim() : "";
  const l = typeof input.lighting === "string" ? input.lighting.trim() : "";
  if (a && ANGLES.has(a as HarvestPhotoAngle)) out.angle = a as HarvestPhotoAngle;
  if (l && LIGHTINGS.has(l as HarvestPhotoLighting))
    out.lighting = l as HarvestPhotoLighting;
  if (out.angle === undefined && out.lighting === undefined) return null;
  return out;
}
