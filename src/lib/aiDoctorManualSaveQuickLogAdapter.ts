/**
 * aiDoctorManualSaveQuickLogAdapter — pure mapper from an OK AI Doctor
 * manual-save draft to the existing Quick Log v2 manual-save RPC payload
 * shape (`QuickLogV2SavePayload`).
 *
 * Hard constraints:
 *  - Pure. No React, no Supabase, no fetch, no RPC, no invoke.
 *  - Does NOT write anything. Just shapes data for the existing save hook.
 *  - Reuses the existing `note` action and stores AI Doctor metadata in
 *    `p_details`. The RPC does not accept a separate idempotency key
 *    argument, so we pass it inside `p_details.idempotency_key` (limitation
 *    noted in implementation notes).
 */

import type { QuickLogV2SavePayload } from "./quickLogV2SavePayload";
import type {
  AiDoctorManualSaveDraftOk,
  AiDoctorManualSaveDraftDetails,
} from "./aiDoctorManualSaveDraft";

export interface AiDoctorQuickLogDetails
  extends AiDoctorManualSaveDraftDetails {
  source: string;
  event_type_intent: "observation";
  tent_id: string;
  grow_id: string;
  idempotency_key: string;
}

/**
 * Map an OK draft into the Quick Log v2 manual-save RPC parameter shape.
 * The existing RPC enum only supports `water` | `note` actions, so an
 * AI Doctor observation is saved as a `note` with a discriminator
 * (`details.kind === "ai_doctor_check_in"`) in `p_details`.
 */
export function buildAiDoctorQuickLogSavePayload(
  draft: AiDoctorManualSaveDraftOk,
): QuickLogV2SavePayload {
  const d = draft.draft;
  const details: AiDoctorQuickLogDetails = {
    ...d.details,
    source: d.source,
    event_type_intent: "observation",
    tent_id: d.tent_id,
    grow_id: d.grow_id,
    idempotency_key: draft.idempotency_key,
  };
  return {
    p_target_type: "plant",
    p_target_id: d.plant_id,
    p_action: "note",
    p_volume_ml: null,
    p_note: d.note,
    p_temperature_c: null,
    p_humidity_pct: null,
    p_vpd_kpa: null,
    p_occurred_at: d.occurred_at,
    p_details: details as unknown as Record<string, unknown>,
  };
}
