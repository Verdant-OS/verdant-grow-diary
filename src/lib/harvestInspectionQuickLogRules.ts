/**
 * harvestInspectionQuickLogRules — pure helpers that build a Quick Log
 * prefill payload for Harvest Watch "Next inspection" handoffs.
 *
 * Diary evidence presets only. NEVER sensor readings. NEVER device commands.
 * NEVER AI calls. NEVER alerts. NEVER Action Queue writes. NEVER direct
 * Supabase writes. The handoff dispatches the existing
 * `verdant:open-quicklog` event — the grower still reviews and saves the
 * entry manually through the normal Quick Log flow.
 *
 * The prefill `note` text is intentionally seeded with the same vocabulary
 * that `buildEvidenceChecklist` recognizes (trichome / pistil / bud), so a
 * saved note flows back into the Harvest Watch checklist naturally. A
 * generic photo never carries trichome / pistil / bud vocabulary on its
 * own — Harvest Watch continues to require an explicit note for strong
 * inspection evidence.
 *
 * Hard constraints on the prefill copy (enforced by tests):
 *   - No "harvest now", "ready to harvest", "guaranteed", "optimal",
 *     "chop", "flush", "dark period", "fix immediately", or
 *     "plant is unhealthy" phrasing.
 */
import type { HarvestEvidenceChecklistItem } from "@/lib/harvestWatchCardEvidenceRules";

export type HarvestInspectionPreset =
  | "trichome_inspection"
  | "pistil_recession"
  | "bud_maturity"
  | "close_flower_photo";

export interface HarvestInspectionQuickLogContext {
  plantId: string | null | undefined;
  plantName?: string | null;
  growId: string | null | undefined;
  tentId: string | null | undefined;
  tentName?: string | null;
}

/**
 * Mirrors the subset of {@link QuickLogPrefill} that Harvest Watch sets.
 * Decoupled from the React component to keep this module dependency-free.
 */
export interface HarvestInspectionQuickLogPrefill {
  plantId: string | null;
  plantName: string | null;
  growId: string | null;
  tentId: string | null;
  /** Existing Quick Log event types. */
  eventType: "observation" | "photo";
  suggestSnapshot: boolean;
  note: string;
  source: "harvest-watch-inspection";
  /** The evidence preset that drove this prefill. */
  preset: HarvestInspectionPreset;
}

const CAUTION_EVIDENCE_ONLY =
  "Harvest Watch is evidence-only. The grower decides.";
const CAUTION_ONE_PHOTO = "Do not rely on one photo alone.";
const CAUTION_DIRECT = "Record what you directly observed.";

const PRESETS: Record<
  HarvestInspectionPreset,
  {
    label: string;
    eventType: "observation" | "photo";
    note: string;
  }
> = {
  trichome_inspection: {
    label: "Harvest inspection note — trichome check",
    eventType: "observation",
    note: [
      "Trichome inspection note",
      CAUTION_DIRECT,
      "- Areas inspected:",
      "- % clear / cloudy / amber:",
      "- Magnification used:",
      "",
      CAUTION_ONE_PHOTO,
      CAUTION_EVIDENCE_ONLY,
    ].join("\n"),
  },
  pistil_recession: {
    label: "Harvest inspection note — pistil / recession",
    eventType: "observation",
    note: [
      "Pistil / recession observation",
      CAUTION_DIRECT,
      "- Pistil color (white / orange / brown):",
      "- % receded or curled:",
      "- Areas observed:",
      "",
      CAUTION_ONE_PHOTO,
      CAUTION_EVIDENCE_ONLY,
    ].join("\n"),
  },
  bud_maturity: {
    label: "Harvest inspection note — bud maturity",
    eventType: "observation",
    note: [
      "Bud maturity note",
      CAUTION_DIRECT,
      "- Swelling / calyx density:",
      "- Areas observed:",
      "- Overall flower development:",
      "",
      CAUTION_EVIDENCE_ONLY,
    ].join("\n"),
  },
  close_flower_photo: {
    label: "Close flower photo",
    eventType: "photo",
    note: [
      "Close flower photo",
      CAUTION_DIRECT,
      "- Area and distance:",
      "- Lighting:",
      "- What the photo is meant to show:",
      "",
      CAUTION_ONE_PHOTO,
      CAUTION_EVIDENCE_ONLY,
    ].join("\n"),
  },
};

/** Stable preset labels for UI/test consumption. */
export const HARVEST_INSPECTION_PRESET_LABEL: Record<
  HarvestInspectionPreset,
  string
> = {
  trichome_inspection: PRESETS.trichome_inspection.label,
  pistil_recession: PRESETS.pistil_recession.label,
  bud_maturity: PRESETS.bud_maturity.label,
  close_flower_photo: PRESETS.close_flower_photo.label,
};

/**
 * Picks the most useful harvest inspection preset based on which evidence
 * is missing. Priority: trichome → pistil → bud → photo. When everything
 * is present, defaults to trichome_inspection (the most informative recap).
 */
export function pickHarvestInspectionPreset(
  checklist: readonly HarvestEvidenceChecklistItem[],
): HarvestInspectionPreset {
  const missing = new Set(
    checklist
      .filter((c) => c.status !== "present")
      .map((c) => c.key),
  );
  if (missing.has("trichome_inspection")) return "trichome_inspection";
  if (missing.has("pistil_observation")) return "pistil_recession";
  if (missing.has("bud_maturity_note")) return "bud_maturity";
  if (missing.has("recent_photos")) return "close_flower_photo";
  return "trichome_inspection";
}

/**
 * Builds the Quick Log prefill payload for a Harvest Watch inspection
 * handoff. Safe against null/undefined inputs. Never throws.
 */
export function buildHarvestInspectionQuickLogPrefill(input: {
  preset: HarvestInspectionPreset;
  context: HarvestInspectionQuickLogContext | null | undefined;
}): HarvestInspectionQuickLogPrefill {
  const def = PRESETS[input.preset];
  const ctx = input.context ?? null;
  return {
    plantId: ctx?.plantId ?? null,
    plantName: ctx?.plantName ?? null,
    growId: ctx?.growId ?? null,
    tentId: ctx?.tentId ?? null,
    eventType: def.eventType,
    suggestSnapshot: Boolean(ctx?.tentId),
    note: def.note,
    source: "harvest-watch-inspection",
    preset: input.preset,
  };
}
