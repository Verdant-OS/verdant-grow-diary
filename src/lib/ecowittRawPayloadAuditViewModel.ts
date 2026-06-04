/**
 * ecowittRawPayloadAuditViewModel — pure helpers that turn persisted
 * `sensor_readings` rows into a redacted, read-only view-model for the
 * EcoWitt ingest audit page.
 *
 * Hard constraints (stop-ship if violated):
 *  - Pure / deterministic. No I/O. Read-only.
 *  - Sensitive keys (passkey, password, token, secret, mac, stationid,
 *    bridge_token, api_key, etc.) MUST be redacted before render.
 *  - Never widens RLS, never executes device actions, never writes alerts
 *    or action_queue rows.
 *  - Tent scoping is the caller's responsibility (RLS already enforces
 *    user_id); this helper additionally filters by `tentId` and drops
 *    rows that don't belong to it.
 */
import {
  buildEcowittSnapshotViewModel,
  type EcowittCandidate,
} from "@/lib/ecowittReadingViewModel";
import type { EcowittSensorReadingRow } from "@/lib/ecowittLatestSnapshotFilter";
import type { EcowittFreshness } from "@/lib/ecowittPayloadRules";

/** Substrings (case-insensitive) — any payload key matching gets redacted. */
const SENSITIVE_KEY_PARTS: readonly string[] = [
  "passkey",
  "password",
  "pass",
  "token",
  "secret",
  "apikey",
  "api_key",
  "mac",
  "stationid",
  "station_id",
  "imei",
  "private",
  "bridge",
];

const REDACTED = "[redacted]";

export function isSensitivePayloadKey(key: string): boolean {
  const k = key.toLowerCase();
  for (const part of SENSITIVE_KEY_PARTS) {
    if (k.includes(part)) return true;
  }
  return false;
}

/**
 * Recursively walk a payload-shaped object and return a copy with sensitive
 * keys replaced by `"[redacted]"`. Non-objects pass through unchanged.
 */
export function redactRawPayload(payload: unknown): unknown {
  if (payload == null) return payload;
  if (Array.isArray(payload)) return payload.map(redactRawPayload);
  if (typeof payload !== "object") return payload;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (isSensitivePayloadKey(k)) {
      out[k] = REDACTED;
      continue;
    }
    out[k] = redactRawPayload(v);
  }
  return out;
}

export interface EcowittAuditRowViewModel {
  id: string;
  capturedAt: string | null;
  metric: string | null;
  value: number | null;
  quality: string | null;
  source: string | null;
  freshness: EcowittFreshness | null;
  /** Redacted copy of raw_payload, safe to render. */
  redactedRawPayload: unknown;
  /** Adapter warnings pulled out of raw_payload.adapter_warnings. */
  adapterWarnings: string[];
}

export interface EcowittAuditPageInput {
  rows: readonly EcowittSensorReadingRow[] | null | undefined;
  tentId: string | null | undefined;
  /** Deterministic wall-clock for freshness derivation. */
  now?: Date;
  /** Optional row cap (defaults to 50). */
  limit?: number;
}

export interface EcowittAuditPageViewModel {
  tentId: string | null;
  hasRows: boolean;
  rows: EcowittAuditRowViewModel[];
  emptyStateMessage: string | null;
}

const EMPTY_MESSAGE = "No EcoWitt ingest records found for this tent.";

function pickAdapterWarnings(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const w = (raw as { adapter_warnings?: unknown }).adapter_warnings;
  if (!Array.isArray(w)) return [];
  return w
    .map((v) => (typeof v === "string" ? v : null))
    .filter((v): v is string => v != null);
}

function rowFreshness(
  row: EcowittSensorReadingRow & { value?: unknown; metric?: unknown; quality?: unknown },
  now: Date,
): EcowittFreshness | null {
  const raw = row.raw_payload;
  if (!raw || typeof raw !== "object") return null;
  const candidate: EcowittCandidate = {
    payload: raw,
    source: "live",
    receivedAt:
      (typeof row.captured_at === "string" && row.captured_at) ||
      (typeof row.ts === "string" && row.ts) ||
      undefined,
  };
  const vm = buildEcowittSnapshotViewModel([candidate], { now });
  return vm.freshness ?? null;
}

/**
 * Build the audit page view-model from raw `sensor_readings` rows. Filters
 * to the selected tent and redacts sensitive payload keys.
 */
export function buildEcowittAuditPageViewModel(
  input: EcowittAuditPageInput,
): EcowittAuditPageViewModel {
  const tentId = input.tentId ?? null;
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const now = input.now ?? new Date();

  if (!tentId) {
    return { tentId, hasRows: false, rows: [], emptyStateMessage: EMPTY_MESSAGE };
  }

  const scoped = rows.filter((r) => (r.tent_id ?? null) === tentId);
  const out: EcowittAuditRowViewModel[] = [];
  for (const r of scoped) {
    const anyRow = r as EcowittSensorReadingRow & {
      metric?: unknown;
      value?: unknown;
      quality?: unknown;
    };
    out.push({
      id: String(r.id ?? ""),
      capturedAt:
        (typeof r.captured_at === "string" && r.captured_at) ||
        (typeof r.ts === "string" && r.ts) ||
        null,
      metric: typeof anyRow.metric === "string" ? anyRow.metric : null,
      value: typeof anyRow.value === "number" ? anyRow.value : null,
      quality: typeof anyRow.quality === "string" ? anyRow.quality : null,
      source: typeof r.source === "string" ? r.source : null,
      freshness: rowFreshness(r, now),
      redactedRawPayload: redactRawPayload(r.raw_payload),
      adapterWarnings: pickAdapterWarnings(r.raw_payload),
    });
    if (out.length >= limit) break;
  }

  return {
    tentId,
    hasRows: out.length > 0,
    rows: out,
    emptyStateMessage: out.length > 0 ? null : EMPTY_MESSAGE,
  };
}

export const ECOWITT_AUDIT_EMPTY_MESSAGE = EMPTY_MESSAGE;
