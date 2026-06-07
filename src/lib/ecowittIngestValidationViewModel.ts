/**
 * EcoWitt ingest validation evidence view model (pure).
 *
 * Goal: give operators a calm, read-only summary of the latest evidence
 * that the local EcoWitt test sender successfully reached the ingest
 * route — without inventing data, pretending test payloads are live, or
 * leaking secrets/tokens.
 *
 * Inputs are persisted `sensor_readings` rows already loaded by
 * `useEcowittAuditRows`. This module:
 *  - is read-only
 *  - never imports React, Supabase, or anything with side effects
 *  - never references Action Queue, device control, or service_role
 *  - never returns bridge tokens, secrets, JWTs, signed URLs
 *  - returns "not_validated" (not "healthy") when evidence is missing
 */

export type EcowittValidationStatus =
  | "not_validated"
  | "accepted"
  | "rejected_test"
  | "stale";

export interface EcowittIngestValidationRow {
  id?: string | null;
  source?: string | null;
  captured_at?: string | null;
  ts?: string | null;
  metric?: string | null;
  raw_payload?: unknown;
}

export interface EcowittIngestValidationInput {
  rows: readonly EcowittIngestValidationRow[] | null | undefined;
  tentId?: string | null;
  now?: Date;
  /** Staleness threshold in ms. Defaults to 24h. */
  staleAfterMs?: number;
}

export interface EcowittValidationMetricChip {
  key: string;
  label: string;
  present: boolean;
}

export interface EcowittIngestValidationViewModel {
  hasEvidence: boolean;
  status: EcowittValidationStatus;
  statusLabel: string;
  statusMessage: string;
  isTestSender: boolean;
  invalidTest: boolean;
  vendorLabel: string;
  transportLabel: string;
  sourceLabel: string;
  tentScopedLabel: string;
  capturedAtLabel: string;
  ageLabel: string;
  stale: boolean;
  testSenderBadge: { label: string } | null;
  invalidTestBadge: { label: string } | null;
  liveBadge: null; // explicit: test sender never gets a "Live" label
  metricChips: EcowittValidationMetricChip[];
  /** Operator-safe next-step copy. */
  nextSteps: string[];
  /** Empty-state CLI hints. */
  cliHints: { label: string; command: string }[];
}

const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const METRIC_KEYS: { key: string; rawAliases: string[]; label: string }[] = [
  { key: "temp_f", rawAliases: ["temp_f", "temp1f", "tempf"], label: "temp_f" },
  {
    key: "humidity_pct",
    rawAliases: ["humidity_pct", "humidity1", "humidity"],
    label: "humidity_pct",
  },
  { key: "vpd_kpa", rawAliases: ["vpd_kpa"], label: "vpd_kpa" },
  { key: "co2_ppm", rawAliases: ["co2_ppm", "co2"], label: "co2_ppm" },
  {
    key: "soil_moisture_pct",
    rawAliases: ["soil_moisture_pct", "soilmoisture1", "soilmoisture"],
    label: "soil_moisture_pct",
  },
];

const SECRETY_RAW_KEYS = new Set([
  "token",
  "bridge_token",
  "vbt",
  "authorization",
  "service_role",
  "signature",
  "x-amz-signature",
]);

function safeObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRETY_RAW_KEYS.has(k.toLowerCase())) continue;
      out[k] = v;
    }
    return out;
  }
  return {};
}

function pickMetadata(row: EcowittIngestValidationRow): Record<string, unknown> {
  const raw = safeObject(row.raw_payload);
  const inner = safeObject(raw.metadata);
  // Some adapters lift metadata into raw_payload root, support both.
  return { ...inner, ...raw };
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumberLike(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n);
  }
  return false;
}

function maskTentId(tentId: string | null | undefined): string {
  if (!tentId) return "—";
  // Show first 4 chars + length — enough to disambiguate, not the full UUID.
  return `${tentId.slice(0, 4)}…(len=${tentId.length})`;
}

function ageLabel(capturedAtIso: string | null, now: Date): string {
  if (!capturedAtIso) return "—";
  const ts = Date.parse(capturedAtIso);
  if (!Number.isFinite(ts)) return "invalid timestamp";
  const ms = now.getTime() - ts;
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

const CLI_HINTS = [
  { label: "Send valid test payload", command: "bun run dev:send-ecowitt" },
  {
    label: "Send intentionally invalid payload",
    command: "bun run dev:send-ecowitt:invalid",
  },
];

const EMPTY_VM: Omit<
  EcowittIngestValidationViewModel,
  "tentScopedLabel" | "cliHints"
> = {
  hasEvidence: false,
  status: "not_validated",
  statusLabel: "Not validated yet",
  statusMessage:
    "No EcoWitt local test sender evidence found for this tent. Run the local test sender to generate evidence.",
  isTestSender: false,
  invalidTest: false,
  vendorLabel: "—",
  transportLabel: "—",
  sourceLabel: "—",
  capturedAtLabel: "—",
  ageLabel: "—",
  stale: false,
  testSenderBadge: null,
  invalidTestBadge: null,
  liveBadge: null,
  metricChips: METRIC_KEYS.map((m) => ({
    key: m.key,
    label: m.label,
    present: false,
  })),
  nextSteps: [
    "Run `bun run dev:send-ecowitt` against this tent.",
    "Reload this page to confirm the ingest webhook accepted the payload.",
  ],
};

export function buildEcowittIngestValidationViewModel(
  input: EcowittIngestValidationInput,
): EcowittIngestValidationViewModel {
  const now = input.now ?? new Date();
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const rows = (input.rows ?? []).filter(
    (r): r is EcowittIngestValidationRow => !!r && typeof r === "object",
  );
  const tentScopedLabel = maskTentId(input.tentId ?? null);

  if (rows.length === 0) {
    return { ...EMPTY_VM, tentScopedLabel, cliHints: CLI_HINTS };
  }

  // Pick newest test-sender row first; fall back to newest ecowitt row.
  const sorted = [...rows].sort((a, b) => {
    const ta = Date.parse(a.captured_at ?? a.ts ?? "") || 0;
    const tb = Date.parse(b.captured_at ?? b.ts ?? "") || 0;
    return tb - ta;
  });

  const testSenderRow = sorted.find((r) => {
    const meta = pickMetadata(r);
    return meta.test_sender === true || meta.test_sender === "true";
  });

  if (!testSenderRow) {
    return {
      ...EMPTY_VM,
      tentScopedLabel,
      cliHints: CLI_HINTS,
      statusMessage:
        "EcoWitt rows exist for this tent, but none are marked as local test sender evidence.",
    };
  }

  const meta = pickMetadata(testSenderRow);
  const invalidTest = meta.invalid_test === true || meta.invalid_test === "true";
  const transport = asString(meta.transport) ?? "—";
  const vendor =
    asString(meta.vendor) ?? asString(meta.stationtype) ?? "ecowitt";
  const sourceLabel = asString(testSenderRow.source) ?? "ecowitt";
  const capturedAt =
    asString(testSenderRow.captured_at) ?? asString(testSenderRow.ts);
  const capturedAtLabel = capturedAt ?? "—";

  // Metric presence: a row is per-metric, so look across all sorted rows
  // sharing the same captured_at for completeness.
  const sameBatch = sorted.filter(
    (r) =>
      (r.captured_at ?? r.ts) ===
      (testSenderRow.captured_at ?? testSenderRow.ts),
  );
  const presentRawKeys = new Set<string>();
  for (const r of sameBatch) {
    if (typeof r.metric === "string") presentRawKeys.add(r.metric);
    const raw = safeObject(r.raw_payload);
    for (const k of Object.keys(raw)) presentRawKeys.add(k);
    const metrics = safeObject(raw.metrics);
    for (const [k, v] of Object.entries(metrics)) {
      if (asNumberLike(v)) presentRawKeys.add(k);
    }
  }
  const metricChips: EcowittValidationMetricChip[] = METRIC_KEYS.map((m) => ({
    key: m.key,
    label: m.label,
    present: m.rawAliases.some((alias) => presentRawKeys.has(alias)),
  }));

  let stale = false;
  if (capturedAt) {
    const ts = Date.parse(capturedAt);
    stale = Number.isFinite(ts) && now.getTime() - ts > staleAfterMs;
  }

  let status: EcowittValidationStatus = "accepted";
  let statusLabel = "Accepted by ingest webhook";
  let statusMessage =
    "Local EcoWitt test sender payload was accepted by the ingest webhook. This is test data, not live sensor telemetry.";
  if (invalidTest) {
    // Invalid payloads should be rejected by the webhook. If we still see
    // a row tagged invalid_test, surface it for the operator instead of
    // calling it healthy.
    status = "rejected_test";
    statusLabel = "Invalid test payload";
    statusMessage =
      "An intentionally invalid test payload is recorded for this tent. Confirm the ingest webhook rejected the impossible metrics.";
  } else if (stale) {
    status = "stale";
    statusLabel = "Stale test evidence";
    statusMessage =
      "Local EcoWitt test sender evidence exists but is older than the staleness threshold. Re-run the test sender to refresh.";
  }

  const nextSteps: string[] =
    status === "accepted"
      ? [
          "No action required — this is test data only, not live telemetry.",
        ]
      : status === "stale"
        ? [
            "Re-run `bun run dev:send-ecowitt` to refresh evidence.",
          ]
        : [
            "Verify the ingest webhook rejected the invalid payload server-side.",
            "Do not treat this row as a healthy sensor reading.",
          ];

  return {
    hasEvidence: true,
    status,
    statusLabel,
    statusMessage,
    isTestSender: true,
    invalidTest,
    vendorLabel: vendor,
    transportLabel: transport,
    sourceLabel,
    tentScopedLabel,
    capturedAtLabel,
    ageLabel: ageLabel(capturedAt, now),
    stale,
    testSenderBadge: { label: "Local test sender" },
    invalidTestBadge: invalidTest ? { label: "Invalid test" } : null,
    liveBadge: null,
    metricChips,
    nextSteps,
    cliHints: CLI_HINTS,
  };
}

export const ECOWITT_INGEST_VALIDATION_CLI_HINTS = CLI_HINTS;
