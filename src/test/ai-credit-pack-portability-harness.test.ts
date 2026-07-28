import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const HARNESS_PATH = resolve(ROOT, "scripts/run-ai-credit-pack-portability-harness.ts");
const HARNESS = readFileSync(HARNESS_PATH, "utf8");
const CONFIRM_ENV = "AI_CREDIT_PACK_PORTABILITY_HARNESS";
const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";

function runHarness(env: NodeJS.ProcessEnv) {
  return spawnSync("bun", ["run", HARNESS_PATH], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe("AI-credit pack portability runtime harness contract", () => {
  it("is opt-in, loopback-first, and refuses Verdant production before client creation", () => {
    expect(HARNESS).toContain(`const CONFIRM_ENV = "${CONFIRM_ENV}"`);
    expect(HARNESS).toContain(
      'const REMOTE_CONFIRM_ENV = "AI_CREDIT_PACK_PORTABILITY_HARNESS_ALLOW_REMOTE"',
    );
    expect(HARNESS).toContain('"AI_CREDIT_PACK_PORTABILITY_HARNESS_EXPECTED_PROJECT_REF"');
    expect(HARNESS).toContain(`const PRODUCTION_PROJECT_REF = "${PRODUCTION_PROJECT_REF}"`);
    expect(HARNESS).toContain("refusing Verdant production database");
    expect(HARNESS.indexOf("refusing Verdant production database")).toBeLessThan(
      HARNESS.indexOf("const admin = createClient"),
    );
    expect(HARNESS).toContain('hostname === "localhost"');
    expect(HARNESS).toContain('hostname === "127.0.0.1"');
    expect(HARNESS).toContain('hostname === "[::1]"');
    expect(HARNESS).toContain('hostname === "::1"');
    expect(HARNESS).toContain("expectedRemoteRef !== PRODUCTION_PROJECT_REF");
    expect(HARNESS).toContain("hostname === `${expectedRemoteRef}.supabase.co`");
  });

  it("exercises every portability, isolation, idempotency, race, refund, and ACL scenario", () => {
    for (const evidence of [
      "authenticated client cannot choose another user, environment, or model tier",
      "authenticated client cannot supply weight or plan authority parameters",
      "Free spend 4 uses the settled pack after the 3-per-grow allowance",
      "paid spend 100 remains allowance-funded",
      "paid spend 101 uses the settled pack",
      "sandbox-only grant cannot fund a live spend",
      "sandbox grant funds a sandbox spend after allowance exhaustion",
      "same pack key preserves its immutable receipt and inserts one row",
      "one-credit concurrent unique keys yield one pack spend and one denial",
      "append-only refund restores one environment-bound pack credit",
    ]) {
      expect(HARNESS).toContain(evidence);
    }
    for (const role of ["authenticated", "anon", "service_role"]) {
      expect(HARNESS).toContain(`["${role}",`);
    }
    expect(HARNESS).toContain("${role} cannot execute the legacy AI-credit spend overload");
    expect(HARNESS).toContain("${role} cannot execute the legacy AI-credit refund overload");
    expect(HARNESS).toContain('admin.rpc("grant_lovable_credit_pack"');
    expect(HARNESS).toContain('admin.rpc("ai_credit_spend"');
    expect(HARNESS).toContain('admin.rpc("ai_credit_refund"');
    expect(HARNESS).toContain('client.rpc("ai_credit_spend"');
    expect(HARNESS).toContain('client.rpc("ai_credit_refund"');
    expect(HARNESS).toContain("sameReceiptSnapshot(firstReplayReceipt, secondReplayReceipt)");
    expect(HARNESS).toContain("await Promise.all(");
  });

  it("uses run-unique fixtures and cleans all created users in finally", () => {
    expect(HARNESS).toContain("crypto.randomUUID()");
    expect(HARNESS).toContain("@verdant.test");
    expect(HARNESS).toContain("createdUsers.push(id)");
    expect(HARNESS).toMatch(/finally \{[\s\S]*cleanupUser\(userId, cleanupFailures\)/);
    expect(HARNESS).toContain("all disposable users and rows were removed");
    expect(HARNESS).not.toContain("listUsers");
    expect(HARNESS).not.toContain("deleteUser(userId).catch");
  });

  it("defaults to a no-op without database configuration", () => {
    const env = { ...process.env };
    delete env[CONFIRM_ENV];
    delete env.SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    delete env.SUPABASE_ANON_KEY;
    delete env.SUPABASE_PUBLISHABLE_KEY;
    delete env.VITE_SUPABASE_ANON_KEY;

    const result = runHarness(env);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("SKIP");
    expect(result.stderr).toBe("");
  });

  it("hard-refuses the production ref even with explicit remote acknowledgement", () => {
    const result = runHarness({
      ...process.env,
      [CONFIRM_ENV]: "1",
      AI_CREDIT_PACK_PORTABILITY_HARNESS_ALLOW_REMOTE: "1",
      AI_CREDIT_PACK_PORTABILITY_HARNESS_EXPECTED_PROJECT_REF: PRODUCTION_PROJECT_REF,
      SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: "disposable-test-placeholder",
      SUPABASE_ANON_KEY: "disposable-test-placeholder",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("refusing Verdant production database");
    expect(result.stdout).toBe("");
  });
});
