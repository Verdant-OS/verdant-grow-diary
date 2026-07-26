import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const MIGRATION_RELATIVE = "supabase/migrations/20260725234500_free_creation_cap_backstop.sql";
const HARNESS_RELATIVE = "scripts/run-free-creation-caps-rls-harness.ts";
const MIGRATION_PATH = resolve(ROOT, MIGRATION_RELATIVE);
const HARNESS_PATH = resolve(ROOT, HARNESS_RELATIVE);

const SQL = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, "utf8") : "";
const HARNESS = existsSync(HARNESS_PATH) ? readFileSync(HARNESS_PATH, "utf8") : "";
const NORMALIZED_SQL = SQL.replace(/\s+/g, " ").toLowerCase();
const EXECUTABLE_SQL = SQL.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("server-authoritative Free grow/tent creation caps", () => {
  it("ships as one new additive migration", () => {
    expect(existsSync(MIGRATION_PATH), MIGRATION_RELATIVE).toBe(true);
    expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.enforce_free_creation_caps()");
  });

  it("uses one locked trigger function for active inserts and archive-to-active transitions", () => {
    expect(NORMALIZED_SQL).toContain("returns trigger");
    expect(NORMALIZED_SQL).toContain("security definer");
    expect(NORMALIZED_SQL).toContain("set search_path to 'public', 'pg_temp'");
    expect(NORMALIZED_SQL).toMatch(/new\.is_archived\s+is\s+distinct\s+from\s+false/);
    expect(NORMALIZED_SQL).toMatch(/tg_op\s*=\s*'update'/);
    expect(NORMALIZED_SQL).toMatch(/old\.is_archived\s+is\s+not\s+true/);
    expect(NORMALIZED_SQL).toMatch(/old\.user_id\s+is\s+not\s+distinct\s+from\s+new\.user_id/);
    expect(NORMALIZED_SQL).toContain("pg_advisory_xact_lock");
    expect(NORMALIZED_SQL).toContain("verdant:free-creation-cap:");
  });

  it("binds client cap authority to auth.uid before inspecting the target owner's billing", () => {
    expect(NORMALIZED_SQL).toMatch(/v_authenticated_owner\s*:=\s*auth\.uid\(\)/);
    expect(NORMALIZED_SQL).toMatch(/new\.user_id\s+is\s+distinct\s+from\s+v_authenticated_owner/);
    expect(NORMALIZED_SQL).toContain("message = 'free_creation_cap_owner_mismatch'");
    expect(NORMALIZED_SQL).toContain("errcode = 'insufficient_privilege'");

    const ownerMismatchIndex = NORMALIZED_SQL.indexOf(
      "new.user_id is distinct from v_authenticated_owner",
    );
    const archivedRowShortcutIndex = NORMALIZED_SQL.indexOf(
      "new.is_archived is distinct from false",
    );
    const firstBillingLookupIndex = NORMALIZED_SQL.indexOf("from public.billing_subscriptions");
    expect(ownerMismatchIndex).toBeGreaterThanOrEqual(0);
    expect(archivedRowShortcutIndex).toBeGreaterThan(ownerMismatchIndex);
    expect(firstBillingLookupIndex).toBeGreaterThan(ownerMismatchIndex);
  });

  it("uses only the trusted owner for billing lookup, locking, and active-row counts", () => {
    expect(NORMALIZED_SQL).toMatch(
      /hashtextextended\('verdant:free-creation-cap:'\s*\|\|\s*v_owner_id::text,\s*0\)/,
    );
    expect(NORMALIZED_SQL).toContain("bs.user_id = v_owner_id");
    expect(NORMALIZED_SQL).toContain("s.user_id = v_owner_id");
    expect(NORMALIZED_SQL).toMatch(
      /from public\.grows[\s\S]*user_id = v_owner_id[\s\S]*is_archived = false/,
    );
    expect(NORMALIZED_SQL).toMatch(
      /from public\.tents[\s\S]*user_id = v_owner_id[\s\S]*is_archived = false/,
    );
    expect(EXECUTABLE_SQL).not.toMatch(
      /(?:bs|s)\.user_id\s*=\s*new\.user_id|user_id\s*=\s*new\.user_id[\s\S]*is_archived\s*=\s*false/i,
    );
  });

  it("fails closed without a client identity and narrowly preserves cap-checked DB-owner maintenance", () => {
    expect(NORMALIZED_SQL).toContain("message = 'free_creation_cap_authenticated_owner_required'");
    expect(NORMALIZED_SQL).toMatch(
      /session_user\s+is\s+not\s+distinct\s+from\s+'postgres'[\s\S]*v_owner_id\s*:=\s*new\.user_id/,
    );
    expect(NORMALIZED_SQL).not.toMatch(
      /session_user\s+(?:in|=|is not distinct from)\s*\([^)]*(?:anon|authenticated|authenticator)/,
    );
  });

  it("derives paid authority from both server-owned billing lanes, never the profile XP column", () => {
    expect(NORMALIZED_SQL).toContain("from public.billing_subscriptions");
    expect(NORMALIZED_SQL).toContain("from public.subscriptions");
    expect(NORMALIZED_SQL).toContain("s.environment = 'live'");
    expect(EXECUTABLE_SQL).not.toMatch(/profiles\s*\.\s*tier|from\s+public\.profiles/i);
  });

  it("recognizes every paid creation-cap plan and no pack SKU", () => {
    for (const plan of [
      "pro_monthly",
      "pro_annual",
      "craft_monthly",
      "craft_annual",
      "founder_lifetime",
    ]) {
      expect(NORMALIZED_SQL).toContain(`'${plan}'`);
    }
    expect(NORMALIZED_SQL).not.toMatch(/ai_credit_pack|credit_pack|pack_100|pack_500/);
  });

  it("matches the canonical recurring, dunning, cancellation-grace, and Founder shapes", () => {
    expect(NORMALIZED_SQL).toContain("status in ('active', 'trialing')");
    expect(NORMALIZED_SQL).toContain("status = 'past_due'");
    expect(NORMALIZED_SQL).toContain("status = 'canceled'");
    expect(NORMALIZED_SQL).toMatch(/current_period_end\s+>\s+now\(\)/);
    expect(NORMALIZED_SQL).toContain("left(s.paddle_subscription_id, 9) = 'lifetime_'");
    expect(NORMALIZED_SQL).toMatch(/current_period_end\s+is\s+null/);
  });

  it("counts only non-archived rows and emits stable cap errors", () => {
    expect(NORMALIZED_SQL).toMatch(
      /from public\.grows[\s\S]*user_id = v_owner_id[\s\S]*is_archived = false/,
    );
    expect(NORMALIZED_SQL).toMatch(
      /from public\.tents[\s\S]*user_id = v_owner_id[\s\S]*is_archived = false/,
    );
    expect(SQL).toContain("free_active_grow_limit_reached");
    expect(SQL).toContain("free_active_tent_limit_reached");
    expect(NORMALIZED_SQL).toContain("errcode = 'check_violation'");
  });

  it("mounts the backstop on both direct PostgREST write surfaces", () => {
    expect(NORMALIZED_SQL).toMatch(
      /create trigger enforce_free_creation_cap_grows[\s\S]*before insert or update of is_archived, user_id on public\.grows/,
    );
    expect(NORMALIZED_SQL).toMatch(
      /create trigger enforce_free_creation_cap_tents[\s\S]*before insert or update of is_archived, user_id on public\.tents/,
    );
    expect(
      NORMALIZED_SQL.match(/execute function public\.enforce_free_creation_caps\(\)/g),
    ).toHaveLength(2);
  });

  it("allows only trusted service-role fixture writes to bypass the cap", () => {
    expect(NORMALIZED_SQL).toMatch(
      /current_setting\('role', true\)\s+is\s+not\s+distinct\s+from\s+'service_role'/,
    );
    expect(EXECUTABLE_SQL).not.toMatch(/has_role[\s\S]*('staff'|'operator')/i);
    expect(EXECUTABLE_SQL).not.toMatch(/profiles\s*\.\s*(tier|role)/i);
  });

  it("preserves existing over-limit rows and existing RLS/policy posture", () => {
    expect(NORMALIZED_SQL).not.toMatch(/\b(update|delete from|truncate)\s+public\.(grows|tents)\b/);
    expect(NORMALIZED_SQL).not.toMatch(/create\s+unique\s+index/);
    expect(NORMALIZED_SQL).not.toMatch(
      /\b(create|alter|drop)\s+policy\b|disable\s+row\s+level\s+security/,
    );
  });

  it("keeps the trigger function out of the client RPC surface", () => {
    expect(NORMALIZED_SQL).toContain(
      "revoke all on function public.enforce_free_creation_caps() from public",
    );
    expect(NORMALIZED_SQL).toContain(
      "revoke all on function public.enforce_free_creation_caps() from anon",
    );
    expect(NORMALIZED_SQL).toContain(
      "revoke all on function public.enforce_free_creation_caps() from authenticated",
    );
  });
});

describe("Free creation-cap runtime harness contract", () => {
  it("covers direct authenticated writes, transitions, paid plans, concurrency, and service fixtures", () => {
    expect(existsSync(HARNESS_PATH), HARNESS_RELATIVE).toBe(true);

    for (const evidence of [
      "Free concurrent grow attempts leave exactly one active grow",
      "Free second active grow is denied",
      "Free grow archive-to-active transition is denied",
      "Free bulk grow insert cannot create two active rows",
      "Free second active tent is denied",
      "Free tent archive-to-active transition is denied",
      "Free bulk tent insert cannot create two active rows",
      "BYO Pro can create multiple active grows and tents",
      "Lovable Founder can create multiple active grows and tents",
      "Lovable Craft can create multiple active grows and tents",
      "cross-user grow spoof is denied identically for paid and Free targets",
      "cross-user tent spoof cannot select another account's paid bypass",
      "cross-user owner transfer is denied before RLS WITH CHECK",
      "cross-user owner spoof creates no rows for either target",
      "service_role can seed over-limit Free fixtures",
    ]) {
      expect(HARNESS).toContain(evidence);
    }
  });

  it("uses real authenticated PostgREST clients for every Free/paid assertion", () => {
    expect(HARNESS).toContain("signInWithPassword");
    expect(HARNESS).toMatch(/\.from\("grows"\)\s*\.insert/);
    expect(HARNESS).toMatch(/\.from\("tents"\)\s*\.insert/);
    expect(HARNESS).toContain("Promise.all");
    expect(HARNESS).not.toMatch(/set\s+(local\s+)?role\s+authenticated/i);
  });

  it("refuses production and requires an exact disposable-project opt-in for remote runs", () => {
    expect(HARNESS).toContain("FREE_CREATION_CAP_RLS_HARNESS_ALLOW_REMOTE");
    expect(HARNESS).toContain("FREE_CREATION_CAP_RLS_HARNESS_EXPECTED_PROJECT_REF");
    expect(HARNESS).toContain("knkwiiywfkbqznbxwqfh");
    expect(HARNESS).toMatch(/refusing Verdant production database/);
    expect(HARNESS).toMatch(/hostname === expectedRemoteHost/);
    expect(HARNESS).toMatch(/\^\[a-z0-9\]\{20\}\$/);
  });

  it("uses run-unique identities and tracks each created user before continuing", () => {
    expect(HARNESS).toMatch(/const RUN_ID = crypto\.randomUUID\(\)\.slice\(0, 8\)/);
    expect(HARNESS).toContain("${RUN_ID}@verdant.test");
    expect(HARNESS).not.toContain("listUsers");
    expect(HARNESS).not.toContain("delete prior");
    expect(HARNESS).toMatch(
      /const userId = await adminCreateUser\(EMAILS\[key\]\);\s*createdUserIds\.push\(userId\);\s*userIds\[key\] = userId;/,
    );
  });
});
