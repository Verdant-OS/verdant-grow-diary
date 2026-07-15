/**
 * publicQuickLogHandoffViewModel — presenter strings for the authenticated
 * "Continue your Quick Log" resume card.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O, no time reads.
 *  - Honest: the copy states the draft is STILL A DRAFT on this device and
 *    never claims it reached the diary — the existing Quick Log save is the
 *    only thing that can make it real.
 *  - Labels reuse the canonical Quick Log activity catalog + stage labels;
 *    no new vocabulary is minted here.
 */
import {
  QUICK_LOG_ACTIVITY_DEFINITIONS,
} from "@/constants/quickLogActivityTypes";
import {
  PUBLIC_QUICK_LOG_STARTER_TYPE_TO_ACTIVITY_ID,
  type PublicQuickLogStarterDraft,
} from "@/lib/publicQuickLogStarterRules";
import { stageLabel } from "@/lib/grow";
import type { HandoffPlantMatch } from "@/lib/publicQuickLogHandoffRules";

export const PUBLIC_QUICK_LOG_HANDOFF_TITLE = "Continue your Quick Log" as const;

/** Pinned honesty line: shown with the summary, present until the real save. */
export const PUBLIC_QUICK_LOG_HANDOFF_DRAFT_STATUS_LINE =
  "Still a draft on this device — it is not in your diary yet." as const;

export const PUBLIC_QUICK_LOG_HANDOFF_PRIMARY_LABEL = "Review and save" as const;
export const PUBLIC_QUICK_LOG_HANDOFF_NOT_NOW_LABEL = "Not now" as const;
export const PUBLIC_QUICK_LOG_HANDOFF_DISCARD_LABEL = "Discard draft" as const;
export const PUBLIC_QUICK_LOG_HANDOFF_DISCARD_CONFIRM_QUESTION =
  "Discard this draft from this device? This cannot be undone." as const;
export const PUBLIC_QUICK_LOG_HANDOFF_DISCARD_CONFIRM_LABEL =
  "Yes, discard it" as const;
export const PUBLIC_QUICK_LOG_HANDOFF_DISCARD_CANCEL_LABEL = "Keep draft" as const;

export const PUBLIC_QUICK_LOG_HANDOFF_SETUP_LABEL = "Set up your grow first" as const;
export const PUBLIC_QUICK_LOG_HANDOFF_SETUP_HINT =
  "You need a grow, tent, and plant before this note can join your diary. Your draft stays on this device while you set them up." as const;

/** Shown while the plant inventory is still loading — never claim "no plants". */
export const PUBLIC_QUICK_LOG_HANDOFF_CHECKING_LABEL = "Checking your plants…" as const;

/** Shown when the plant inventory read failed — the review form owns the pick. */
export const PUBLIC_QUICK_LOG_HANDOFF_PLANTS_UNAVAILABLE_HINT =
  "Couldn't check your plants right now — you'll pick one when you review." as const;

export interface PublicQuickLogHandoffSummaryRow {
  key: "plant" | "type" | "stage" | "volume" | "note";
  label: string;
  value: string;
}

/** Activity label from the canonical catalog (never minted here). */
export function handoffLogTypeLabel(
  logType: PublicQuickLogStarterDraft["logType"],
): string {
  const activityId = PUBLIC_QUICK_LOG_STARTER_TYPE_TO_ACTIVITY_ID[logType];
  return QUICK_LOG_ACTIVITY_DEFINITIONS[activityId]?.label ?? logType;
}

/** Stage display: unknown ("") stays honest, mirroring the public page. */
export function handoffStageLabel(stage: string): string {
  return stage === "" ? "Not sure yet" : stageLabel(stage);
}

/**
 * The rows the card shows — exactly the drafted values, nothing invented.
 * Optional fields (stage/volume/note) appear only when the draft has them.
 */
export function buildHandoffSummaryRows(
  draft: PublicQuickLogStarterDraft,
): PublicQuickLogHandoffSummaryRow[] {
  const rows: PublicQuickLogHandoffSummaryRow[] = [
    { key: "plant", label: "Plant nickname", value: draft.plantNickname },
    { key: "type", label: "Log type", value: handoffLogTypeLabel(draft.logType) },
  ];
  if (draft.stage !== "") {
    rows.push({ key: "stage", label: "Stage", value: handoffStageLabel(draft.stage) });
  }
  if (draft.logType === "watering" && draft.wateringVolumeMl !== null) {
    rows.push({
      key: "volume",
      label: "Watering amount",
      value: `${draft.wateringVolumeMl} ml`,
    });
  }
  if (draft.note.length > 0) {
    rows.push({ key: "note", label: "Note", value: draft.note });
  }
  return rows;
}

/**
 * Match explanation shown under the summary. Never claims certainty about
 * plant identity — the nickname is the grower's word, not a database key,
 * and the suggestion stays editable in the Quick Log form.
 */
export function buildHandoffMatchHint(match: HandoffPlantMatch): string {
  switch (match.kind) {
    case "nickname":
      return `Matched your plant "${match.plant?.name ?? ""}" by nickname — you can change it before saving.`;
    case "only-plant":
      return `Suggesting your only plant, "${match.plant?.name ?? ""}" — you can change it before saving.`;
    case "ambiguous":
      return "You have several plants — pick which one this note belongs to when you review.";
    case "none":
      return PUBLIC_QUICK_LOG_HANDOFF_SETUP_HINT;
  }
}

/**
 * Extra honesty for feeding drafts: the unified Quick Log save does not
 * accept feeding yet, so the review form will show its own "Coming soon"
 * state and the grower picks a supported type themselves. Stated up front
 * so the review step never feels like a bait-and-switch.
 */
export function buildHandoffTypeCaveat(
  logType: PublicQuickLogStarterDraft["logType"],
): string | null {
  if (logType !== "feeding") return null;
  return (
    "Feeding logs are not saveable from Quick Log yet — when you review, " +
    "pick a supported type (your note comes along unchanged)."
  );
}
