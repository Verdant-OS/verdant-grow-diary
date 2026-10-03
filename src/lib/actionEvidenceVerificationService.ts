/**
 * actionEvidenceVerificationService — #1001 read path.
 *
 * Reads the stored sensor rows referenced by an action's evidence refs.
 * Runs as the signed-in grower, so RLS ("Users view own readings") returns
 * only their own rows: another user's or a fabricated id simply comes back
 * missing. Read-only; selects no raw_payload. Throws on a failed read so the
 * caller can show "couldn't check" instead of treating it as no evidence.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  MAX_VERIFIED_EVIDENCE_REFS,
  type EvidenceSensorRow,
} from "@/lib/actionEvidenceVerificationRules";

export async function fetchEvidenceSensorRows(
  ids: ReadonlyArray<string>,
): Promise<EvidenceSensorRow[]> {
  const wanted = ids.slice(0, MAX_VERIFIED_EVIDENCE_REFS);
  if (wanted.length === 0) return [];
  const { data, error } = await supabase
    .from("sensor_readings")
    .select("id,tent_id,source,quality,captured_at")
    .in("id", wanted as string[]);
  if (error) throw new Error("evidence sensor rows unavailable");
  return (data ?? []) as EvidenceSensorRow[];
}
