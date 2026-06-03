/**
 * Legacy QuickLog → quicklog_save_manual unification adapter.
 *
 * Pure (no I/O, no JSX). Maps the legacy QuickLog form state to the
 * existing `quicklog_save_manual` RPC payload shape.
 *
 * Slice constraints:
 * - Only RPC-supported actions are produced here:
 *     - `watering` form event → RPC `water` action
 *     - `observation` form event → RPC `note` action
 *     - `note` form event → RPC `note` action
 * - All other event types (photo, feeding, training, reminder, etc.)
 *   are rejected with `unsupported_event_type` and surfaced as
 *   "Coming soon" in UI. We do not extend the RPC or validator in this
 *   slice.
 * - Sensor snapshot values are NOT persisted via this adapter. The
 *   strip remains pre-save trust UI only.
 * - Plant selection is required because the RPC needs a tent or plant
 *   target; the legacy dialog has no tent picker.
 * - Free-text "more details" (pH/EC/runoff/nutrients/training) are
 *   folded into the note as plain text since the RPC does not accept
 *   structured detail fields for `note` or `water` actions.
 */

import type { QuickLogV2SavePayload } from "./quickLogV2SavePayload";

export const SUPPORTED_LEGACY_EVENT_TYPES = [
  "watering",
  "observation",
  "note",
] as const;
export type SupportedLegacyEventType =
  (typeof SUPPORTED_LEGACY_EVENT_TYPES)[number];

export function isSupportedLegacyEventType(value: string): value is SupportedLegacyEventType {
  return (SUPPORTED_LEGACY_EVENT_TYPES as readonly string[]).includes(value);
}

export const UNSUPPORTED_EVENT_TYPE_COPY =
  "Coming soon in the new Quick Log path. Use Water or Observation for now.";

import { type EcUnit } from "@/constants/units";

export interface LegacyQuickLogDetails {
  ph?: string;
  ec?: string;
  /** Optional EC unit selector. Never persisted without its unit. */
  ecUnit?: EcUnit;
  runoff?: string;
  nutrients?: string;
  training?: string;
  watering?: string;
}

export interface LegacyQuickLogFormInput {
  eventType: string;
  /** Note after hardware readings have been appended via existing helper. */
  noteWithHardware: string;
  plantId: string | null;
  plantTentId: string | null;
  details: LegacyQuickLogDetails;
}

export type LegacyUnifiedBuildResult =
  | { ok: true; payload: QuickLogV2SavePayload }
  | { ok: false; reason: string; message: string };

function trimStr(value: string | undefined | null): string {
  return (value ?? "").toString().trim();
}

export function appendLegacyDetailsToNote(
  baseNote: string,
  details: LegacyQuickLogDetails,
): string {
  const parts: string[] = [];
  if (trimStr(details.ph)) parts.push(`pH: ${trimStr(details.ph)}`);
  if (trimStr(details.ec)) {
    // Never persist an EC/PPM number without its unit. Default to "EC"
    // (unit unspecified) only when the form did not supply a unit.
    const unitLabel = details.ecUnit ? ` ${details.ecUnit}` : " (unit unspecified)";
    parts.push(`EC: ${trimStr(details.ec)}${unitLabel}`);
  }
  if (trimStr(details.runoff)) parts.push(`Runoff: ${trimStr(details.runoff)}`);
  if (trimStr(details.nutrients)) parts.push(`Nutrients: ${trimStr(details.nutrients)}`);
  if (trimStr(details.training)) parts.push(`Training: ${trimStr(details.training)}`);
  if (parts.length === 0) return baseNote;
  const suffix = parts.join(" · ");
  return baseNote ? `${baseNote}\n\n${suffix}` : suffix;
}

export function buildLegacyQuickLogUnifiedPayload(
  input: LegacyQuickLogFormInput,
): LegacyUnifiedBuildResult {
  if (!isSupportedLegacyEventType(input.eventType)) {
    return {
      ok: false,
      reason: "unsupported_event_type",
      message: UNSUPPORTED_EVENT_TYPE_COPY,
    };
  }
  if (!input.plantId) {
    return {
      ok: false,
      reason: "plant_required",
      message: "Pick a plant to save this entry.",
    };
  }

  const note = appendLegacyDetailsToNote(input.noteWithHardware, input.details);

  if (input.eventType === "watering") {
    const raw = trimStr(input.details.watering);
    const volume = Number(raw);
    if (!raw || !Number.isFinite(volume) || volume <= 0) {
      return {
        ok: false,
        reason: "invalid_volume",
        message: "Add a watering volume (ml) to save a watering log.",
      };
    }
    return {
      ok: true,
      payload: {
        p_target_type: "plant",
        p_target_id: input.plantId,
        p_action: "water",
        p_volume_ml: volume,
        p_note: note ? note : null,
        p_temperature_c: null,
        p_humidity_pct: null,
        p_vpd_kpa: null,
        p_occurred_at: null,
      },
    };
  }

  // observation / note → RPC `note` action
  if (!trimStr(note)) {
    return {
      ok: false,
      reason: "note_required",
      message: "Add a note before saving.",
    };
  }
  return {
    ok: true,
    payload: {
      p_target_type: "plant",
      p_target_id: input.plantId,
      p_action: "note",
      p_volume_ml: null,
      p_note: note,
      p_temperature_c: null,
      p_humidity_pct: null,
      p_vpd_kpa: null,
      p_occurred_at: null,
    },
  };
}
