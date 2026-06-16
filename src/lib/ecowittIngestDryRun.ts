// Pure read-only EcoWitt ingest dry-run payload builder.
//
// SAFETY:
// - No network. No Supabase. No Edge. No writes.
// - Output is presenter-only and explicitly marked not_sent + read_only.
// - Uses the canonical normalized snapshot, never the raw untrusted payload.

import { CanonicalEcowittTentSnapshot } from "./ecowittTentSnapshot";
import { EcowittTentKey } from "./ecowittTentNormalizerRouter";

export const ECOWITT_DRY_RUN_NOTICE =
  "Dry run only. Nothing has been sent." as const;

export const ECOWITT_DRY_RUN_FILENAMES: Record<EcowittTentKey, string> = {
  flower: "verdant-ecowitt-flower-tent-ingest-dry-run.json",
  seedling: "verdant-ecowitt-seedling-tent-ingest-dry-run.json",
  vegetation: "verdant-ecowitt-vegetation-tent-ingest-dry-run.json",
};

export const ECOWITT_DRY_RUN_TENT_PLACEHOLDER = "preview-only-tent-id" as const;

export interface EcowittIngestDryRunPayload {
  tent_id: string;
  plant_id: string | null;
  source: CanonicalEcowittTentSnapshot["source"];
  provider: string;
  captured_at: string | null;
  metrics: CanonicalEcowittTentSnapshot["metrics"];
  metadata: {
    tent_label: string;
    channel_map: Readonly<Record<string, string>>;
    root_zone_confidence: CanonicalEcowittTentSnapshot["root_zone_confidence"];
    evidence_source: string;
    device_identity: string | null;
    read_only_preview: true;
    not_sent: true;
  };
  read_only: true;
  not_sent: true;
}

export interface EcowittIngestDryRunResult {
  can_send_later: boolean;
  blocked_reasons: readonly string[];
  warnings: readonly string[];
  dry_run_payload: EcowittIngestDryRunPayload;
  read_only: true;
  not_sent: true;
}

export interface BuildIngestDryRunOptions {
  tent_id?: string;
  plant_id?: string | null;
  device_identity?: string | null;
  evidence_source_label?: string;
  /** Whether the surrounding evidence is stale; surfaces a warning. */
  is_stale?: boolean;
}

export function buildEcowittIngestDryRun(
  snap: CanonicalEcowittTentSnapshot,
  options: BuildIngestDryRunOptions = {},
): EcowittIngestDryRunResult {
  const blocked_reasons: string[] = [];
  const warnings: string[] = [];

  if (snap.source === "invalid") {
    blocked_reasons.push("snapshot_source_invalid");
  }
  if (snap.metrics.air_temp_f === null) {
    blocked_reasons.push("missing_required_air_temp_f");
  }
  if (snap.metrics.humidity_pct === null) {
    blocked_reasons.push("missing_required_humidity_pct");
  }
  for (const r of snap.invalid_reasons) blocked_reasons.push(`invalid:${r}`);

  if (snap.source === "degraded") {
    warnings.push("snapshot_source_degraded");
  }
  for (const r of snap.degraded_reasons) warnings.push(`degraded:${r}`);
  if (options.is_stale) {
    warnings.push("evidence_stale_payload_age_exceeds_window");
    if (!blocked_reasons.includes("stale_evidence")) {
      blocked_reasons.push("stale_evidence");
    }
  }

  const can_send_later = blocked_reasons.length === 0;

  const dry_run_payload: EcowittIngestDryRunPayload = {
    tent_id: options.tent_id ?? ECOWITT_DRY_RUN_TENT_PLACEHOLDER,
    plant_id: options.plant_id ?? null,
    source: snap.source,
    provider: snap.provider,
    captured_at: snap.captured_at,
    metrics: snap.metrics,
    metadata: {
      tent_label: snap.tent_label,
      channel_map: snap.channel_map,
      root_zone_confidence: snap.root_zone_confidence,
      evidence_source: options.evidence_source_label ?? "sample/local evidence",
      device_identity: options.device_identity ?? null,
      read_only_preview: true,
      not_sent: true,
    },
    read_only: true,
    not_sent: true,
  };

  return {
    can_send_later,
    blocked_reasons: Object.freeze(blocked_reasons),
    warnings: Object.freeze(warnings),
    dry_run_payload,
    read_only: true,
    not_sent: true,
  };
}

export function ecowittDryRunFilenameFor(tentKey: EcowittTentKey): string {
  return ECOWITT_DRY_RUN_FILENAMES[tentKey];
}

export function ecowittDryRunToJson(
  result: EcowittIngestDryRunResult,
): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Trigger a client-side download of the dry-run JSON.
 * No-op outside a browser. NEVER touches the network.
 */
export function downloadEcowittIngestDryRun(
  tentKey: EcowittTentKey,
  result: EcowittIngestDryRunResult,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const filename = ecowittDryRunFilenameFor(tentKey);
  const json = ecowittDryRunToJson(result);
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
