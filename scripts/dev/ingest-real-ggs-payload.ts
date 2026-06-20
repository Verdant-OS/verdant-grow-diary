#!/usr/bin/env -S bun run
/**
 * ingest-real-ggs-payload — dev/operator runner.
 *
 * Reads ONE real Spider Farmer GGS 3-in-1 Soil Sensor Pro payload from a
 * file (or stdin), normalizes it through the existing pure GGS helpers,
 * and commits the canonical long-format rows through the existing
 * `pi_ingest_commit_batch` RPC.
 *
 * SAFETY (read before running):
 *   - This script is for REAL physical GGS payloads only.
 *   - Do NOT use invented values with source "live". Fabricating live
 *     telemetry violates Verdant's hard "no fake live data" rule and
 *     will not clear the Sentinel live sign-off.
 *   - Use source "demo" only in fixture tests, NEVER for live sign-off.
 *   - No alerts / Action Queue / AI / device control side effects.
 *   - This is the ONLY write the script performs; routes through the
 *     existing validated RPC (which runs validate_sensor_reading()).
 *
 * Usage:
 *   bun run scripts/dev/ingest-real-ggs-payload.ts \
 *        --payload ./tmp/my-real-ggs-reading.json [--dry-run]
 *
 *   # or pipe via stdin:
 *   cat my-payload.json | bun run scripts/dev/ingest-real-ggs-payload.ts --stdin
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (the RPC is SECURITY DEFINER but must be
 *                                called with a key that can reach the
 *                                postgres function; service_role is the
 *                                canonical operator-side caller)
 *   VERDANT_USER_ID             (server-resolved tent owner UUID)
 *   VERDANT_BRIDGE_ID           (matches an existing bridge_tokens row id)
 *   VERDANT_TENT_ID             (target tent UUID)
 *   VERDANT_DEVICE_ID           (physical probe / serial id)
 *
 * Flags:
 *   --payload <path>   Path to the JSON payload file.
 *   --stdin            Read payload JSON from stdin instead of --payload.
 *   --dry-run          Plan + report only. No RPC call.
 */

import { readFileSync } from "node:fs";
import { buildGgsRealPayloadCommitInput } from "../../src/lib/ggsRealPayloadIngestRules";

interface CliFlags {
  payloadPath: string | null;
  fromStdin: boolean;
  dryRun: boolean;
}

export function parseFlags(argv: readonly string[]): CliFlags {
  const flags: CliFlags = { payloadPath: null, fromStdin: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--payload") flags.payloadPath = argv[++i] ?? null;
    else if (a === "--stdin") flags.fromStdin = true;
    else if (a === "--dry-run") flags.dryRun = true;
  }
  return flags;
}

interface RuntimeEnv {
  url: string | null;
  serviceKey: string | null;
  userId: string | null;
  bridgeId: string | null;
  tentId: string | null;
  deviceId: string | null;
}

export function readEnv(env: NodeJS.ProcessEnv): RuntimeEnv {
  return {
    url: env.SUPABASE_URL?.trim() || null,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
    userId: env.VERDANT_USER_ID?.trim() || null,
    bridgeId: env.VERDANT_BRIDGE_ID?.trim() || null,
    tentId: env.VERDANT_TENT_ID?.trim() || null,
    deviceId: env.VERDANT_DEVICE_ID?.trim() || null,
  };
}

function printBanner(): void {
  // eslint-disable-next-line no-console
  console.log(
    [
      "────────────────────────────────────────────────────────────",
      " Verdant • ingest-real-ggs-payload",
      " This script is for REAL physical GGS payloads only.",
      " Do NOT use invented values with source \"live\".",
      " Use source \"demo\" only in fixture tests, never for Sentinel",
      " live sign-off.",
      "────────────────────────────────────────────────────────────",
    ].join("\n"),
  );
}

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Uint8Array);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function fail(message: string, code = 1): never {
  // eslint-disable-next-line no-console
  console.error(`refused: ${message}`);
  process.exit(code);
}

async function main(): Promise<void> {
  printBanner();

  const flags = parseFlags(process.argv.slice(2));
  const env = readEnv(process.env);

  if (!env.userId) fail("VERDANT_USER_ID env is required");
  if (!env.bridgeId) fail("VERDANT_BRIDGE_ID env is required");
  if (!env.tentId) fail("VERDANT_TENT_ID env is required");
  if (!env.deviceId) fail("VERDANT_DEVICE_ID env is required");
  if (!flags.dryRun) {
    if (!env.url) fail("SUPABASE_URL env is required (omit by using --dry-run)");
    if (!env.serviceKey) {
      fail("SUPABASE_SERVICE_ROLE_KEY env is required (omit by using --dry-run)");
    }
  }

  let raw: string;
  if (flags.fromStdin) {
    raw = await readStdin();
  } else if (flags.payloadPath) {
    try {
      raw = readFileSync(flags.payloadPath, "utf8");
    } catch (e) {
      fail(`could not read --payload file: ${(e as Error).message}`);
    }
  } else {
    fail("provide --payload <path> or --stdin");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    fail(`payload is not valid JSON: ${(e as Error).message}`);
  }

  const plan = buildGgsRealPayloadCommitInput(payload, {
    userId: env.userId!,
    bridgeId: env.bridgeId!,
    tentId: env.tentId!,
    deviceId: env.deviceId!,
  });

  if (!plan.ok) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify(
        { ok: false, reason: plan.reason, details: plan.details ?? null },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        plan: {
          tent_id: plan.tentId,
          bridge_id: plan.bridgeId,
          row_count: plan.rows.length,
          metrics: plan.rows.map((r) => r.metric),
          captured_at: plan.rows[0]?.captured_at,
          warnings: plan.warnings,
        },
      },
      null,
      2,
    ),
  );

  if (flags.dryRun) {
    // eslint-disable-next-line no-console
    console.log("dry-run: no RPC call made");
    return;
  }

  // Lazy import the SDK so --dry-run and tests never need it.
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(env.url!, env.serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.rpc("pi_ingest_commit_batch", {
    p_user_id: plan.userId,
    p_bridge_id: plan.bridgeId,
    p_tent_id: plan.tentId,
    p_rows: plan.rows,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error(`commit failed: ${error.message}`);
    process.exit(3);
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ committed: data }, null, 2));
}

// Only run when invoked directly (not when imported by tests).
if (import.meta.main) {
  main().catch((e) => fail((e as Error).message, 4));
}
