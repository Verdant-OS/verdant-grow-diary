// Pure read-only EcoWitt snapshot export helper.
//
// SAFETY:
// - Client-side JSON only. No Supabase, no Edge, no network call.
// - Uses the canonical normalized snapshot, never the raw untrusted payload.
// - Redacts private fields (PASSKEY, MAC, station IDs, tokens, IPs, etc.).

import {
  CanonicalEcowittTentSnapshot,
} from "./ecowittTentSnapshot";
import { EcowittTentKey } from "./ecowittTentNormalizerRouter";

export const ECOWITT_EXPORT_FILENAMES: Record<EcowittTentKey, string> = {
  flower: "verdant-ecowitt-flower-tent-snapshot.json",
  seedling: "verdant-ecowitt-seedling-tent-snapshot.json",
  vegetation: "verdant-ecowitt-vegetation-tent-snapshot.json",
};

export interface EcowittSnapshotExportPayload {
  read_only: true;
  provider: string;
  tent_label: string;
  source: CanonicalEcowittTentSnapshot["source"];
  captured_at: string | null;
  exported_at: string;
  evidence_source_label: string;
  metrics: CanonicalEcowittTentSnapshot["metrics"];
  channel_map: Readonly<Record<string, string>>;
  root_zone_confidence: CanonicalEcowittTentSnapshot["root_zone_confidence"];
  degraded_reasons: readonly string[];
  invalid_reasons: readonly string[];
}

export interface BuildExportOptions {
  evidence_source_label: string;
  now?: Date;
}

export function buildEcowittSnapshotExport(
  snap: CanonicalEcowittTentSnapshot,
  options: BuildExportOptions,
): EcowittSnapshotExportPayload {
  const exported_at = (options.now ?? new Date()).toISOString();
  return {
    read_only: true,
    provider: snap.provider,
    tent_label: snap.tent_label,
    source: snap.source,
    captured_at: snap.captured_at,
    exported_at,
    evidence_source_label: options.evidence_source_label,
    metrics: snap.metrics,
    channel_map: snap.channel_map,
    root_zone_confidence: snap.root_zone_confidence,
    degraded_reasons: snap.degraded_reasons,
    invalid_reasons: snap.invalid_reasons,
  };
}

export function ecowittSnapshotExportToJson(
  payload: EcowittSnapshotExportPayload,
): string {
  return JSON.stringify(payload, null, 2);
}

export function ecowittExportFilenameFor(tentKey: EcowittTentKey): string {
  return ECOWITT_EXPORT_FILENAMES[tentKey];
}

/**
 * Trigger a client-side download of the export JSON.
 * Safe no-op in non-browser environments (e.g. SSR/tests without DOM).
 */
export function downloadEcowittSnapshotExport(
  tentKey: EcowittTentKey,
  payload: EcowittSnapshotExportPayload,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const filename = ecowittExportFilenameFor(tentKey);
  const json = ecowittSnapshotExportToJson(payload);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
