/**
 * Canonical read contract for the operator GGS post-commit Sentinel.
 *
 * Pure and deterministic. The page uses these exact predicates for its
 * Supabase query, while cross-contract tests prove they match the writer.
 */
import {
  GGS_REAL_PAYLOAD_SOURCE,
  GGS_REAL_PAYLOAD_SOURCE_APP,
} from "@/lib/ggsRealPayloadIngestRules";
import { GGS_SENTINEL_METRICS, type GgsSentinelInputRow } from "@/lib/ggsSentinelSmokeRunner";

export const GGS_OPERATOR_SENTINEL_SOURCE = GGS_REAL_PAYLOAD_SOURCE;
export const GGS_OPERATOR_SENTINEL_QUALITY = "ok" as const;
export const GGS_OPERATOR_SENTINEL_VENDOR = GGS_REAL_PAYLOAD_SOURCE_APP;
export const GGS_OPERATOR_SENTINEL_METRICS = GGS_SENTINEL_METRICS;
export const GGS_OPERATOR_SENTINEL_VENDOR_CONTAINS = Object.freeze({
  source_app: GGS_OPERATOR_SENTINEL_VENDOR,
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTrustedGgsOperatorSentinelRow(row: GgsSentinelInputRow): boolean {
  if (!row || typeof row !== "object") return false;
  if (!GGS_OPERATOR_SENTINEL_METRICS.includes(row.metric as never)) {
    return false;
  }
  if (
    row.source !== GGS_OPERATOR_SENTINEL_SOURCE ||
    row.quality !== GGS_OPERATOR_SENTINEL_QUALITY
  ) {
    return false;
  }
  if (
    typeof row.value !== "number" ||
    !Number.isFinite(row.value) ||
    !Number.isFinite(Date.parse(row.captured_at))
  ) {
    return false;
  }
  return (
    isPlainObject(row.raw_payload) && row.raw_payload.source_app === GGS_OPERATOR_SENTINEL_VENDOR
  );
}
