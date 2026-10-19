/**
 * actionEvidenceVerificationService — #1001 read path.
 *
 * Reads the stored sensor rows referenced by an action's evidence refs, from
 * the correction-aware `sensor_readings_effective` view (security_invoker),
 * the same read model the snapshot that produced the refs used. It runs as
 * the signed-in grower, so RLS ("Users view own readings") returns only their
 * own rows: another user's, a superseded or a fabricated id comes back
 * missing. Read-only; selects no raw_payload or value. Throws on a failed read
 * so the caller can show "couldn't check" instead of treating it as no
 * evidence.
 */
import { effectiveSensorReadingsQuery } from "@/lib/effectiveSensorReadings";
import {
  MAX_VERIFIED_EVIDENCE_REFS,
  type EvidenceSensorRow,
} from "@/lib/actionEvidenceVerificationRules";

export async function fetchEvidenceSensorRows(
  ids: ReadonlyArray<string>,
): Promise<EvidenceSensorRow[]> {
  const wanted = ids.slice(0, MAX_VERIFIED_EVIDENCE_REFS);
  if (wanted.length === 0) return [];
  const { data, error } = await effectiveSensorReadingsQuery()
    .select("id,tent_id,metric,source,quality,captured_at,ts,correction_valid")
    .in("id", wanted as string[]);
  if (error) throw new Error("evidence sensor rows unavailable");
  return (data ?? []) as unknown as EvidenceSensorRow[];
}
