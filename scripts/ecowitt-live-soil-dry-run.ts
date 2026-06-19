/**
 * ecowitt-live-soil-dry-run
 * -------------------------
 * Runs a sanitized EcoWitt payload through the pure normalizer and prints
 * the redacted canonical Verdant webhook payload(s). Never posts to the
 * network. Never writes to Supabase. Never touches device control.
 *
 * Usage:
 *   bun run scripts/ecowitt-live-soil-dry-run.ts \
 *     --fixture fixtures/ecowitt-live-soil-sample.json --dry-run
 *
 *   bun run scripts/ecowitt-live-soil-dry-run.ts \
 *     --fixture fixtures/ecowitt-live-soil-sample.json \
 *     --csv-out /tmp/ecowitt-audit.csv --dry-run
 *
 * Exit codes:
 *   0  at least one payload normalized successfully
 *   1  payload invalid / rejected
 *   2  bad CLI / IO error
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  normalizeEcowittLiveSoilPayload,
  parseEcowittSoilChannelMap,
  redactForLog,
  redactRawPayloadForOutbound,
  ECOWITT_LIVE_SOIL_PROVIDER,
  ECOWITT_LIVE_SOIL_TRANSPORT,
  type CanonicalWebhookPayload,
  type EcowittSoilChannelMap,
} from "../src/lib/ecowittLiveSoilIngestRules";

// ---------------------------------------------------------------------------
// Canonical Verdant ingest preview (audit-only mapping)
// ---------------------------------------------------------------------------
//
// The bridge's outbound webhook payload uses `source: "ecowitt"` for transport
// back-compat with the existing `sensor-ingest-webhook`. Verdant's canonical
// persisted source — used in charts, sensor truth, and the UI — is one of
// `live | manual | csv | demo | stale | invalid`. This preview maps an
// accepted bridge payload into that canonical shape for audit/CSV output:
//
//   source   = "live"           (accepted live MQTT reading)
//   provider = "ecowitt"
//   transport = "mqtt"
//
// This mapping is **presentation only**. We do NOT change the outbound
// webhook contract here.

export interface CanonicalIngestPreview {
  source: "live";
  provider: typeof ECOWITT_LIVE_SOIL_PROVIDER;
  transport: typeof ECOWITT_LIVE_SOIL_TRANSPORT;
  tent_id: string;
  plant_id: string | null;
  captured_at: string;
  metrics: CanonicalWebhookPayload["metrics"];
  metadata: CanonicalWebhookPayload["metadata"];
  raw_payload_redacted: Record<string, unknown>;
  soil_channel: string | null;
}

export function toCanonicalIngestPreview(
  p: CanonicalWebhookPayload,
): CanonicalIngestPreview {
  return {
    source: "live",
    provider: ECOWITT_LIVE_SOIL_PROVIDER,
    transport: ECOWITT_LIVE_SOIL_TRANSPORT,
    tent_id: p.tent_id,
    plant_id: p.metadata.plant_id ?? null,
    captured_at: p.captured_at,
    metrics: p.metrics,
    metadata: p.metadata,
    raw_payload_redacted: redactRawPayloadForOutbound(
      (p.raw_payload ?? {}) as Record<string, unknown>,
    ),
    soil_channel: p.metadata.channel ?? null,
  };
}

// ---------------------------------------------------------------------------
// Pure dry-run
// ---------------------------------------------------------------------------

export interface DryRunOptions {
  payload: Record<string, unknown>;
  defaultTentId?: string | null;
  defaultPlantId?: string | null;
  channelMap?: EcowittSoilChannelMap;
  now?: Date;
}

export interface DryRunOutput {
  ok: boolean;
  accepted: number;
  rejected: number;
  reasons: string[];
  payloads: CanonicalWebhookPayload[];
  canonicalPreviews: CanonicalIngestPreview[];
  redactedRawPreview: Record<string, unknown>;
  /** Always false in this script — we never post in dry-run. */
  posted: false;
}

export function runEcowittDryRun(opts: DryRunOptions): DryRunOutput {
  const result = normalizeEcowittLiveSoilPayload({
    payload: opts.payload,
    defaultTentId: opts.defaultTentId ?? null,
    defaultPlantId: opts.defaultPlantId ?? null,
    soilChannelMap: opts.channelMap ?? {},
    now: opts.now,
  });
  const sanitized = result.payloads.map((p) => ({
    ...p,
    raw_payload: redactRawPayloadForOutbound(
      (p.raw_payload ?? {}) as Record<string, unknown>,
    ),
  }));
  const canonicalPreviews = sanitized.map(toCanonicalIngestPreview);
  return {
    ok: sanitized.length > 0,
    accepted: sanitized.length,
    rejected: sanitized.length === 0 ? 1 : 0,
    reasons: result.reasons,
    payloads: sanitized,
    canonicalPreviews,
    redactedRawPreview: redactForLog(opts.payload) as Record<string, unknown>,
    posted: false,
  };
}

// ---------------------------------------------------------------------------
// CSV export (audit-only). Never includes secrets / tokens / bridge auth.
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  "captured_at",
  "accepted",
  "reason",
  "source",
  "provider",
  "transport",
  "tent_id",
  "plant_id",
  "air_temperature_c",
  "air_temperature_f",
  "humidity_pct",
  "soil_moisture_pct",
  "soil_temperature_c",
  "soil_temperature_f",
  "vpd_kpa",
  "soil_channel",
  "raw_payload_redacted",
] as const;

function fToC(f: number | undefined): number | "" {
  return typeof f === "number" && Number.isFinite(f)
    ? Math.round(((f - 32) * 5) / 9 * 100) / 100
    : "";
}

function num(n: number | undefined | null): number | "" {
  return typeof n === "number" && Number.isFinite(n) ? n : "";
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildDryRunCsv(out: DryRunOutput): string {
  const rows: string[] = [CSV_COLUMNS.join(",")];

  if (out.canonicalPreviews.length === 0) {
    const reason = out.reasons.join("|") || "rejected";
    const cells = CSV_COLUMNS.map((c) => {
      if (c === "accepted") return "false";
      if (c === "reason") return csvEscape(reason);
      if (c === "raw_payload_redacted")
        return csvEscape(out.redactedRawPreview);
      return "";
    });
    rows.push(cells.join(","));
    return rows.join("\n") + "\n";
  }

  for (const p of out.canonicalPreviews) {
    const m = p.metrics;
    const cells: Record<(typeof CSV_COLUMNS)[number], string> = {
      captured_at: csvEscape(p.captured_at),
      accepted: "true",
      reason: "",
      source: csvEscape(p.source),
      provider: csvEscape(p.provider),
      transport: csvEscape(p.transport),
      tent_id: csvEscape(p.tent_id),
      plant_id: csvEscape(p.plant_id ?? ""),
      air_temperature_c: csvEscape(fToC(m.temp_f)),
      air_temperature_f: csvEscape(num(m.temp_f)),
      humidity_pct: csvEscape(num(m.humidity_pct)),
      soil_moisture_pct: csvEscape(num(m.soil_moisture_pct)),
      soil_temperature_c: csvEscape(fToC(m.soil_temp_f)),
      soil_temperature_f: csvEscape(num(m.soil_temp_f)),
      // Missing VPD MUST stay blank, never 0.
      vpd_kpa: csvEscape(num(m.vpd_kpa)),
      soil_channel: csvEscape(p.soil_channel ?? ""),
      raw_payload_redacted: csvEscape(p.raw_payload_redacted),
    };
    rows.push(CSV_COLUMNS.map((c) => cells[c]).join(","));
  }
  return rows.join("\n") + "\n";
}

export function writeDryRunCsv(path: string, out: DryRunOutput): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (e) {
      throw new Error(
        `csv_out parent folder cannot be created: ${dir} (${(e as Error).message})`,
      );
    }
  }
  const csv = buildDryRunCsv(out);
  // Defence in depth: make sure no secret-shaped key bleeds through.
  if (/PASSKEY|service_role|VERDANT_BRIDGE_TOKEN|Bearer\s+\S/i.test(csv)) {
    throw new Error("csv_export_safety_violation");
  }
  writeFileSync(path, csv, "utf8");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface ParsedArgs {
  fixturePath: string | null;
  stdin: boolean;
  dryRun: boolean;
  csvOut: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  let fixturePath: string | null = null;
  let stdin = false;
  let dryRun = true; // always true in this script
  let csvOut: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixture") fixturePath = argv[++i] ?? null;
    else if (a === "--stdin") stdin = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--csv-out") csvOut = argv[++i] ?? null;
  }
  return { fixturePath, stdin, dryRun, csvOut };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.fixturePath && !args.stdin) {
    console.error(
      "Usage: bun run scripts/ecowitt-live-soil-dry-run.ts --fixture <path> [--csv-out <path>] [--dry-run]",
    );
    process.exit(2);
  }
  let raw: string;
  try {
    raw = args.fixturePath
      ? readFileSync(args.fixturePath, "utf8")
      : await readStdin();
  } catch (e) {
    console.error("read_failed:", (e as Error).message);
    process.exit(2);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    console.error("invalid_json:", (e as Error).message);
    process.exit(1);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    console.error("payload_not_object");
    process.exit(1);
  }
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (!k.startsWith("_")) clean[k] = v;
  }

  const out = runEcowittDryRun({
    payload: clean,
    defaultTentId: process.env.VERDANT_TENT_ID ?? null,
    defaultPlantId: process.env.VERDANT_PLANT_ID ?? null,
    channelMap: parseEcowittSoilChannelMap(
      process.env.ECOWITT_SOIL_CHANNEL_MAP_JSON,
    ),
    now:
      typeof clean.dateutc === "string"
        ? new Date(`${(clean.dateutc as string).replace(" ", "T")}Z`)
        : undefined,
  });

  if (args.csvOut) {
    try {
      writeDryRunCsv(args.csvOut, out);
    } catch (e) {
      console.error("csv_write_failed:", (e as Error).message);
      process.exit(2);
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        mode: "dry-run",
        posted: false,
        accepted: out.accepted,
        rejected: out.rejected,
        reasons: out.reasons,
        canonicalPreviews: out.canonicalPreviews,
        payloads: out.payloads,
        redactedRawPreview: out.redactedRawPreview,
        csvOut: args.csvOut ?? null,
      },
      null,
      2,
    ),
  );
  process.exit(out.ok ? 0 : 1);
}

const isMain =
  typeof (import.meta as unknown as { main?: boolean }).main === "boolean"
    ? (import.meta as unknown as { main?: boolean }).main === true
    : false;

if (isMain) {
  void main();
}
