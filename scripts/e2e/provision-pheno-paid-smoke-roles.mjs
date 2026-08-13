#!/usr/bin/env node
/**
 * Provision disposable Pheno role accounts in local Supabase only.
 *
 * Creates login-capable Free, Pro Monthly, Pro Annual, Craft Monthly, Craft
 * Annual, Founder Lifetime, and canceled users, then writes their credentials plus cleanup ids to one
 * gitignored env file. `--cleanup` deletes the auth users (application rows
 * cascade) and removes the file. Nothing is printed except status labels.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ENV_PATH = path.resolve("e2e/.fixtures/pheno-paid-smoke-roles.env");
const SUPABASE_URL = process.env.E2E_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const HOSTED_MARKERS = ["supabase.co", "supabase.in", "lovable.app", "lovable.dev"];
// Keep pinned to src/constants/agreements.ts. The static fixture contract test
// fails whenever production bumps either agreement without this seed moving too.
const CURRENT_AGREEMENTS = Object.freeze([
  { agreement_type: "terms", version: "2026-07-13", effective_date: "2026-07-13" },
  { agreement_type: "privacy", version: "2026-07-13", effective_date: "2026-07-13" },
]);

function refuseHostedUrl(raw) {
  let host = "";
  try {
    host = new globalThis.URL(raw).hostname.toLowerCase();
  } catch {
    throw new Error("local Supabase URL is malformed");
  }
  if (HOSTED_MARKERS.some((marker) => host.endsWith(marker))) {
    throw new Error("hosted Supabase is refused");
  }
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error("Supabase URL is not loopback");
  }
}

function parseEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(ENV_PATH, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

if (!SUPABASE_URL || !SERVICE) {
  console.error("BLOCKED: local SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}

try {
  refuseHostedUrl(SUPABASE_URL);
} catch (error) {
  console.error(`REFUSED: ${error instanceof Error ? error.message : "unsafe Supabase target"}.`);
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function cleanup() {
  const env = parseEnvFile();
  const ids = (env.E2E_PHENO_EPHEMERAL_USER_IDS || "").split(",").filter(Boolean);
  let failures = 0;
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) failures += 1;
  }
  fs.rmSync(ENV_PATH, { force: true });
  console.log(
    failures
      ? `FAIL: ${failures} disposable user cleanup(s) failed.`
      : "PASS: disposable roles cleaned up.",
  );
  return failures ? 1 : 0;
}

if (process.argv.includes("--cleanup")) {
  process.exit(await cleanup());
}

// Recover from an interrupted earlier run before minting another set.
if (fs.existsSync(ENV_PATH) && (await cleanup()) !== 0) process.exit(1);

const runId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
const password = `Verdant-${crypto.randomBytes(24).toString("base64url")}`;
const roles = [
  { key: "FREE", slug: "free", plan: null },
  { key: "PRO", slug: "pro-monthly", plan: "pro_monthly" },
  { key: "PRO_ANNUAL", slug: "pro-annual", plan: "pro_annual" },
  { key: "CRAFT", slug: "craft-monthly", plan: "craft_monthly" },
  { key: "CRAFT_ANNUAL", slug: "craft-annual", plan: "craft_annual" },
  { key: "FOUNDER", slug: "founder", plan: "founder_lifetime" },
  { key: "CANCELED", slug: "canceled", plan: "pro_monthly", canceled: true },
];
const created = [];

try {
  const now = Date.now();
  for (const role of roles) {
    const email = `pheno-${role.slug}-${runId}@verdant.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`create ${role.slug} user failed`);
    created.push({ ...role, email, userId: data.user.id });

    const { error: acceptanceError } = await admin.from("user_agreement_acceptances").insert(
      CURRENT_AGREEMENTS.map((agreement) => ({
        user_id: data.user.id,
        ...agreement,
        user_agent: "Verdant disposable role E2E fixture",
      })),
    );
    if (acceptanceError) throw new Error(`seed ${role.slug} agreement acceptance failed`);

    if (role.plan) {
      const founder = role.plan === "founder_lifetime";
      const { error: subError } = await admin.from("subscriptions").insert({
        user_id: data.user.id,
        paddle_subscription_id: founder ? `lifetime_${runId}` : `local_${role.slug}_${runId}`,
        paddle_customer_id: `local_customer_${role.slug}_${runId}`,
        product_id: "local_e2e_product",
        price_id: role.plan,
        status: role.canceled ? "canceled" : "active",
        current_period_start: new Date(now - 86_400_000).toISOString(),
        current_period_end: founder
          ? null
          : new Date(now + (role.canceled ? -86_400_000 : 30 * 86_400_000)).toISOString(),
        cancel_at_period_end: Boolean(role.canceled),
        environment: "sandbox",
      });
      if (subError) throw new Error(`seed ${role.slug} entitlement failed`);
    }
  }

  fs.mkdirSync(path.dirname(ENV_PATH), { recursive: true });
  const lines = [
    "# gitignored disposable local credentials; never commit or print values",
    ...created.flatMap((role) => [
      `E2E_PHENO_${role.key}_EMAIL=${role.email}`,
      `E2E_PHENO_${role.key}_PASSWORD=${password}`,
    ]),
    `E2E_PHENO_EPHEMERAL_USER_IDS=${created.map((role) => role.userId).join(",")}`,
    "",
  ];
  fs.writeFileSync(ENV_PATH, lines.join("\n"), { mode: 0o600 });
  console.log(
    "PASS: 7 disposable local roles provisioned (Free/Pro monthly/Pro annual/Craft monthly/Craft annual/Founder/Canceled).",
  );
} catch (error) {
  for (const role of created) await admin.auth.admin.deleteUser(role.userId);
  fs.rmSync(ENV_PATH, { force: true });
  console.error(`FAIL: ${error instanceof Error ? error.message : "role provisioning failed"}.`);
  process.exit(1);
}
