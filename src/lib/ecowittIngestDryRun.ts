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

// UUID v4-ish shape check. Pure, no validation against a database.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPlaceholderTentId(tent_id: string | null | undefined): boolean {
  if (!tent_id) return true;
  if (tent_id === ECOWITT_DRY_RUN_TENT_PLACEHOLDER) return true;
  return !UUID_RE.test(tent_id);
}

export interface EcowittIngestDryRunPayload {
  tent_id: string;
  plant_id: string | null;
  source: CanonicalEcowittTentSnapshot["source"];
  source_identity: string | null;
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
  source_identity?: string | null;
  evidence_source_label?: string;
  /** Whether the surrounding evidence is stale; surfaces blocked + warning. */
  is_stale?: boolean;
  /** If true, a placeholder/non-UUID tent_id BLOCKS dry-run send. Default: warn-only. */
  require_real_tent_id?: boolean;
}

function nullableString(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = typeof v === "string" ? v.trim() : "";
  return t.length === 0 ? null : t;
}

export function buildEcowittIngestDryRun(
  snap: CanonicalEcowittTentSnapshot,
  options: BuildIngestDryRunOptions = {},
): EcowittIngestDryRunResult {
  const blocked_reasons: string[] = [];
  const warnings: string[] = [];

  // ---- Source / sensor-truth rule triggers ----
  if (snap.source === "invalid") {
    blocked_reasons.push("source_invalid");
  } else if (snap.source === "degraded") {
    warnings.push("source_degraded");
  }

  // EcoWitt canonical source values are live/degraded/invalid, but defend
  // against future widening — manual/csv/demo must never be marked live.
  if (
    snap.source !== "live" &&
    snap.source !== "degraded" &&
    snap.source !== "invalid"
  ) {
    warnings.push("manual_or_csv_not_live");
  }

  // ---- Required metric checks ----
  if (snap.metrics.air_temp_f === null) {
    blocked_reasons.push("missing_required_metric:air_temp_f");
  }
  if (snap.metrics.humidity_pct === null) {
    blocked_reasons.push("missing_required_metric:humidity_pct");
  }

  // ---- Optional metric warnings ----
  if (snap.metrics.soil_temp_f === null) {
    warnings.push("optional_metric_missing:soil_temp_f");
  }
  if (snap.metrics.soil_moisture_pct_primary === null) {
    warnings.push("optional_metric_missing:soil_moisture_pct_primary");
  }
  if (snap.metrics.soil_moisture_pct_secondary === null) {
    warnings.push("optional_metric_missing:soil_moisture_pct_secondary");
  }

  // ---- Reason passthrough ----
  for (const r of snap.invalid_reasons) blocked_reasons.push(`invalid_reason:${r}`);
  for (const r of snap.degraded_reasons) warnings.push(`degraded_reason:${r}`);

  // ---- Stale snapshot ----
  if (options.is_stale) {
    blocked_reasons.push("stale_snapshot:age_exceeds_freshness_window");
    warnings.push("stale_snapshot:age_exceeds_freshness_window");
  }

  // ---- Identity placeholder rules ----
  const resolved_tent_id = nullableString(options.tent_id) ?? ECOWITT_DRY_RUN_TENT_PLACEHOLDER;
  const tent_is_placeholder = isPlaceholderTentId(resolved_tent_id);
  if (tent_is_placeholder) {
    if (options.require_real_tent_id) {
      blocked_reasons.push("non_uuid_tent_id_preview_only");
    } else {
      warnings.push("non_uuid_tent_id_preview_only");
    }
  }
  const resolved_device_identity = nullableString(options.device_identity);
  if (resolved_device_identity === null) {
    warnings.push("placeholder_device_identity");
  }
  const resolved_source_identity = nullableString(options.source_identity);
  const resolved_plant_id = nullableString(options.plant_id);

  const can_send_later = blocked_reasons.length === 0;

  const dry_run_payload: EcowittIngestDryRunPayload = {
    tent_id: resolved_tent_id,
    plant_id: resolved_plant_id,
    source: snap.source,
    source_identity: resolved_source_identity,
    provider: snap.provider,
    captured_at: snap.captured_at,
    metrics: snap.metrics,
    metadata: {
      tent_label: snap.tent_label,
      channel_map: snap.channel_map,
      root_zone_confidence: snap.root_zone_confidence,
      evidence_source: options.evidence_source_label ?? "sample/local evidence",
      device_identity: resolved_device_identity,
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

// ---------------------------------------------------------------------------
// All-tent dry-run export
// ---------------------------------------------------------------------------

export interface EcowittAllTentDryRunInput {
  tentKey: EcowittTentKey;
  snapshot: CanonicalEcowittTentSnapshot;
  is_stale?: boolean;
  /** Per-tent overrides. Selected tent's IDs do NOT leak across other tents. */
  options?: BuildIngestDryRunOptions;
}

export interface EcowittAllTentDryRunExportFile {
  tentKey: EcowittTentKey;
  filename: string;
  payload: EcowittIngestDryRunPayload;
  can_send_later: boolean;
  blocked_reasons: readonly string[];
  warnings: readonly string[];
}

/**
 * Build deterministic per-tent dry-run export descriptors.
 * Pure: no I/O, no fetch, no Supabase, no Edge.
 * Order matches the input order for stability.
 */
export function buildEcowittIngestDryRunExportFilesForTents(
  inputs: readonly EcowittAllTentDryRunInput[],
): readonly EcowittAllTentDryRunExportFile[] {
  return inputs.map((i) => {
    const result = buildEcowittIngestDryRun(i.snapshot, {
      ...(i.options ?? {}),
      is_stale: i.is_stale ?? i.options?.is_stale,
    });
    return {
      tentKey: i.tentKey,
      filename: ecowittDryRunFilenameFor(i.tentKey),
      payload: result.dry_run_payload,
      can_send_later: result.can_send_later,
      blocked_reasons: result.blocked_reasons,
      warnings: result.warnings,
    };
  });
}

/**
 * Trigger per-tent client-side downloads. NEVER touches the network.
 */
export function downloadEcowittIngestDryRunAllTents(
  files: readonly EcowittAllTentDryRunExportFile[],
): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  for (const f of files) {
    const json = JSON.stringify(
      {
        can_send_later: f.can_send_later,
        blocked_reasons: f.blocked_reasons,
        warnings: f.warnings,
        dry_run_payload: f.payload,
        read_only: true,
        not_sent: true,
      },
      null,
      2,
    );
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}
