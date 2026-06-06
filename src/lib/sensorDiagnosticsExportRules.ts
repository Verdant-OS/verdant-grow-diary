/**
 * Pure helpers for Sensors diagnostics export, curl-command synthesis, the
 * canonical test payload, and local in-memory history items. No DOM, no I/O.
 *
 * Safety invariants enforced here (also covered by tests):
 *   - Plaintext bridge tokens are NEVER written into JSON/text exports or
 *     history items. The curl builder is the only place a real token can
 *     appear, and only when the caller passes the one-time reveal.
 *   - Authorization headers, user_id, service_role keys, and raw secrets
 *     are never serialized.
 */

import type { EnvMatchItem } from "./sensorIngestTestResultRules";
import type { SensorIngestTestClassification } from "./sensorIngestTestResultRules";

export interface DiagnosticsTokenSummary {
  token_prefix: string | null;
  name: string | null;
  status: "active" | "expired" | "revoked" | null;
  last_used_at: string | null;
  ingest_count: number | null;
  expires_at: string | null;
}

export interface DiagnosticsTestResultSummary {
  attempted_at: string;
  http_status: number;
  classification: string;
  headline: string;
  body: unknown;
}

export interface DiagnosticsExportInput {
  generated_at: string;
  supabase_url: string | null;
  ingest_url: string | null;
  tent_id: string | null;
  tent_name: string | null;
  token: DiagnosticsTokenSummary | null;
  env_match: EnvMatchItem[];
  latest_test_result: DiagnosticsTestResultSummary | null;
}

const TOKEN_PATTERN = /vbt_[A-Za-z0-9_-]{8,}/g;

/** Defense-in-depth: strip anything that looks like a plaintext token. */
function redactTokens(input: string): string {
  return input.replace(TOKEN_PATTERN, "<redacted>");
}

export function buildDiagnosticsExport(
  input: DiagnosticsExportInput,
): DiagnosticsExportInput {
  // Re-shape into a plain object so callers can't accidentally extend with
  // a reveal field; also drops any prototype pollution surface.
  return {
    generated_at: input.generated_at,
    supabase_url: input.supabase_url,
    ingest_url: input.ingest_url,
    tent_id: input.tent_id,
    tent_name: input.tent_name,
    token: input.token
      ? {
          token_prefix: input.token.token_prefix,
          name: input.token.name,
          status: input.token.status,
          last_used_at: input.token.last_used_at,
          ingest_count: input.token.ingest_count,
          expires_at: input.token.expires_at,
        }
      : null,
    env_match: input.env_match.map((item) => ({
      key: item.key,
      ok: item.ok,
      label: item.label,
      hint: item.hint,
    })),
    latest_test_result: input.latest_test_result
      ? {
          attempted_at: input.latest_test_result.attempted_at,
          http_status: input.latest_test_result.http_status,
          classification: input.latest_test_result.classification,
          headline: input.latest_test_result.headline,
          body: input.latest_test_result.body,
        }
      : null,
  };
}

export function diagnosticsExportToJson(input: DiagnosticsExportInput): string {
  const obj = buildDiagnosticsExport(input);
  return redactTokens(JSON.stringify(obj, null, 2));
}

export function diagnosticsExportToText(input: DiagnosticsExportInput): string {
  const obj = buildDiagnosticsExport(input);
  const lines: string[] = [];
  lines.push("Verdant sensors diagnostics");
  lines.push(`generated_at: ${obj.generated_at}`);
  lines.push(`supabase_url: ${obj.supabase_url ?? "—"}`);
  lines.push(`ingest_url:   ${obj.ingest_url ?? "—"}`);
  lines.push(`tent_id:      ${obj.tent_id ?? "—"}`);
  lines.push(`tent_name:    ${obj.tent_name ?? "—"}`);
  lines.push("");
  if (obj.token) {
    lines.push("bridge token (safe identity only):");
    lines.push(`  token_prefix: ${obj.token.token_prefix ?? "—"}`);
    lines.push(`  name:         ${obj.token.name ?? "—"}`);
    lines.push(`  status:       ${obj.token.status ?? "—"}`);
    lines.push(`  last_used_at: ${obj.token.last_used_at ?? "—"}`);
    lines.push(`  ingest_count: ${obj.token.ingest_count ?? 0}`);
    lines.push(`  expires_at:   ${obj.token.expires_at ?? "—"}`);
  } else {
    lines.push("bridge token: none for this tent");
  }
  lines.push("");
  lines.push("environment match:");
  for (const m of obj.env_match) {
    lines.push(`  [${m.ok ? " ok  " : "warn "}] ${m.label}${m.hint ? ` — ${m.hint}` : ""}`);
  }
  if (obj.latest_test_result) {
    lines.push("");
    lines.push("latest test result:");
    lines.push(`  attempted_at:   ${obj.latest_test_result.attempted_at}`);
    lines.push(`  http_status:    ${obj.latest_test_result.http_status}`);
    lines.push(`  classification: ${obj.latest_test_result.classification}`);
    lines.push(`  headline:       ${obj.latest_test_result.headline}`);
    lines.push("  body:");
    lines.push(
      JSON.stringify(obj.latest_test_result.body, null, 2)
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n"),
    );
  }
  return redactTokens(lines.join("\n"));
}

/** Canonical test payload used by both the Test button and the curl helper. */
export interface BuildTestPayloadInput {
  tentId: string;
  capturedAtIso: string;
}

export function buildSensorIngestTestPayload(input: BuildTestPayloadInput) {
  return {
    tent_id: input.tentId,
    source: "ecowitt" as const,
    vendor: "ecowitt_windows_testbench" as const,
    captured_at: input.capturedAtIso,
    metrics: {
      temp_f: 77.4,
      humidity_percent: 58,
      soil_moisture_pct: 33,
      co2_ppm: 721,
    },
    metadata: {
      device_id: "verdant-ui-ingest-test",
      confidence: "test" as const,
      raw_payload: {
        temp1f: "77.4",
        humidity1: "58",
        soilmoisture1: "33",
        co2: "721",
        source: "sensors_ui_test_button",
      },
    },
  };
}

export interface BuildCurlInput {
  ingestUrl: string;
  tentId: string | null;
  bridgeTokenPlaintext: string | null;
  idempotencyKey: string;
  capturedAtIso: string;
}

/**
 * Build a curl command for the active ingest endpoint. The real token is
 * embedded only when the caller passes a one-time plaintext reveal;
 * otherwise a placeholder is rendered so the snippet is safe to copy.
 */
export function buildSensorIngestCurl(input: BuildCurlInput): string {
  const tent = input.tentId && input.tentId.length > 0 ? input.tentId : "<TENT-UUID>";
  const token =
    input.bridgeTokenPlaintext && input.bridgeTokenPlaintext.startsWith("vbt_")
      ? input.bridgeTokenPlaintext
      : "<vbt_… mint a token to reveal>";
  const payload = buildSensorIngestTestPayload({
    tentId: tent,
    capturedAtIso: input.capturedAtIso,
  });
  // Single-quote the JSON for POSIX shells; embedded single quotes shouldn't
  // appear in our canonical payload, but escape defensively just in case.
  const payloadJson = JSON.stringify(payload).replace(/'/g, "'\\''");
  return [
    `curl -X POST "${input.ingestUrl}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Authorization: Bearer ${token}" \\`,
    `  -H "Idempotency-Key: ${input.idempotencyKey}" \\`,
    `  --data '${payloadJson}'`,
  ].join("\n");
}

export interface SensorIngestHistoryItem {
  id: string;
  attempted_at: string;
  request_url: string;
  idempotency_key: string;
  http_status: number;
  classification: string;
  headline: string;
  detail: string;
  body: unknown;
  inserted: number | null;
  skipped_duplicate: number | null;
  rejected_count: number | null;
}

export interface BuildHistoryItemInput {
  attempted_at: string;
  request_url: string;
  idempotency_key: string;
  http_status: number;
  body: unknown;
  classification: SensorIngestTestClassification;
}

function safeNumber(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function arrayLen(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return Array.isArray(v) ? v.length : null;
}

/**
 * Build a history item from a test attempt. Never stores Authorization
 * headers or plaintext tokens — only safe response/identity fields.
 */
export function buildSensorIngestHistoryItem(
  input: BuildHistoryItemInput,
): SensorIngestHistoryItem {
  return {
    id: `${input.attempted_at}-${Math.random().toString(36).slice(2, 8)}`,
    attempted_at: input.attempted_at,
    request_url: input.request_url,
    idempotency_key: input.idempotency_key,
    http_status: input.http_status,
    classification: input.classification.category,
    headline: input.classification.headline,
    detail: input.classification.detail,
    body: input.body,
    inserted: safeNumber(input.body, "inserted"),
    skipped_duplicate: safeNumber(input.body, "skipped_duplicate"),
    rejected_count: arrayLen(input.body, "rejected"),
  };
}

export const SENSOR_INGEST_HISTORY_MAX = 20;

/**
 * Pretty-print the canonical ingest payload used for the last test. Defensive
 * token redaction in case a caller embedded a stray vbt_ string. Never
 * includes Authorization headers — the input is the JSON body only.
 */
export function buildRedactedPayloadPreview(payload: unknown): string {
  return redactTokens(JSON.stringify(payload, null, 2));
}

export interface BuildPowerShellIngestInput {
  ingestUrl: string;
  tentId: string | null;
  bridgeTokenPlaintext: string | null;
  idempotencyKey: string;
  capturedAtIso: string;
}

/**
 * Windows PowerShell Invoke-RestMethod script for the active ingest endpoint.
 * Embeds the real token only when the caller passes the one-time reveal;
 * otherwise renders a safe placeholder.
 */
export function buildPowerShellIngestTestScript(
  input: BuildPowerShellIngestInput,
): string {
  const tent = input.tentId && input.tentId.length > 0 ? input.tentId : "<TENT-UUID>";
  const token =
    input.bridgeTokenPlaintext && input.bridgeTokenPlaintext.startsWith("vbt_")
      ? input.bridgeTokenPlaintext
      : "<vbt_… mint a token to reveal>";
  const payload = buildSensorIngestTestPayload({
    tentId: tent,
    capturedAtIso: input.capturedAtIso,
  });
  const payloadJson = JSON.stringify(payload, null, 2);
  return [
    `$headers = @{`,
    `  "Content-Type"    = "application/json"`,
    `  "Authorization"   = "Bearer ${token}"`,
    `  "Idempotency-Key" = "${input.idempotencyKey}"`,
    `}`,
    ``,
    `$body = @'`,
    payloadJson,
    `'@`,
    ``,
    `Invoke-RestMethod -Method Post -Uri "${input.ingestUrl}" -Headers $headers -Body $body`,
  ].join("\n");
}

export interface BuildHistoryExportInput {
  generated_at: string;
  tent_id: string | null;
  tent_name: string | null;
  ingest_url: string | null;
  items: SensorIngestHistoryItem[];
}

export interface HistoryExport extends BuildHistoryExportInput {
  items: SensorIngestHistoryItem[];
}

export function buildHistoryExport(
  input: BuildHistoryExportInput,
): HistoryExport {
  return {
    generated_at: input.generated_at,
    tent_id: input.tent_id,
    tent_name: input.tent_name,
    ingest_url: input.ingest_url,
    // newest first; defensively reshape to drop any unexpected fields
    items: input.items.map((h) => ({
      id: h.id,
      attempted_at: h.attempted_at,
      request_url: h.request_url,
      idempotency_key: h.idempotency_key,
      http_status: h.http_status,
      classification: h.classification,
      headline: h.headline,
      detail: h.detail,
      body: h.body,
      inserted: h.inserted,
      skipped_duplicate: h.skipped_duplicate,
      rejected_count: h.rejected_count,
    })),
  };
}

export function historyExportToJson(input: BuildHistoryExportInput): string {
  return redactTokens(JSON.stringify(buildHistoryExport(input), null, 2));
}

/**
 * Deterministic, filesystem-safe filename like:
 *   verdant-sensor-diagnostics-20260606-180000.json
 */
export function buildDownloadFilename(
  prefix: string,
  ext: "json" | "txt",
  date: Date,
): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-+/g, "-");
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return `${safePrefix}-${stamp}.${ext}`;
}
