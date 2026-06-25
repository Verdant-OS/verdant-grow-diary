// Pure read-only "Attach to diary entry" preview helper.
//
// SAFETY:
// - Does NOT call diary insert/update helpers.
// - Does NOT call Quick Log save helpers.
// - Does NOT touch Supabase.
// - Does NOT create grow_event or diary_entries rows.
// - Output is presenter-only; the operator decides nothing here.

import { CanonicalEcowittTentSnapshot } from "./ecowittTentSnapshot";

export const ECOWITT_DIARY_PREVIEW_NOTICE =
  "Preview only. No diary entry will be saved." as const;
export const ECOWITT_DIARY_PREVIEW_DISABLED_LABEL =
  "Save disabled in preview" as const;
export const ECOWITT_DIARY_PREVIEW_ATTACH_LABEL =
  "Attach to diary" as const;

export interface EcowittDiaryAttachPreview {
  notice: typeof ECOWITT_DIARY_PREVIEW_NOTICE;
  title: string;
  tent_label: string;
  captured_at: string | null;
  provider: string;
  source: CanonicalEcowittTentSnapshot["source"];
  source_label: "LIVE" | "DEGRADED" | "INVALID";
  metrics_summary: readonly string[];
  root_zone_confidence: CanonicalEcowittTentSnapshot["root_zone_confidence"];
  warnings: readonly string[];
  body: string;
  attach_button_label: typeof ECOWITT_DIARY_PREVIEW_ATTACH_LABEL;
  attach_button_disabled: true;
  disabled_label: typeof ECOWITT_DIARY_PREVIEW_DISABLED_LABEL;
  attached_snapshot_preview: {
    provider: string;
    tent_label: string;
    captured_at: string | null;
    source: CanonicalEcowittTentSnapshot["source"];
    metrics: CanonicalEcowittTentSnapshot["metrics"];
    root_zone_confidence: CanonicalEcowittTentSnapshot["root_zone_confidence"];
  };
}

const SOURCE_LABELS = {
  live: "LIVE",
  degraded: "DEGRADED",
  invalid: "INVALID",
} as const;

function fmtMetric(label: string, value: number | null, unit: string): string | null {
  if (value === null) return null;
  return `${label}: ${value}${unit}`;
}

export interface EcowittDiaryAttachPreviewOptions {
  /** Whether the surrounding evidence is stale (drives a warning). */
  is_stale?: boolean;
}

export function buildEcowittDiaryAttachPreview(
  snap: CanonicalEcowittTentSnapshot,
  options: EcowittDiaryAttachPreviewOptions = {},
): EcowittDiaryAttachPreview {
  const title = `EcoWitt snapshot preview — ${snap.tent_label}`;

  const summaryRows = [
    fmtMetric("Air temperature", snap.metrics.air_temp_f, "°F"),
    fmtMetric("Humidity", snap.metrics.humidity_pct, "%"),
    fmtMetric("Soil temperature", snap.metrics.soil_temp_f, "°F"),
    fmtMetric("Soil moisture (primary)", snap.metrics.soil_moisture_pct_primary, "%"),
    fmtMetric("Soil moisture (secondary)", snap.metrics.soil_moisture_pct_secondary, "%"),
  ].filter((s): s is string => s !== null);

  const warnings: string[] = [];
  if (snap.source === "degraded") {
    warnings.push("Snapshot is DEGRADED. Some channels are missing or stale.");
  }
  if (snap.source === "invalid") {
    warnings.push("Snapshot is INVALID. Out-of-range values were rejected.");
  }
  if (options.is_stale) {
    warnings.push("Evidence is stale: payload age exceeds freshness window.");
  }
  for (const r of snap.degraded_reasons) warnings.push(`degraded: ${r}`);
  for (const r of snap.invalid_reasons) warnings.push(`invalid: ${r}`);

  const bodyLines: string[] = [
    "Read-only EcoWitt snapshot preview.",
    "No database write has occurred.",
    `Tent: ${snap.tent_label}`,
    `Provider: ${snap.provider}`,
    `Captured at: ${snap.captured_at ?? "—"}`,
    `Source: ${SOURCE_LABELS[snap.source]}`,
  ];
  for (const row of summaryRows) bodyLines.push(row);
  bodyLines.push(`Root-zone confidence: ${snap.root_zone_confidence}`);
  for (const w of warnings) bodyLines.push(w);

  return {
    notice: ECOWITT_DIARY_PREVIEW_NOTICE,
    title,
    tent_label: snap.tent_label,
    captured_at: snap.captured_at,
    provider: snap.provider,
    source: snap.source,
    source_label: SOURCE_LABELS[snap.source],
    metrics_summary: Object.freeze(summaryRows),
    root_zone_confidence: snap.root_zone_confidence,
    warnings: Object.freeze(warnings),
    body: bodyLines.join("\n"),
    attach_button_label: ECOWITT_DIARY_PREVIEW_ATTACH_LABEL,
    attach_button_disabled: true,
    disabled_label: ECOWITT_DIARY_PREVIEW_DISABLED_LABEL,
    attached_snapshot_preview: {
      provider: snap.provider,
      tent_label: snap.tent_label,
      captured_at: snap.captured_at,
      source: snap.source,
      metrics: snap.metrics,
      root_zone_confidence: snap.root_zone_confidence,
    },
  };
}
