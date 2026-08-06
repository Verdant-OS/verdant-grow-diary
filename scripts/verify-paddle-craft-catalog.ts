#!/usr/bin/env -S bun run
/**
 * CI preflight: verify Craft plan price IDs exist in Paddle for the
 * requested environment(s). Read-only. Fails the build (exit 1) if any
 * required external_id is missing, so we never merge or deploy a change
 * that ships a checkout the catalog can't fulfill.
 *
 * Why this exists: every recurring plan and one-time pack in
 * `PAID_PLAN_IDS` (Pro, Craft, Founder Lifetime, and the AI credit packs)
 * is wired end-to-end in the frontend (pricing CTAs), in
 * `get-paddle-price`'s allowlist, and in `payments-webhook`'s price
 * resolution. If a Paddle catalog entry is missing, sandbox blocks at
 * price resolution and live risks a "silent" charge with no entitlement
 * grant — `payments-webhook` answers Paddle HTTP 200 on
 * `missing_price_external_id` (no retry, no visible error) while writing
 * no `subscriptions` row. This preflight is the structural gate that
 * keeps the live/sandbox catalog in sync with the allowlist so that never
 * happens un-noticed. Originally scoped to Craft only; widened to cover
 * every paid SKU after an audit found Pro — the flagship, highest-volume
 * SKU — had no equivalent net despite an inaccurate comment here claiming
 * "other preflights" covered it. None did.
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

import { writeFileSync } from "node:fs";

import { PAID_PLAN_IDS } from "../src/lib/paidPlanAllowlist";

type PaddleEnv = "sandbox" | "live";
type CheckStatus = "pass" | "fail" | "skip";

/**
 * Machine-readable failure cause. Duplicated (deliberately, minimally)
 * from scripts/render-paddle-craft-preflight-comment.mjs so the JSON
 * report can carry the classification directly and the renderer never
 * has to re-parse the human-readable `detail` string. The renderer's
 * classifier stays in place as the fallback path when only text logs
 * are available (older CI runs, local ad-hoc runs).
 */
type FailureCause =
  | { kind: "api_error"; httpStatus: number }
  | { kind: "inactive" }
  | { kind: "missing" }
  | { kind: "coverage_gap" }
  | { kind: "enumeration_error" };

interface CheckResult {
  env: PaddleEnv;
  externalId: string;
  status: CheckStatus;
  detail: string;
  cause?: FailureCause;
}

// Every paid SKU this preflight verifies against the live/sandbox catalog:
// the full, unfiltered PAID_PLAN_IDS allowlist. There is no other preflight
// that verifies the live/sandbox catalog for Pro; a prior version of this
// comment claimed otherwise and that claim was wrong (see git history for
// the audit that found it).
//
// Deliberately NOT filtered by prefix. An earlier version of this fix
// required only `PAID_PLAN_IDS.filter(isGuardedExternalId)` — ids matching
// GUARDED_EXTERNAL_ID_PREFIXES below — which reintroduced the exact same
// drift class one layer down: a PAID_PLAN_IDS entry added under a prefix
// nobody remembered to add to that second list would be silently
// unverified while this preflight still reported green (flagged in review
// on PR #762). Requiring the whole allowlist directly makes that failure
// mode structurally impossible — there is no second list to fall out of
// sync with PAID_PLAN_IDS.
const REQUIRED_PLAN_IDS: readonly string[] = PAID_PLAN_IDS;

// Fail loudly rather than silently guarding nothing if the allowlist is ever
// emptied. A preflight that checks zero ids reports green forever.
if (REQUIRED_PLAN_IDS.length === 0) {
  console.error(
    "verify-paddle-craft-catalog: PAID_PLAN_IDS is empty — this preflight " +
      "would verify nothing and pass.",
  );
  process.exit(2);
}

// External-id prefixes recognised by the CATALOG-COVERAGE scan below
// (discoverActiveCraftExternalIds) — i.e. the naming convention every
// current paid SKU follows. This is a *separate*, best-effort check in the
// opposite direction from REQUIRED_PLAN_IDS above: it catches a plan
// created directly in the Paddle dashboard that matches our naming
// convention but that no code path has added to PAID_PLAN_IDS yet. It must
// NOT be used to decide what this preflight requires — see REQUIRED_PLAN_IDS
// for why that specific reuse was the bug.
const GUARDED_EXTERNAL_ID_PREFIXES = ["pro_", "craft_", "founder_", "credit_pack_"] as const;

function isGuardedExternalId(id: string): boolean {
  return GUARDED_EXTERNAL_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/**
 * Prefix used to recognise Craft-SKU plans in the Paddle catalog. Any
 * active price whose external_id starts with this and is NOT in
 * REQUIRED_PLAN_IDS represents a newly sellable plan that has drifted
 * out of coverage — the coverage assertion below fails the build in
 * that case so we never ship a Craft plan the preflight isn't guarding.
 */
const GUARDED_LABEL = GUARDED_EXTERNAL_ID_PREFIXES.map((p) => `${p}*`).join(" / ");

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

function parseJsonOutFlag(argv: readonly string[]): string | null {
  const idx = argv.findIndex((a) => a === "--json-out");
  if (idx < 0) return null;
  const value = argv[idx + 1];
  if (!value || value.startsWith("--")) {
    console.error("--json-out requires a file path argument.");
    process.exit(2);
  }
  return value;
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
      cause: { kind: "api_error", httpStatus: res.status },
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
      cause: { kind: "missing" },
    };
  }
  const active = rows.find((r) => r.status === "active");
  if (!active) {
    return {
      env,
      externalId,
      status: "fail",
      detail: `found ${rows.length} entry/entries but none are active (status: ${rows.map((r) => r.status).join(",")})`,
      cause: { kind: "inactive" },
    };
  }
  return { env, externalId, status: "pass", detail: `active price ${active.id}` };
}

async function discoverActiveCraftExternalIds(
  env: PaddleEnv,
  apiKey: string,
): Promise<{ ok: true; ids: string[] } | { ok: false; detail: string }> {
  // Enumerate active prices and filter by the Craft external_id prefix.
  // We page defensively — Paddle caps per_page at 200 and returns a cursor
  // in `meta.pagination.next` when more rows exist.
  const collected: string[] = [];
  let url: string | null = `${PADDLE_API_BASE[env]}/prices?status=active&per_page=200`;
  let guard = 0;
  while (url && guard < 20) {
    guard += 1;
    const res: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, detail: `Paddle API ${res.status}: ${body.slice(0, 200)}` };
    }
    const payload = (await res.json()) as {
      data?: Array<{ external_id?: string | null; status?: string }>;
      meta?: { pagination?: { next?: string | null; has_more?: boolean } };
    };
    for (const row of payload.data ?? []) {
      const ext = row.external_id;
      if (typeof ext === "string" && isGuardedExternalId(ext)) {
        collected.push(ext);
      }
    }
    const next = payload.meta?.pagination?.next ?? null;
    const hasMore = payload.meta?.pagination?.has_more ?? false;
    url = hasMore && next ? next : null;
  }
  // Dedupe — a single external_id can have multiple active price rows across
  // currencies; we only care about the identifier surface.
  return { ok: true, ids: Array.from(new Set(collected)).sort() };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const envs = parseEnvFlag(argv);
  const jsonOut = parseJsonOutFlag(argv);
  const results: CheckResult[] = [];

  console.log(`# Paddle Craft catalog preflight`);
  console.log(`# Environments: ${envs.join(", ")}`);
  console.log(`# Required external_ids: ${REQUIRED_PLAN_IDS.join(", ")}`);
  console.log("");

  const requiredSet = new Set<string>(REQUIRED_PLAN_IDS);

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
      finalize(results, envs, jsonOut, 2);
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

    // Coverage assertion: enumerate active Craft-prefixed external_ids in
    // the catalog and fail loud if any are not in REQUIRED_PLAN_IDS. This
    // catches a newly-created Craft plan (e.g. `craft_quarterly`) that a
    // human added in the Paddle dashboard but that no preflight or code
    // path knows about — the exact drift shape that let Craft ship
    // uncovered the first time.
    const discovery = await discoverActiveCraftExternalIds(env, key);
    if (!discovery.ok) {
      results.push({
        env,
        externalId: `${GUARDED_LABEL} (coverage)`,
        status: "fail",
        detail: `catalog enumeration failed: ${discovery.detail}`,
        cause: { kind: "enumeration_error" },
      });
      console.log(
        `✗ [${env}] ${GUARDED_LABEL} (coverage) — catalog enumeration failed: ${discovery.detail}`,
      );
      continue;
    }
    const uncovered = discovery.ids.filter((id) => !requiredSet.has(id));
    if (uncovered.length === 0) {
      const detail =
        discovery.ids.length === 0
          ? `no active ${GUARDED_LABEL} prices in catalog`
          : `all ${discovery.ids.length} active ${GUARDED_LABEL} price(s) covered`;
      results.push({
        env,
        externalId: `${GUARDED_LABEL} (coverage)`,
        status: "pass",
        detail,
      });
      console.log(`✓ [${env}] ${GUARDED_LABEL} (coverage) — ${detail}`);
    } else {
      for (const id of uncovered) {
        const detail =
          `active in catalog but not in REQUIRED_PLAN_IDS — ` +
          `add to src/lib/paidPlanAllowlist.ts PAID_PLAN_IDS and to REQUIRED_PLAN_IDS ` +
          `in scripts/verify-paddle-craft-catalog.ts`;
        results.push({
          env,
          externalId: id,
          status: "fail",
          detail,
          cause: { kind: "coverage_gap" },
        });
        console.log(`✗ [${env}] ${id} — ${detail}`);
      }
    }
  }

  const failed = results.filter((r) => r.status === "fail").length;
  finalize(results, envs, jsonOut, failed > 0 ? 1 : 0);
}

/**
 * Summary counts, JSON report emission, and exit — kept in one place so
 * every termination path (misconfig, catalog failure, all-green) writes
 * the same structured report shape.
 *
 * The JSON report is the canonical machine-readable output: the CI
 * renderer reads it directly instead of re-parsing the human log, which
 * eliminates a whole class of glyph-encoding / line-drift bugs and
 * removes the temptation to widen the log parser to carry data.
 *
 * Report shape (stable — the renderer's `--report` path pins it):
 *   {
 *     schemaVersion: 1,
 *     envs: PaddleEnv[],
 *     requiredIds: string[],
 *     rows: [{ env, externalId, status, cause? }, ...],  // no `detail`
 *     summary: { pass, fail, skip },
 *     missingByEnv: { sandbox?: [...], live?: [...] },   // non-pass rows
 *     exitCode: number,
 *     keyUnset: boolean,
 *     generatedAt: ISO-8601 string
 *   }
 *
 * `missingByEnv` is a remediation aid: it groups every non-pass row
 * (fail + skip) by env so an operator can see at a glance which ids
 * need attention in which environment without re-scanning `rows`. Rows
 * carry the same `status` + `cause` shape as the top-level `rows` array
 * so downstream tooling can pick a remedy directly.
 *
 * `detail` is intentionally excluded — it can embed up to 200 chars of
 * Paddle response body on the API-error path, which we do NOT want in
 * PR comments. The classified `cause` carries everything the renderer
 * needs to pick a remedy.
 */
function finalize(
  results: readonly CheckResult[],
  envs: readonly PaddleEnv[],
  jsonOut: string | null,
  code: number,
): void {
  const pass = results.filter((r) => r.status === "pass").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const skip = results.filter((r) => r.status === "skip").length;
  console.log("");
  console.log(`SUMMARY: pass=${pass} fail=${fail} skip=${skip}`);

  if (jsonOut) {
    const rows = results.map((r) => {
      const row: {
        env: PaddleEnv;
        externalId: string;
        status: CheckStatus;
        cause?: FailureCause;
      } = { env: r.env, externalId: r.externalId, status: r.status };
      if (r.cause) row.cause = r.cause;
      return row;
    });
    const missingByEnv: Partial<Record<PaddleEnv, typeof rows>> = {};
    for (const env of envs) {
      const forEnv = rows
        .filter((r) => r.env === env && r.status !== "pass")
        .sort((a, b) => a.externalId.localeCompare(b.externalId));
      if (forEnv.length > 0) missingByEnv[env] = forEnv;
    }
    const report = {
      schemaVersion: 1 as const,
      envs: [...envs],
      requiredIds: [...REQUIRED_PLAN_IDS],
      rows,
      summary: { pass, fail, skip },
      missingByEnv,
      exitCode: code,
      keyUnset: results.some((r) => r.status === "skip" && /_API_KEY not set$/.test(r.detail)),
      generatedAt: new Date().toISOString(),
    };
    try {
      writeFileSync(jsonOut, JSON.stringify(report, null, 2) + "\n", "utf8");
    } catch (err) {
      // A write failure must not mask the real verifier verdict — log
      // and continue to exit with the intended code.
      console.error(
        `::warning::failed to write JSON report to ${jsonOut}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  process.exit(code);
}

main().catch((err) => {
  console.error(`::error::preflight crashed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
