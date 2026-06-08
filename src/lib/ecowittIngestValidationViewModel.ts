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

export type EcowittValidationMetricStatus =
  | "accepted"
  | "rejected"
  | "missing"
  | "not_checked";

export interface EcowittIngestValidationRow {
  id?: string | null;
  source?: string | null;
  captured_at?: string | null;
  ts?: string | null;
  metric?: string | null;
  value?: number | null;
  raw_payload?: unknown;
}

export interface EcowittIngestValidationInput {
  rows: readonly EcowittIngestValidationRow[] | null | undefined;
  tentId?: string | null;
  now?: Date;
  /** Staleness threshold in ms. Defaults to 24h. */
  staleAfterMs?: number;
  /** Captured_at values that have already been logged to diary (idempotency). */
  loggedCapturedAts?: readonly string[];
}

export interface EcowittValidationMetricChip {
  key: string;
  label: string;
  present: boolean;
}

export interface EcowittValidationMetricRow {
  key: string;
  label: string;
  present: boolean;
  status: EcowittValidationMetricStatus;
  /** Numeric value if safe to display. */
  value: number | null;
  /** Operator-safe reason for rejected/missing rows; empty string otherwise. */
  reason: string;
}

export interface EcowittValidationTimelineEntry {
  key: string;
  capturedAt: string | null;
  capturedAtLabel: string;
  ageLabel: string;
  status: EcowittValidationStatus;
  statusLabel: string;
  invalidTest: boolean;
  stale: boolean;
  metricCount: number;
  metricSummary: string;
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
  metricRows: EcowittValidationMetricRow[];
  timeline: EcowittValidationTimelineEntry[];
  /** Operator-safe next-step copy. */
  nextSteps: string[];
  /** Empty-state CLI hints. */
  cliHints: { label: string; command: string }[];
  /** Explicit warnings about derived metrics appearing in raw readings. */
  derivedReadingWarnings: string[];
  /** Eligible to log latest validated snapshot to diary. */
  eligibleForDiaryLog: boolean;
  /** Reason ineligible if !eligibleForDiaryLog. */
  ineligibleReason: string | null;
  /** True when captured_at is already in the loggedCapturedAts input set. */
  alreadyLogged: boolean;
  /** Latest validated captured_at for idempotency keys. */
  latestCapturedAt: string | null;
  /** Latest accepted raw payload echo (safe object). */
  latestRawPayload: unknown;
  /** Per-attempt export rows for the last N validation attempts. */
  exportAttempts: Array<{
    capturedAt: string | null;
    ageLabel: string;
    status: string;
    statusLabel: string;
    invalidTest: boolean;
    stale: boolean;
    metricSummary: string;
    metrics: EcowittValidationMetricRow[];
    rawPayload: unknown;
  }>;
  /** Active metric thresholds for export. */
  thresholds: Array<{
    key: string;
    label: string;
    min: number;
    max: number;
    unit: string;
  }>;
}

const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const TIMELINE_MAX = 10;

interface MetricSpec {
  key: string;
  rawAliases: string[];
  label: string;
  min: number;
  max: number;
  unit: string;
}

const METRIC_SPECS: MetricSpec[] = [
  {
    key: "temp_f",
    rawAliases: ["temp_f", "temp1f", "tempf"],
    label: "temp_f",
    min: 32,
    max: 120,
    unit: "°F",
  },
  {
    key: "humidity_pct",
    rawAliases: ["humidity_pct", "humidity1", "humidity"],
    label: "humidity_pct",
    min: 0,
    max: 100,
    unit: "%",
  },
  {
    key: "vpd_kpa",
    rawAliases: ["vpd_kpa"],
    label: "vpd_kpa",
    min: 0,
    max: 5,
    unit: "kPa",
  },
  {
    key: "co2_ppm",
    rawAliases: ["co2_ppm", "co2"],
    label: "co2_ppm",
    min: 0,
    max: 10000,
    unit: "ppm",
  },
  {
    key: "soil_moisture_pct",
    rawAliases: ["soil_moisture_pct", "soilmoisture1", "soilmoisture"],
    label: "soil_moisture_pct",
    min: 0,
    max: 100,
    unit: "%",
  },
];

const METRIC_KEYS = METRIC_SPECS.map((m) => ({
  key: m.key,
  rawAliases: m.rawAliases,
  label: m.label,
}));

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

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asNumberLike(v: unknown): boolean {
  return coerceNumber(v) !== null;
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

export const ECOWITT_VALIDATION_COPY_COMMANDS = {
  accepted: "bun run dev:send-ecowitt",
  invalid: "bun run dev:send-ecowitt:invalid",
} as const;

const EMPTY_METRIC_ROWS: EcowittValidationMetricRow[] = METRIC_SPECS.map((m) => ({
  key: m.key,
  label: m.label,
  present: false,
  status: "not_checked",
  value: null,
  reason: "No local test sender evidence yet.",
}));

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
  metricRows: EMPTY_METRIC_ROWS,
  timeline: [],
  nextSteps: [
    "Run `bun run dev:send-ecowitt` against this tent.",
    "Reload this page to confirm the ingest webhook accepted the payload.",
  ],
};

interface BatchValues {
  /** Aggregated numeric values for the batch keyed by raw alias / metric key. */
  values: Map<string, number>;
  presentRawKeys: Set<string>;
}

function collectBatchValues(
  rows: EcowittIngestValidationRow[],
): BatchValues {
  const values = new Map<string, number>();
  const presentRawKeys = new Set<string>();
  for (const r of rows) {
    if (typeof r.metric === "string") {
      presentRawKeys.add(r.metric);
      const v = coerceNumber(r.value);
      if (v !== null && !values.has(r.metric)) values.set(r.metric, v);
    }
    const raw = safeObject(r.raw_payload);
    for (const [k, v] of Object.entries(raw)) {
      presentRawKeys.add(k);
      const n = coerceNumber(v);
      if (n !== null && !values.has(k)) values.set(k, n);
    }
    const metrics = safeObject(raw.metrics);
    for (const [k, v] of Object.entries(metrics)) {
      if (asNumberLike(v)) {
        presentRawKeys.add(k);
        const n = coerceNumber(v);
        if (n !== null && !values.has(k)) values.set(k, n);
      }
    }
  }
  return { values, presentRawKeys };
}

function metricValueFor(spec: MetricSpec, batch: BatchValues): number | null {
  for (const alias of spec.rawAliases) {
    const v = batch.values.get(alias);
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function buildMetricRows(
  batchRows: EcowittIngestValidationRow[],
  invalidTest: boolean,
): EcowittValidationMetricRow[] {
  const batch = collectBatchValues(batchRows);
  return METRIC_SPECS.map((spec) => {
    const present = spec.rawAliases.some((a) => batch.presentRawKeys.has(a));
    const value = metricValueFor(spec, batch);
    if (!present) {
      return {
        key: spec.key,
        label: spec.label,
        present: false,
        status: "missing",
        value: null,
        reason: "Not included in latest test payload.",
      } satisfies EcowittValidationMetricRow;
    }
    if (value === null) {
      return {
        key: spec.key,
        label: spec.label,
        present: true,
        status: "not_checked",
        value: null,
        reason: "Present but non-numeric — webhook would normalize.",
      } satisfies EcowittValidationMetricRow;
    }
    const inRange = value >= spec.min && value <= spec.max;
    if (!inRange) {
      return {
        key: spec.key,
        label: spec.label,
        present: true,
        status: "rejected",
        value,
        reason: `Outside accepted range ${spec.min}–${spec.max} ${spec.unit}.`,
      } satisfies EcowittValidationMetricRow;
    }
    // In range. If the batch is flagged invalid_test but this specific metric
    // happens to be in range, mark it as not_checked rather than green-lighting
    // an intentionally-invalid payload as healthy.
    if (invalidTest) {
      return {
        key: spec.key,
        label: spec.label,
        present: true,
        status: "not_checked",
        value,
        reason: "Part of an invalid test batch — not treated as healthy.",
      } satisfies EcowittValidationMetricRow;
    }
    return {
      key: spec.key,
      label: spec.label,
      present: true,
      status: "accepted",
      value,
      reason: "",
    } satisfies EcowittValidationMetricRow;
  });
}

function buildTimeline(
  testSenderRows: EcowittIngestValidationRow[],
  now: Date,
  staleAfterMs: number,
): EcowittValidationTimelineEntry[] {
  // Group by captured_at|ts so multi-metric rows for one payload collapse.
  const groups = new Map<string, EcowittIngestValidationRow[]>();
  for (const r of testSenderRows) {
    const key = (r.captured_at ?? r.ts ?? r.id ?? "") + "";
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const entries: EcowittValidationTimelineEntry[] = [];
  for (const [key, batchRows] of groups) {
    const first = batchRows[0];
    const meta = pickMetadata(first);
    const invalidTest =
      meta.invalid_test === true || meta.invalid_test === "true";
    const capturedAt = asString(first.captured_at) ?? asString(first.ts);
    const ts = capturedAt ? Date.parse(capturedAt) : NaN;
    const stale =
      Number.isFinite(ts) && now.getTime() - ts > staleAfterMs;
    const metricRows = buildMetricRows(batchRows, invalidTest);
    const accepted = metricRows.filter((m) => m.status === "accepted").length;
    const rejected = metricRows.filter((m) => m.status === "rejected").length;
    const missing = metricRows.filter((m) => m.status === "missing").length;
    let status: EcowittValidationStatus = "accepted";
    let statusLabel = "Accepted";
    if (invalidTest) {
      status = "rejected_test";
      statusLabel = "Invalid test";
    } else if (stale) {
      status = "stale";
      statusLabel = "Stale";
    }
    entries.push({
      key,
      capturedAt,
      capturedAtLabel: capturedAt ?? "—",
      ageLabel: ageLabel(capturedAt, now),
      status,
      statusLabel,
      invalidTest,
      stale,
      metricCount: accepted,
      metricSummary: `${accepted} accepted · ${rejected} rejected · ${missing} missing`,
    });
  }
  // Newest first; stable by captured_at desc, then key desc.
  entries.sort((a, b) => {
    const ta = a.capturedAt ? Date.parse(a.capturedAt) : 0;
    const tb = b.capturedAt ? Date.parse(b.capturedAt) : 0;
    if (tb !== ta) return tb - ta;
    return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
  });
  return entries.slice(0, TIMELINE_MAX);
}

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

  const allTestSenderRows = sorted.filter((r) => {
    const meta = pickMetadata(r);
    return meta.test_sender === true || meta.test_sender === "true";
  });
  const testSenderRow = allTestSenderRows[0];

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

  const sameBatch = sorted.filter(
    (r) =>
      (r.captured_at ?? r.ts) ===
      (testSenderRow.captured_at ?? testSenderRow.ts),
  );

  const batch = collectBatchValues(sameBatch);
  const metricChips: EcowittValidationMetricChip[] = METRIC_KEYS.map((m) => ({
    key: m.key,
    label: m.label,
    present: m.rawAliases.some((alias) => batch.presentRawKeys.has(alias)),
  }));
  const metricRows = buildMetricRows(sameBatch, invalidTest);

  let stale = false;
  if (capturedAt) {
    const ts = Date.parse(capturedAt);
    stale = Number.isFinite(ts) && now.getTime() - ts > staleAfterMs;
  }

  let status: EcowittValidationStatus = "accepted";
  let statusLabel = "Accepted by ingest webhook";
  let statusMessage =
    "Local EcoWitt test sender payload was accepted by the ingest webhook. This is test data, not real sensor telemetry.";
  if (invalidTest) {
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
        ? ["Re-run `bun run dev:send-ecowitt` to refresh evidence."]
        : [
            "Verify the ingest webhook rejected the invalid payload server-side.",
            "Do not treat this row as a healthy sensor reading.",
          ];

  const timeline = buildTimeline(allTestSenderRows, now, staleAfterMs);

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
    metricRows,
    timeline,
    nextSteps,
    cliHints: CLI_HINTS,
  };
}

export const ECOWITT_INGEST_VALIDATION_CLI_HINTS = CLI_HINTS;
