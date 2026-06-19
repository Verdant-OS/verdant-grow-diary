/**
 * ecowitt-live-soil-dry-run
 * -------------------------
 * Runs a sanitized EcoWitt payload through the pure normalizer and prints
 * the redacted canonical Verdant webhook payload(s). Never posts to the
 * network. Never writes to Supabase. Never touches device control.
 *
 * Usage:
 *   bun run scripts/ecowitt-live-soil-dry-run.ts \
 *     --fixture fixtures/ecowitt-live-soil-sample.json
 *
 *   echo '{"tempf":75,"humidity":55}' | \
 *     VERDANT_TENT_ID=<uuid> \
 *     bun run scripts/ecowitt-live-soil-dry-run.ts --stdin
 *
 * Exit codes:
 *   0  at least one payload normalized successfully
 *   1  payload invalid / rejected
 *   2  bad CLI / IO error
 */

import { readFileSync } from "node:fs";
import {
  normalizeEcowittLiveSoilPayload,
  parseEcowittSoilChannelMap,
  redactForLog,
  redactRawPayloadForOutbound,
  type CanonicalWebhookPayload,
  type EcowittSoilChannelMap,
} from "../src/lib/ecowittLiveSoilIngestRules";

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
  redactedRawPreview: Record<string, unknown>;
  /** Always false in this script — we never post in dry-run. */
  posted: false;
}

/**
 * Pure dry-run: normalize + redact. No I/O. Safe to unit test.
 */
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
  return {
    ok: sanitized.length > 0,
    accepted: sanitized.length,
    rejected: sanitized.length === 0 ? 1 : 0,
    reasons: result.reasons,
    payloads: sanitized,
    redactedRawPreview: redactForLog(opts.payload) as Record<string, unknown>,
    posted: false,
  };
}

function parseArgs(argv: string[]): {
  fixturePath: string | null;
  stdin: boolean;
  dryRun: boolean;
} {
  let fixturePath: string | null = null;
  let stdin = false;
  let dryRun = true; // always true in this script
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixture") fixturePath = argv[++i] ?? null;
    else if (a === "--stdin") stdin = true;
    else if (a === "--dry-run") dryRun = true;
  }
  return { fixturePath, stdin, dryRun };
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
      "Usage: bun run scripts/ecowitt-live-soil-dry-run.ts --fixture <path> [--dry-run]",
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
  // Strip documentation-only keys (e.g. "_comment") so the fixture stays
  // self-documenting without polluting the normalizer input.
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
    // Force "now" to the payload's dateutc when present so a static
    // fixture doesn't go stale over time.
    now:
      typeof clean.dateutc === "string"
        ? new Date(`${(clean.dateutc as string).replace(" ", "T")}Z`)
        : undefined,
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        mode: "dry-run",
        posted: false,
        accepted: out.accepted,
        rejected: out.rejected,
        reasons: out.reasons,
        payloads: out.payloads,
        redactedRawPreview: out.redactedRawPreview,
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
