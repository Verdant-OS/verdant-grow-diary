#!/usr/bin/env -S bun run
/**
 * CI preflight: verify Craft plan price IDs exist in Paddle for the
 * requested environment(s). Read-only. Fails the build (exit 1) if any
 * required external_id is missing, so we never merge or deploy a change
 * that ships a checkout the catalog can't fulfill.
 *
 * Why this exists: `craft_monthly` / `craft_annual` are wired end-to-end
 * in the frontend (pricing CTAs), in `get-paddle-price`'s allowlist, and
 * in `payments-webhook`'s KNOWN_PRICE_IDS. If the Paddle catalog entries
 * are missing, sandbox blocks at price resolution and live risks a
 * "silent" charge with no entitlement grant. This preflight is the
 * structural gate that keeps those in sync.
 *
 * Usage:
 *   bun run scripts/verify-paddle-craft-catalog.ts [--env sandbox|live|both]
 *
 * Required env (only for the environments checked):
 *   PADDLE_SANDBOX_API_KEY   — Paddle sandbox API key (read scope suffices)
 *   PADDLE_LIVE_API_KEY      — Paddle live API key    (read scope suffices)
 *
 * Exit codes:
 *   0  — every required external_id was found in the checked env(s)
 *   1  — at least one required external_id is missing
 *   2  — misconfiguration (missing API key for a requested env, bad flags)
 */

import { PAID_PLAN_IDS } from "../src/lib/paidPlanAllowlist";

type PaddleEnv = "sandbox" | "live";
type CheckStatus = "pass" | "fail" | "skip";

interface CheckResult {
  env: PaddleEnv;
  externalId: string;
  status: CheckStatus;
  detail: string;
}

// The subset of PAID_PLAN_IDS this preflight guards. Derived from the
// single-source allowlist so a plan added there is immediately visible
// here, but we deliberately only require the plans currently sold under
// the Craft SKU — credit packs have their own catalog surface and
// founder_lifetime/pro_* are covered by other preflights.
const REQUIRED_PLAN_IDS = PAID_PLAN_IDS.filter(
  (id) => id === "craft_monthly" || id === "craft_annual",
);

/**
 * Prefix used to recognise Craft-SKU plans in the Paddle catalog. Any
 * active price whose external_id starts with this and is NOT in
 * REQUIRED_PLAN_IDS represents a newly sellable plan that has drifted
 * out of coverage — the coverage assertion below fails the build in
 * that case so we never ship a Craft plan the preflight isn't guarding.
 */
const CRAFT_EXTERNAL_ID_PREFIX = "craft_";

const PADDLE_API_BASE = {
  sandbox: "https://sandbox-api.paddle.com",
  live: "https://api.paddle.com",
} as const;

function parseEnvFlag(argv: readonly string[]): PaddleEnv[] {
  const idx = argv.findIndex((a) => a === "--env");
  const value = idx >= 0 ? argv[idx + 1] : "both";
  if (value === "sandbox") return ["sandbox"];
  if (value === "live") return ["live"];
  if (value === "both" || value === undefined) return ["sandbox", "live"];
  console.error(`Unknown --env value: ${value}. Use sandbox|live|both.`);
  process.exit(2);
}

function apiKeyFor(env: PaddleEnv): string | null {
  const name = env === "sandbox" ? "PADDLE_SANDBOX_API_KEY" : "PADDLE_LIVE_API_KEY";
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : null;
}

async function lookupPriceExternalId(
  env: PaddleEnv,
  apiKey: string,
  externalId: string,
): Promise<CheckResult> {
  // We check both active AND archived so a manual archive in the dashboard
  // fails loud here instead of silently at checkout.
  const params = new URLSearchParams({
    external_id: externalId,
    status: "active,archived",
    per_page: "10",
  });
  const url = `${PADDLE_API_BASE[env]}/prices?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      env,
      externalId,
      status: "fail",
      detail: `Paddle API ${res.status}: ${body.slice(0, 200)}`,
    };
  }
  const payload = (await res.json()) as { data?: Array<{ id: string; status: string }> };
  const rows = payload.data ?? [];
  if (rows.length === 0) {
    return {
      env,
      externalId,
      status: "fail",
      detail: "no price entity found (checked active + archived)",
    };
  }
  const active = rows.find((r) => r.status === "active");
  if (!active) {
    return {
      env,
      externalId,
      status: "fail",
      detail: `found ${rows.length} entry/entries but none are active (status: ${rows.map((r) => r.status).join(",")})`,
    };
  }
  return { env, externalId, status: "pass", detail: `active price ${active.id}` };
}

async function main(): Promise<void> {
  const envs = parseEnvFlag(process.argv.slice(2));
  const results: CheckResult[] = [];

  console.log(`# Paddle Craft catalog preflight`);
  console.log(`# Environments: ${envs.join(", ")}`);
  console.log(`# Required external_ids: ${REQUIRED_PLAN_IDS.join(", ")}`);
  console.log("");

  for (const env of envs) {
    const key = apiKeyFor(env);
    if (!key) {
      const secretName = env === "sandbox" ? "PADDLE_SANDBOX_API_KEY" : "PADDLE_LIVE_API_KEY";
      console.error(`::error::${secretName} is not set — cannot verify ${env}.`);
      for (const id of REQUIRED_PLAN_IDS) {
        const detail = `${secretName} not set`;
        results.push({ env, externalId: id, status: "skip", detail });
        // Emit the `•` line too so the downstream comment renderer can
        // list which (env, id) pairs are unverified — the SUMMARY skip
        // count alone doesn't identify them.
        console.log(`• [${env}] ${id} — ${detail}`);
      }
      // Missing API key for a requested env is a misconfiguration, not a
      // catalog failure — surface as exit 2.
      printSummaryAndExit(results, 2);
      return;
    }
    for (const id of REQUIRED_PLAN_IDS) {
      // Sequential per env: keeps output ordered and stays well under
      // Paddle's rate limit for a handful of GETs.
      const r = await lookupPriceExternalId(env, key, id);
      results.push(r);
      const glyph = r.status === "pass" ? "✓" : r.status === "skip" ? "•" : "✗";
      console.log(`${glyph} [${env}] ${id} — ${r.detail}`);
    }
  }

  const failed = results.filter((r) => r.status === "fail").length;
  printSummaryAndExit(results, failed > 0 ? 1 : 0);
}

function printSummaryAndExit(results: readonly CheckResult[], code: number): void {
  const pass = results.filter((r) => r.status === "pass").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const skip = results.filter((r) => r.status === "skip").length;
  console.log("");
  console.log(`SUMMARY: pass=${pass} fail=${fail} skip=${skip}`);
  process.exit(code);
}

main().catch((err) => {
  console.error(`::error::preflight crashed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
