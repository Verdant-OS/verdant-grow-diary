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
  ext: "json" | "txt" | "zip",
  date: Date,
): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-+/g, "-");
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return `${safePrefix}-${stamp}.${ext}`;
}

// ---------------------------------------------------------------------------
// PowerShell copy warning state
// ---------------------------------------------------------------------------

export interface PowerShellCopyWarningState {
  requiresConfirmation: boolean;
  message: string;
}

/**
 * When the one-time token reveal is in memory the PowerShell ingest script
 * will embed it. Operators must explicitly confirm before copying so the
 * snippet does not get pasted into tickets, chats, screenshots, or git.
 */
export function buildPowerShellCopyWarningState(input: {
  hasTokenReveal: boolean;
}): PowerShellCopyWarningState {
  if (input.hasTokenReveal) {
    return {
      requiresConfirmation: true,
      message:
        "This PowerShell script includes a one-time bridge token. Do not paste it into tickets, chats, screenshots, or shared docs. Continue copying?",
    };
  }
  return { requiresConfirmation: false, message: "" };
}

// ---------------------------------------------------------------------------
// Diagnostics bundle files (used by client-side zip download)
// ---------------------------------------------------------------------------

export interface DiagnosticsBundleFile {
  name: string;
  content: string;
}

export interface BuildDiagnosticsBundleFilesInput {
  diagnosticsJson: string;
  diagnosticsText: string;
  historyJson: string;
}

/**
 * Build the file list that gets zipped into a single diagnostics bundle.
 * Pure: assembles already-redacted strings from the existing export builders.
 */
export function buildDiagnosticsBundleFiles(
  input: BuildDiagnosticsBundleFilesInput,
): DiagnosticsBundleFile[] {
  return [
    { name: "diagnostics.json", content: input.diagnosticsJson },
    { name: "diagnostics.txt", content: input.diagnosticsText },
    { name: "history.json", content: input.historyJson },
  ];
}

// ---------------------------------------------------------------------------
// Safe response inspector
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_RE =
  /(token|authorization|bearer|api[_-]?key|secret|password|service[_-]?role|anon[_-]?key|bridge[_-]?token)/i;

export interface SafeResponseField {
  path: string;
  type: string;
  preview: string;
  redacted: boolean;
}

export interface SafeResponseInspector {
  http_status: number;
  classification: string;
  kind: "json" | "text" | "empty";
  note: string | null;
  fields: SafeResponseField[];
}

export interface BuildSafeResponseInspectorInput {
  status: number;
  classification: string;
  body: unknown;
}

/**
 * Produce a safely-redacted, structure-only view of a response body. Keys
 * matching token/authorization/bearer/api_key/secret/password/service_role/
 * anon_key/bridge_token are masked at any depth. String previews are token-
 * redacted and length-clamped. Handles JSON, non-JSON, and empty bodies.
 */
export function buildSafeResponseInspector(
  input: BuildSafeResponseInspectorInput,
): SafeResponseInspector {
  const { status, classification, body } = input;
  if (body === null || body === undefined) {
    return {
      http_status: status,
      classification,
      kind: "empty",
      note: "empty response body",
      fields: [],
    };
  }
  if (typeof body === "string") {
    const safe = redactTokens(body);
    return {
      http_status: status,
      classification,
      kind: "text",
      note: "non-JSON response — preview only",
      fields: [
        {
          path: "$",
          type: "string",
          preview: safe.length > 200 ? safe.slice(0, 200) + "…" : safe,
          redacted: safe !== body,
        },
      ],
    };
  }
  if (typeof body !== "object") {
    return {
      http_status: status,
      classification,
      kind: "text",
      note: null,
      fields: [
        {
          path: "$",
          type: typeof body,
          preview: String(body),
          redacted: false,
        },
      ],
    };
  }
  const fields: SafeResponseField[] = [];
  const seen = new WeakSet<object>();
  function walk(v: unknown, path: string, depth: number) {
    if (depth > 6) {
      fields.push({ path, type: "truncated", preview: "…", redacted: false });
      return;
    }
    if (v === null) {
      fields.push({ path, type: "null", preview: "null", redacted: false });
      return;
    }
    if (Array.isArray(v)) {
      fields.push({
        path,
        type: "array",
        preview: `[${v.length}]`,
        redacted: false,
      });
      v.slice(0, 10).forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1));
      return;
    }
    if (typeof v === "object") {
      if (seen.has(v as object)) {
        fields.push({ path, type: "circular", preview: "…", redacted: false });
        return;
      }
      seen.add(v as object);
      const entries = Object.entries(v as Record<string, unknown>);
      fields.push({
        path,
        type: "object",
        preview: `{${entries.length}}`,
        redacted: false,
      });
      for (const [k, val] of entries) {
        const childPath = path === "$" ? k : `${path}.${k}`;
        if (SENSITIVE_KEY_RE.test(k)) {
          fields.push({
            path: childPath,
            type: typeof val,
            preview: "<redacted>",
            redacted: true,
          });
        } else {
          walk(val, childPath, depth + 1);
        }
      }
      return;
    }
    if (typeof v === "string") {
      const safe = redactTokens(v);
      fields.push({
        path,
        type: "string",
        preview: safe.length > 80 ? safe.slice(0, 80) + "…" : safe,
        redacted: safe !== v,
      });
      return;
    }
    fields.push({
      path,
      type: typeof v,
      preview: String(v),
      redacted: false,
    });
  }
  walk(body, "$", 0);
  return {
    http_status: status,
    classification,
    kind: "json",
    note: null,
    fields,
  };
}

// ---------------------------------------------------------------------------
// Canonical ingest payload validation
// ---------------------------------------------------------------------------

export type CanonicalIngestField =
  | "source"
  | "captured_at"
  | "tent_id"
  | "confidence"
  | "readings";

export interface CanonicalIngestInvalid {
  field: CanonicalIngestField | "raw_payload";
  reason: string;
}

export interface CanonicalIngestValidation {
  ready: boolean;
  present: CanonicalIngestField[];
  missing: CanonicalIngestField[];
  invalid: CanonicalIngestInvalid[];
  readingsCount: number;
}

/**
 * Validate the canonical ingest payload. Required: source, captured_at|
 * timestamp, tent_id, confidence (top-level or under metadata), and a
 * readings/metrics object with at least one valid numeric or string value.
 * raw_payload is optional — flagged invalid only if present and not an
 * object.
 */
export function buildCanonicalIngestPayloadValidation(
  payload: unknown,
): CanonicalIngestValidation {
  const present: CanonicalIngestField[] = [];
  const missing: CanonicalIngestField[] = [];
  const invalid: CanonicalIngestInvalid[] = [];
  let readingsCount = 0;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ready: false,
      present: [],
      missing: ["source", "captured_at", "tent_id", "confidence", "readings"],
      invalid: [],
      readingsCount: 0,
    };
  }
  const p = payload as Record<string, unknown>;
  const meta =
    p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata)
      ? (p.metadata as Record<string, unknown>)
      : {};

  if (typeof p.source === "string" && p.source.length > 0) {
    present.push("source");
  } else {
    missing.push("source");
  }

  const capturedAt =
    p.captured_at ?? p.timestamp ?? meta.captured_at ?? meta.timestamp;
  if (typeof capturedAt === "string" && capturedAt.length > 0) {
    if (Number.isFinite(Date.parse(capturedAt))) {
      present.push("captured_at");
    } else {
      invalid.push({ field: "captured_at", reason: "malformed timestamp" });
    }
  } else {
    missing.push("captured_at");
  }

  if (typeof p.tent_id === "string" && p.tent_id.length > 0) {
    present.push("tent_id");
  } else {
    missing.push("tent_id");
  }

  const confidence = p.confidence ?? meta.confidence;
  if (typeof confidence === "string" && confidence.length > 0) {
    present.push("confidence");
  } else {
    missing.push("confidence");
  }

  const readings = (p.readings ?? p.metrics) as unknown;
  if (readings === undefined || readings === null) {
    missing.push("readings");
  } else if (Array.isArray(readings)) {
    if (readings.length === 0) {
      invalid.push({ field: "readings", reason: "empty readings array" });
    } else {
      // Treat array entries as scalars; count valid ones.
      const validOnes = readings.filter(
        (v) =>
          (typeof v === "number" && Number.isFinite(v)) ||
          (typeof v === "string" && v.length > 0),
      );
      readingsCount = validOnes.length;
      if (validOnes.length > 0) present.push("readings");
      else invalid.push({ field: "readings", reason: "no valid reading values" });
    }
  } else if (typeof readings === "object") {
    const entries = Object.entries(readings as Record<string, unknown>);
    if (entries.length === 0) {
      invalid.push({ field: "readings", reason: "empty readings object" });
    } else {
      const validOnes = entries.filter(
        ([, v]) =>
          (typeof v === "number" && Number.isFinite(v)) ||
          (typeof v === "string" && v.length > 0),
      );
      readingsCount = validOnes.length;
      if (validOnes.length > 0) present.push("readings");
      else invalid.push({ field: "readings", reason: "no valid reading values" });
    }
  } else {
    invalid.push({ field: "readings", reason: "readings must be an object" });
  }


  const rawTop = p.raw_payload;
  if (rawTop !== undefined && rawTop !== null) {
    if (typeof rawTop !== "object" || Array.isArray(rawTop)) {
      invalid.push({
        field: "raw_payload",
        reason: "must be an object when present",
      });
    }
  } else {
    const rawMeta = meta.raw_payload;
    if (
      rawMeta !== undefined &&
      rawMeta !== null &&
      (typeof rawMeta !== "object" || Array.isArray(rawMeta))
    ) {
      invalid.push({
        field: "raw_payload",
        reason: "must be an object when present",
      });
    }
  }

  const ready = missing.length === 0 && invalid.length === 0;
  return { ready, present, missing, invalid, readingsCount };
}

// ---------------------------------------------------------------------------
// Validation UI view-model (status, disabled reasons, summary ordering)
// ---------------------------------------------------------------------------

/** Friendly labels for each canonical field. */
export const CANONICAL_FIELD_LABELS: Record<CanonicalIngestField, string> = {
  source: "source",
  captured_at: "captured_at",
  tent_id: "tent_id",
  confidence: "confidence",
  readings: "readings",
};

/** Spec-mandated short missing reason per field. */
export const CANONICAL_MISSING_REASONS: Record<CanonicalIngestField, string> = {
  source: "missing source label",
  captured_at: "missing captured_at or timestamp",
  tent_id: "missing tent context",
  confidence: "missing or invalid value",
  readings: "missing readings (need at least one)",
};

export type ValidationUiStatus = "ready" | "not_ready" | "no_test_yet";

export interface ValidationFieldEntry {
  field: CanonicalIngestField | "raw_payload";
  label: string;
  reason: string;
}

export interface SensorTestbenchValidationUiState {
  status: ValidationUiStatus;
  statusLabel: string;
  badgeTone: "ready" | "warn" | "muted";
  emptyStateMessage: string | null;
  disabledReason: string | null;
  actionsDisabled: boolean;
  summary: {
    missing: ValidationFieldEntry[];
    invalid: ValidationFieldEntry[];
    present: CanonicalIngestField[];
    optional: string[];
  };
}

/**
 * Convert a canonical validation + "has last test?" flag into a single,
 * presenter-friendly view-model. UI renders this output directly so that
 * field labels, disabled reasons, and summary ordering live in one place.
 */
export function buildSensorTestbenchValidationUiState(input: {
  validation: CanonicalIngestValidation;
  hasLastTest: boolean;
}): SensorTestbenchValidationUiState {
  const { validation, hasLastTest } = input;
  const missing: ValidationFieldEntry[] = validation.missing.map((f) => ({
    field: f,
    label: CANONICAL_FIELD_LABELS[f],
    reason: CANONICAL_MISSING_REASONS[f],
  }));
  const invalid: ValidationFieldEntry[] = validation.invalid.map((i) => ({
    field: i.field,
    label:
      i.field === "raw_payload"
        ? "raw_payload"
        : CANONICAL_FIELD_LABELS[i.field],
    reason: i.reason,
  }));

  if (!validation.ready) {
    // Build a precise blocking sentence. When only one required field is
    // missing/invalid, name only that field.
    const blockers = [
      ...missing.map((m) => m.label),
      ...invalid
        .filter((i) => i.field !== "raw_payload")
        .map((i) => `${i.label} (${i.reason})`),
    ];
    let reason: string;
    if (blockers.length === 0) {
      reason = "Disabled until canonical payload is complete.";
    } else if (blockers.length === 1) {
      reason = `Disabled until canonical payload includes ${blockers[0]}.`;
    } else {
      reason = `Disabled until canonical payload includes ${blockers.join(", ")}.`;
    }
    return {
      status: "not_ready",
      statusLabel: "Not ready",
      badgeTone: "warn",
      emptyStateMessage: null,
      disabledReason: reason,
      actionsDisabled: true,
      summary: {
        missing,
        invalid,
        present: validation.present,
        optional: ["raw_payload"],
      },
    };
  }

  if (!hasLastTest) {
    return {
      status: "no_test_yet",
      statusLabel: "No test yet",
      badgeTone: "muted",
      emptyStateMessage:
        "Run a test to generate a payload preview, response inspector, and diagnostics bundle.",
      disabledReason: null,
      actionsDisabled: false,
      summary: {
        missing,
        invalid,
        present: validation.present,
        optional: ["raw_payload"],
      },
    };
  }

  return {
    status: "ready",
    statusLabel: "Ready",
    badgeTone: "ready",
    emptyStateMessage: null,
    disabledReason: null,
    actionsDisabled: false,
    summary: {
      missing,
      invalid,
      present: validation.present,
      optional: ["raw_payload"],
    },
  };
}

// ---------------------------------------------------------------------------
// Diagnostics bundle filename preview
// ---------------------------------------------------------------------------

/** Deterministic preview of the .zip name produced by the bundle download. */
export function buildDiagnosticsBundleFilenamePreview(date: Date): string {
  return buildDownloadFilename(
    "verdant-sensor-diagnostics-bundle",
    "zip",
    date,
  );
}

// ---------------------------------------------------------------------------
// Plain-text formatter for the safe response inspector (support-safe copy)
// ---------------------------------------------------------------------------

/**
 * Render the redacted inspector as plain text for support copy/paste. The
 * function never sees the raw response body — it consumes the already-
 * redacted inspector output. A defensive token-redaction pass is applied as
 * belt-and-suspenders.
 */
export function formatSafeResponseInspectorPlainText(
  inspector: SafeResponseInspector,
): string {
  const lines: string[] = [];
  lines.push("Verdant sensor ingest — response inspector");
  lines.push(`HTTP ${inspector.http_status}`);
  lines.push(`classification: ${inspector.classification}`);
  lines.push(`kind: ${inspector.kind}`);
  if (inspector.note) lines.push(`note: ${inspector.note}`);
  lines.push("breakdown:");
  if (inspector.fields.length === 0) {
    lines.push("  (empty)");
  } else {
    for (const f of inspector.fields) {
      const tag = f.redacted ? " [redacted]" : "";
      lines.push(`  ${f.path} (${f.type})${tag}: ${f.preview}`);
    }
  }
  return redactTokens(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Accessibility label for the canonical readiness badge
// ---------------------------------------------------------------------------

/**
 * Build a screen-reader-friendly label for the readiness badge.
 * Always prefixed with "Canonical payload validation:" so the assistive
 * announcement is unambiguous regardless of surrounding context.
 */
export function buildCanonicalValidationA11yLabel(input: {
  status: ValidationUiStatus;
}): string {
  switch (input.status) {
    case "ready":
      return "Canonical payload validation: Ready";
    case "not_ready":
      return "Canonical payload validation: Not ready";
    case "no_test_yet":
    default:
      return "Canonical payload validation: No test yet";
  }
}

// ---------------------------------------------------------------------------
// Diagnostics share modal — pure helpers
// ---------------------------------------------------------------------------

export interface BuildDiagnosticsShareSummaryInput {
  bundleFilename: string;
  validationUi: SensorTestbenchValidationUiState;
  lastTestResult: {
    http_status: number;
    classification: string;
  } | null;
  inspectorPlainText: string | null;
}

/**
 * Build a single support-ready plain-text summary. Composes existing
 * already-redacted helper outputs only (validation view-model labels +
 * inspector plain text). Defensive token-redaction is applied at the end as
 * belt-and-suspenders so no upstream slip can leak a plaintext token.
 *
 * Never includes: raw response body, Authorization headers, bridge token,
 * service_role/anon_key/api_key/secret values. Sensitive keys in the
 * inspector are already masked at source.
 */
export function buildDiagnosticsShareSummary(
  input: BuildDiagnosticsShareSummaryInput,
): string {
  const { bundleFilename, validationUi, lastTestResult, inspectorPlainText } = input;
  const lines: string[] = [];
  lines.push("Verdant sensor diagnostics — share summary");
  lines.push(`bundle filename: ${bundleFilename}`);
  lines.push(
    `canonical validation: ${validationUi.statusLabel} (${validationUi.status})`,
  );
  if (lastTestResult) {
    lines.push(`last test HTTP status: ${lastTestResult.http_status}`);
    lines.push(`classification: ${lastTestResult.classification}`);
  } else {
    lines.push("last test: none");
  }
  const missing = validationUi.summary.missing;
  lines.push(
    `missing fields: ${
      missing.length === 0
        ? "—"
        : missing.map((m) => `${m.label} (${m.reason})`).join(", ")
    }`,
  );
  const invalid = validationUi.summary.invalid;
  lines.push(
    `invalid fields: ${
      invalid.length === 0
        ? "—"
        : invalid.map((i) => `${i.label}: ${i.reason}`).join("; ")
    }`,
  );
  lines.push("");
  lines.push("response inspector (redacted):");
  lines.push(inspectorPlainText ?? "  (no test yet)");
  return redactTokens(lines.join("\n"));
}

export interface DiagnosticsShareModalState {
  bundleFilename: string;
  statusLabel: string;
  status: ValidationUiStatus;
  badgeTone: "ready" | "warn" | "muted";
  ariaLabel: string;
  supportSummary: string;
  redactedInspectorText: string | null;
  canDownloadBundle: boolean;
}

/**
 * View-model for the share-diagnostics modal. UI renders this output only.
 */
export function buildDiagnosticsShareModalState(input: {
  bundleFilename: string;
  validationUi: SensorTestbenchValidationUiState;
  lastTestResult: { http_status: number; classification: string } | null;
  inspectorPlainText: string | null;
}): DiagnosticsShareModalState {
  return {
    bundleFilename: input.bundleFilename,
    statusLabel: input.validationUi.statusLabel,
    status: input.validationUi.status,
    badgeTone: input.validationUi.badgeTone,
    ariaLabel: buildCanonicalValidationA11yLabel({
      status: input.validationUi.status,
    }),
    supportSummary: buildDiagnosticsShareSummary({
      bundleFilename: input.bundleFilename,
      validationUi: input.validationUi,
      lastTestResult: input.lastTestResult,
      inspectorPlainText: input.inspectorPlainText,
    }),
    redactedInspectorText: input.inspectorPlainText,
    canDownloadBundle: !input.validationUi.actionsDisabled,
  };
}
