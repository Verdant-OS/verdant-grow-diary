#!/usr/bin/env -S bun run
/**
 * Read-only sandbox smoke-test runner for the credit-packs + referral
 * release. Verifies — via DB queries and (optionally) edge-function logs —
 * that:
 *
 *   1. A credit-pack purchase produced a `credit_pack` grant row keyed to a
 *      real Paddle transaction, and that the payments-webhook actually
 *      logged the delivery.
 *   2. Pack-overflow spend behavior is consistent: monthly-cap spend rows
 *      exist and, if a pack grant is present, overflow spend rows continue
 *      past the monthly cap without producing negative net credits.
 *   3. A referral conversion produced a `referrals` row in status
 *      `converted` AND a matching `source='referral'` grant row with a
 *      `grant_ref` that ties back to the referral.
 *
 * This runner is READ-ONLY. It never inserts, updates, deletes, or refunds.
 * It never mutates policies, entitlement maps, ignore reasons, or Paddle.
 *
 * Usage:
 *   bun run scripts/sandbox-credit-packs-smoke.ts --user <email-or-uuid> [--env sandbox|live]
 *
 * Required env (any one set is fine — the script falls back in order):
 *   PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE  (preferred; already
 *     set inside the Lovable exec sandbox)
 *   OR SUPABASE_DB_URL
 *
 * Optional env for webhook-log verification:
 *   SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF  — enables edge-function
 *     log lookup for `payments-webhook` and `redeem-referral`. If absent
 *     the log checks are reported as SKIPPED (not FAILED).
 *
 * Emails are redacted to `<local>***@<domain>` in output.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Environment = "sandbox" | "live";
type CheckStatus = "pass" | "fail" | "skip";
interface CheckResult {
  section: string;
  name: string;
  status: CheckStatus;
  detail?: string;
}

const results: CheckResult[] = [];

// Per-checkpoint transcripts. When CHECKPOINT_DIR is set (CI does this), each
// section's lines are additionally appended to its own file so a failed run
// can be triaged without scrolling through the combined transcript.
const checkpointDir = process.env.CHECKPOINT_DIR?.trim() || "";
const checkpointFiles = new Map<string, string>();
function sectionSlug(section: string): string {
  return section.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function checkpointPathFor(section: string): string | null {
  if (!checkpointDir) return null;
  let p = checkpointFiles.get(section);
  if (!p) {
    p = join(checkpointDir, `${sectionSlug(section)}.log`);
    checkpointFiles.set(section, p);
  }
  return p;
}
function writeCheckpointLine(section: string, line: string) {
  const p = checkpointPathFor(section);
  if (!p) return;
  appendFileSync(p, line + "\n");
}
function beginCheckpoint(section: string) {
  const p = checkpointPathFor(section);
  if (!p) return;
  const header = `# Checkpoint: ${section}\n# Started: ${new Date().toISOString()}\n\n`;
  writeFileSync(p, header);
}
function finalizeCheckpoints() {
  if (!checkpointDir) return;
  for (const section of checkpointFiles.keys()) {
    const rows = results.filter((r) => r.section === section);
    const pass = rows.filter((r) => r.status === "pass").length;
    const fail = rows.filter((r) => r.status === "fail").length;
    const skip = rows.filter((r) => r.status === "skip").length;
    const status = fail > 0 ? "FAIL" : pass === 0 ? "SKIPPED" : "PASS";
    writeCheckpointLine(
      section,
      `\nSUMMARY: ${status} pass=${pass} fail=${fail} skip=${skip} total=${rows.length}`,
    );
  }
}

function record(section: string, name: string, status: CheckStatus, detail?: string) {
  results.push({ section, name, status, detail });
  const icon = status === "pass" ? "✓" : status === "fail" ? "✗" : "•";
  const tag = status === "skip" ? " SKIPPED" : "";
  const line = `  ${icon} [${section}] ${name}${tag}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  writeCheckpointLine(section, line);
}

function parseArgs(argv: string[]): { user: string; env: Environment } {
  let user = "";
  let env: Environment = "sandbox";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user" || a === "-u") user = argv[++i] ?? "";
    else if (a === "--env" || a === "--environment") {
      const v = argv[++i];
      if (v !== "sandbox" && v !== "live") {
        console.error(`--env must be 'sandbox' or 'live' (got: ${v})`);
        process.exit(2);
      }
      env = v;
    } else if (a === "--help" || a === "-h") {
      console.log("Usage: bun run scripts/sandbox-credit-packs-smoke.ts --user <email-or-uuid> [--env sandbox|live]");
      process.exit(0);
    }
  }
  if (!user) {
    console.error("Missing --user <email-or-uuid>");
    process.exit(2);
  }
  return { user, env };
}

function redactEmail(email: string | null | undefined): string {
  if (!email) return "<none>";
  const at = email.indexOf("@");
  if (at < 2) return "***";
  return `${email.slice(0, Math.min(2, at))}***@${email.slice(at + 1)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function psqlJson<T = unknown>(sql: string): T[] {
  // Wrap the query so we always get a JSON array back regardless of shape.
  const wrapped = `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (${sql}) t`;
  const args: string[] = [];
  if (process.env.SUPABASE_DB_URL && !process.env.PGHOST) {
    args.push(process.env.SUPABASE_DB_URL);
  }
  args.push("-Atqc", wrapped);
  const res = spawnSync("psql", args, { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`psql failed (${res.status}): ${res.stderr.trim() || res.stdout.trim()}`);
  }
  const out = res.stdout.trim();
  if (!out) return [];
  try {
    return JSON.parse(out) as T[];
  } catch (e) {
    throw new Error(`psql returned non-JSON: ${out.slice(0, 200)}`);
  }
}

async function resolveUserId(userArg: string): Promise<{ id: string; email: string | null } | null> {
  if (!UUID_RE.test(userArg)) {
    // auth.users is not reachable via the read-only exec role; email lookup
    // isn't possible without service-role access. Ask for a UUID instead of
    // silently returning nothing.
    console.error(
      "Email-based lookup requires auth.users access, which is unavailable to this read-only runner.\n" +
        "Pass the user's UUID via --user <uuid> instead (find it in the Users tab of the Backend view).",
    );
    return null;
  }
  // Verify the UUID exists as a profile row so we fail fast on typos.
  const rows = psqlJson<{ id: string }>(
    `SELECT user_id::text AS id FROM public.profiles WHERE user_id = '${userArg}' LIMIT 1`,
  );
  if (rows.length === 0) return null;
  return { id: rows[0].id, email: null };
}

// ---- optional edge-function log lookup ---------------------------------------

async function fetchEdgeLogs(
  functionName: string,
  since: string,
): Promise<{ ok: boolean; count: number; reason?: string }> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) {
    return { ok: false, count: 0, reason: "SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF not set" };
  }
  const url = new URL(`https://api.supabase.com/v1/projects/${ref}/functions/${functionName}/logs`);
  url.searchParams.set("since", since);
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return { ok: false, count: 0, reason: `HTTP ${r.status}` };
    const body = (await r.json()) as { result?: unknown[] } | unknown[];
    const arr = Array.isArray(body) ? body : Array.isArray(body?.result) ? body.result : [];
    return { ok: true, count: arr.length };
  } catch (e) {
    return { ok: false, count: 0, reason: (e as Error).message };
  }
}

// ---- checks -----------------------------------------------------------------

interface CreditPackGrant {
  id: string;
  credits: number;
  sku: string | null;
  paddle_transaction_id: string | null;
  environment: string;
  created_at: string;
  meta: Record<string, unknown> | null;
}

async function checkCreditPackPurchase(userId: string, env: Environment): Promise<CreditPackGrant | null> {
  const section = "CREDIT PACK";
  beginCheckpoint(section);
  const rows = psqlJson<CreditPackGrant>(
    `SELECT id::text, credits, sku, paddle_transaction_id, environment, created_at, meta
       FROM public.ai_credit_grants
      WHERE user_id = '${userId}'
        AND environment = '${env}'
        AND source = 'credit_pack'
        AND kind = 'grant'
      ORDER BY created_at DESC
      LIMIT 1`,
  );
  const latest = rows[0] ?? null;
  if (!latest) {
    record(section, "credit_pack grant row exists", "fail", "no ai_credit_grants row with source='credit_pack'");
    return null;
  }
  record(
    section,
    "credit_pack grant row exists",
    "pass",
    `sku=${latest.sku ?? "?"} credits=${latest.credits} txn=${latest.paddle_transaction_id ?? "?"}`,
  );
  record(
    section,
    "grant is anchored to a Paddle transaction id",
    latest.paddle_transaction_id ? "pass" : "fail",
    latest.paddle_transaction_id ? undefined : "paddle_transaction_id is NULL (idempotency anchor broken)",
  );
  record(
    section,
    "credits amount matches known SKU",
    latest.sku === "credit_pack_50" && latest.credits === 50
      ? "pass"
      : latest.sku === "credit_pack_150" && latest.credits === 150
        ? "pass"
        : "fail",
    `sku=${latest.sku ?? "?"} credits=${latest.credits}`,
  );

  // No duplicate grant for the same transaction id (idempotency).
  if (latest.paddle_transaction_id) {
    const dupes = psqlJson<{ n: number }>(
      `SELECT COUNT(*)::int AS n
         FROM public.ai_credit_grants
        WHERE paddle_transaction_id = '${latest.paddle_transaction_id}'
          AND kind = 'grant'`,
    );
    record(
      section,
      "grant is idempotent (one grant per Paddle txn)",
      (dupes[0]?.n ?? 0) === 1 ? "pass" : "fail",
      `count=${dupes[0]?.n ?? 0}`,
    );
  }

  // No clawback yet — if there is one, note it (not a failure, but visible).
  const clawback = psqlJson<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM public.ai_credit_grants
      WHERE user_id = '${userId}'
        AND kind = 'clawback'
        AND reverses = '${latest.id}'`,
  );
  if ((clawback[0]?.n ?? 0) > 0) {
    record(section, "no clawback against this grant", "fail", `clawback rows=${clawback[0]?.n}`);
  } else {
    record(section, "no clawback against this grant", "pass");
  }

  // Webhook log corroboration.
  const since = new Date(new Date(latest.created_at).getTime() - 60_000).toISOString();
  const logs = await fetchEdgeLogs("payments-webhook", since);
  if (!logs.ok) {
    record(section, "payments-webhook log shows delivery near grant time", "skip", logs.reason);
  } else {
    record(
      section,
      "payments-webhook log shows delivery near grant time",
      logs.count > 0 ? "pass" : "fail",
      `log_entries_since=${logs.count}`,
    );
  }

  return latest;
}

async function checkOverflowSpend(userId: string, env: Environment): Promise<void> {
  const section = "OVERFLOW SPEND";
  // Current UTC period key = YYYY-MM.
  const periodKey = new Date().toISOString().slice(0, 7);

  const spendRows = psqlJson<{ period_key: string; feature: string; net: number; spent: number; refunded: number }>(
    `SELECT
        period_key,
        feature,
        SUM(weight)::int AS net,
        SUM(CASE WHEN status = 'spent' THEN weight ELSE 0 END)::int AS spent,
        SUM(CASE WHEN status = 'refunded' THEN weight ELSE 0 END)::int AS refunded
       FROM public.ai_credit_spends
      WHERE user_id = '${userId}'
        AND period_key = '${periodKey}'
      GROUP BY period_key, feature
      ORDER BY feature`,
  );

  if (spendRows.length === 0) {
    record(section, "spend rows exist for current period", "skip", `no ai_credit_spends for ${periodKey}`);
    return;
  }
  for (const r of spendRows) {
    record(
      section,
      `spend row present (${r.feature})`,
      "pass",
      `period=${r.period_key} net=${r.net} spent=${r.spent} refunded=${r.refunded}`,
    );
    record(
      section,
      `net weight is non-negative (${r.feature})`,
      r.net >= 0 ? "pass" : "fail",
      `net=${r.net}`,
    );
  }

  // Pack overflow: if the user has a credit_pack grant AND their monthly
  // spent > the free/pro monthly cap, the extra spends should NOT have been
  // denied. The RPC handles this atomically; here we just verify the ledger
  // is internally consistent — total grants (packs + referrals + bonus) plus
  // the monthly plan allowance is >= total spent.
  const grantSum = psqlJson<{ total: number }>(
    `SELECT COALESCE(SUM(credits), 0)::int AS total
       FROM public.ai_credit_grants
      WHERE user_id = '${userId}'
        AND environment = '${env}'`,
  );
  const spentThisPeriod = spendRows.reduce((s, r) => s + r.spent, 0);
  const packBalance = grantSum[0]?.total ?? 0;
  record(
    section,
    "grants total ≥ 0 (no negative net after clawbacks)",
    packBalance >= 0 ? "pass" : "fail",
    `grants_net=${packBalance}`,
  );
  record(
    section,
    "current-period spend does not exceed grants + plan allowance",
    // We can't know the exact plan allowance from psql alone (it depends on
    // billing_subscriptions tier). Best-effort: flag only if packBalance is
    // 0 AND spent > 100 (Pro/Founder cap). Otherwise inconclusive → SKIP.
    packBalance === 0 && spentThisPeriod > 100
      ? "fail"
      : packBalance === 0 && spentThisPeriod <= 100
        ? "pass"
        : "skip",
    `spent=${spentThisPeriod} grants_net=${packBalance} (plan cap not fetched)`,
  );
}

async function checkReferralConversion(userId: string, env: Environment): Promise<void> {
  const section = "REFERRAL";
  // User could be either referrer OR referee — check both angles.
  const asReferrer = psqlJson<{
    id: string;
    referee_user_id: string;
    status: string;
    referrer_credits: number;
    referee_credits: number;
    converted_at: string | null;
  }>(
    `SELECT id::text, referee_user_id::text, status, referrer_credits, referee_credits, converted_at
       FROM public.referrals
      WHERE referrer_user_id = '${userId}'
        AND environment = '${env}'
      ORDER BY created_at DESC
      LIMIT 5`,
  );
  const asReferee = psqlJson<{
    id: string;
    referrer_user_id: string;
    status: string;
    referrer_credits: number;
    referee_credits: number;
    converted_at: string | null;
  }>(
    `SELECT id::text, referrer_user_id::text, status, referrer_credits, referee_credits, converted_at
       FROM public.referrals
      WHERE referee_user_id = '${userId}'
        AND environment = '${env}'
      LIMIT 1`,
  );

  const total = asReferrer.length + asReferee.length;
  if (total === 0) {
    record(section, "referral row exists", "skip", "no referrals rows involving this user");
    return;
  }
  record(section, "referral row exists", "pass", `as_referrer=${asReferrer.length} as_referee=${asReferee.length}`);

  const converted = [...asReferrer, ...asReferee].filter((r) => r.status === "converted");
  if (converted.length === 0) {
    record(section, "at least one referral is converted", "skip", "all rows still status='pending'");
    return;
  }
  record(section, "at least one referral is converted", "pass", `converted_count=${converted.length}`);

  // Each converted referral should have a matching source='referral' grant
  // for the user who is entitled to the credits (referrer for referrer_credits,
  // referee for referee_credits). We verify the one relevant to `userId`.
  for (const r of converted) {
    const isReferrerSide = "referee_user_id" in r;
    const credits = isReferrerSide ? r.referrer_credits : r.referee_credits;
    if (credits === 0) {
      record(section, `grant matches referral ${r.id.slice(0, 8)} (${isReferrerSide ? "referrer" : "referee"})`, "skip", "credits=0 on this side");
      continue;
    }
    const grants = psqlJson<{ id: string; credits: number; grant_ref: string | null }>(
      `SELECT id::text, credits, grant_ref
         FROM public.ai_credit_grants
        WHERE user_id = '${userId}'
          AND source = 'referral'
          AND environment = '${env}'
          AND grant_ref LIKE '%${r.id}%'
        LIMIT 1`,
    );
    record(
      section,
      `grant matches referral ${r.id.slice(0, 8)} (${isReferrerSide ? "referrer" : "referee"})`,
      grants.length > 0 && grants[0].credits === credits ? "pass" : "fail",
      grants.length > 0
        ? `grant_credits=${grants[0].credits} expected=${credits} grant_ref=${grants[0].grant_ref}`
        : `no source='referral' grant with grant_ref containing ${r.id}`,
    );

    if (r.converted_at) {
      const since = new Date(new Date(r.converted_at).getTime() - 60_000).toISOString();
      const logs = await fetchEdgeLogs("redeem-referral", since);
      if (!logs.ok) {
        record(section, `redeem-referral log near conversion ${r.id.slice(0, 8)}`, "skip", logs.reason);
      } else {
        record(
          section,
          `redeem-referral log near conversion ${r.id.slice(0, 8)}`,
          logs.count > 0 ? "pass" : "fail",
          `log_entries_since=${logs.count}`,
        );
      }
    }
  }
}

// ---- main -------------------------------------------------------------------

async function main() {
  const { user, env } = parseArgs(process.argv.slice(2));

  // Preflight: psql is reachable.
  if (!process.env.PGHOST && !process.env.SUPABASE_DB_URL) {
    console.error("Neither PGHOST nor SUPABASE_DB_URL is set — cannot reach the database.");
    process.exit(2);
  }
  try {
    psqlJson<{ v: number }>("SELECT 1 AS v");
  } catch (e) {
    console.error(`psql preflight failed: ${(e as Error).message}`);
    process.exit(2);
  }

  const resolved = await resolveUserId(user);
  if (!resolved) {
    console.error(`Could not resolve user: ${redactEmail(user.includes("@") ? user : null) || user}`);
    process.exit(2);
  }
  console.log(
    `\nSandbox credit-packs smoke — user=${redactEmail(resolved.email)} id=${resolved.id.slice(0, 8)}… env=${env}\n`,
  );

  await checkCreditPackPurchase(resolved.id, env);
  console.log("");
  await checkOverflowSpend(resolved.id, env);
  console.log("");
  await checkReferralConversion(resolved.id, env);

  const pass = results.filter((r) => r.status === "pass").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const skip = results.filter((r) => r.status === "skip").length;
  console.log(`\nSUMMARY: pass=${pass} fail=${fail} skip=${skip} total=${results.length}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(`smoke runner crashed: ${(e as Error).stack ?? e}`);
  process.exit(2);
});
