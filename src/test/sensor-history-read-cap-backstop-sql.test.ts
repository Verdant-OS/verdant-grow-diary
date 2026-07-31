import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const MIGRATION_RELATIVE =
  "supabase/migrations/20260728050000_canonical_subscription_authority_reassert.sql";
const HARNESS_RELATIVE = "scripts/run-sensor-history-read-cap-rls-harness.ts";
const MIGRATION_PATH = resolve(ROOT, MIGRATION_RELATIVE);
const HARNESS_PATH = resolve(ROOT, HARNESS_RELATIVE);

const SQL = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, "utf8") : "";
const HARNESS = existsSync(HARNESS_PATH) ? readFileSync(HARNESS_PATH, "utf8") : "";
const EXECUTABLE_SQL = SQL.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const NORMALIZED_SQL = EXECUTABLE_SQL.replace(/\s+/g, " ").trim().toLowerCase();

function source(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("server-authoritative Free sensor-history read cap", () => {
  it("replaces the existing policy with one canonical restrictive SELECT policy", () => {
    expect(existsSync(MIGRATION_PATH), MIGRATION_RELATIVE).toBe(true);
    expect(NORMALIZED_SQL).toContain(
      'drop policy if exists "free sensor history is limited to 90 days" on public.sensor_readings',
    );
    expect(NORMALIZED_SQL).toMatch(
      /create policy "free sensor history is limited to 90 days" on public\.sensor_readings as restrictive for select to authenticated using \(/,
    );
  });

  it("retains owner isolation and uses the canonical observation-time fallback", () => {
    expect(NORMALIZED_SQL).toContain("(select auth.uid()) = user_id");
    expect(NORMALIZED_SQL).toContain("coalesce(captured_at, ts, created_at)");
    expect(NORMALIZED_SQL).toMatch(
      /coalesce\(captured_at, ts, created_at\)\s*>=\s*now\(\)\s*-\s*interval '90 days'/,
    );
  });

  it("uses subscriptions as the sole live Pro, Craft, and Founder authority", () => {
    const canonicalStart = NORMALIZED_SQL.indexOf("exists ( select 1 from public.subscriptions s");
    const canonicalEnd = NORMALIZED_SQL.indexOf("comment on policy");
    const canonical =
      canonicalStart >= 0
        ? NORMALIZED_SQL.slice(
            canonicalStart,
            canonicalEnd > canonicalStart ? canonicalEnd : undefined,
          )
        : undefined;
    expect(canonical, "canonical subscriptions entitlement branch").toBeDefined();
    expect(canonical).toContain("s.user_id = (select auth.uid())");
    expect(canonical).toContain("s.environment = 'live'");
    expect(canonical).toMatch(
      /s\.price_id in \(\s*'pro_monthly', 'pro_annual', 'craft_monthly', 'craft_annual'\s*\)/,
    );
    expect(canonical).toContain("s.price_id = 'founder_lifetime'");
    expect(EXECUTABLE_SQL).not.toMatch(/from\s+public\.billing_subscriptions/i);
  });

  it("matches paid status, dunning, cancellation-grace, and Founder invariants", () => {
    expect(
      NORMALIZED_SQL.match(/status in \('active', 'trialing'\)/g)?.length,
    ).toBeGreaterThanOrEqual(1);
    expect(NORMALIZED_SQL.match(/status = 'past_due'/g)?.length).toBeGreaterThanOrEqual(1);
    expect(NORMALIZED_SQL.match(/status = 'canceled'/g)?.length).toBeGreaterThanOrEqual(1);
    expect(NORMALIZED_SQL.match(/current_period_end is not null/g)?.length).toBeGreaterThanOrEqual(
      1,
    );
    expect(NORMALIZED_SQL.match(/current_period_end > now\(\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(NORMALIZED_SQL).toContain("left(s.paddle_subscription_id, 9) = 'lifetime_'");
  });

  it("never trusts profile gamification, staff display lifts, client plan input, or pack SKUs", () => {
    expect(EXECUTABLE_SQL).not.toMatch(/profiles\s*\.\s*tier|from\s+public\.profiles/i);
    expect(EXECUTABLE_SQL).not.toMatch(/\bhas_role\b|staff|operator/i);
    expect(EXECUTABLE_SQL).not.toMatch(/current_setting\s*\(\s*'request|request\.headers/i);
    expect(EXECUTABLE_SQL).not.toMatch(/credit_pack|pack_50|pack_150/i);
  });

  it("is read-only and preserves every stored sensor row and write policy", () => {
    expect(NORMALIZED_SQL).not.toMatch(
      /\b(insert into|update|delete from|truncate|alter table)\s+public\.sensor_readings\b/,
    );
    expect(NORMALIZED_SQL).not.toMatch(
      /for\s+(insert|update|delete|all)\b|disable\s+row\s+level\s+security/,
    );
    expect(NORMALIZED_SQL.match(/create policy/g)).toHaveLength(1);
  });
});

describe("sensor-history read-cap runtime harness contract", () => {
  it("covers Free, canonical Pro, compatibility Craft/Founder, degraded billing, and isolation", () => {
    expect(existsSync(HARNESS_PATH), HARNESS_RELATIVE).toBe(true);

    for (const evidence of [
      "Free sees recent sensor history",
      "Free cannot read sensor history older than 90 days",
      "Legacy-only Pro cannot read sensor history older than 90 days",
      "Lovable Pro sees full sensor history",
      "Lovable Craft sees full sensor history",
      "Lovable Founder sees full sensor history",
      "Expired paid row resolves to the Free history window",
      "Cross-user sensor history stays isolated",
      "service_role can still read all stored sensor history",
      "The read cap does not delete or rewrite sensor history",
    ]) {
      expect(HARNESS).toContain(evidence);
    }
  });

  it("uses real signed-in PostgREST clients and server-owned billing fixtures", () => {
    expect(HARNESS).toContain("signInWithPassword");
    expect(HARNESS).toMatch(/\.from\("sensor_readings"\)\s*\.select/);
    expect(HARNESS).toContain('.from("billing_subscriptions").insert');
    expect(HARNESS).toContain('.from("subscriptions").insert');
    expect(HARNESS).not.toMatch(/set\s+(local\s+)?role\s+authenticated/i);
    expect(HARNESS).not.toMatch(/profiles\s*\.\s*tier/i);
  });

  it("refuses production and requires an exact disposable-project opt-in for remote runs", () => {
    expect(HARNESS).toContain("SENSOR_HISTORY_READ_CAP_RLS_HARNESS_ALLOW_REMOTE");
    expect(HARNESS).toContain("SENSOR_HISTORY_READ_CAP_RLS_HARNESS_EXPECTED_PROJECT_REF");
    expect(HARNESS).toContain("knkwiiywfkbqznbxwqfh");
    expect(HARNESS).toMatch(/refusing Verdant production database/);
    expect(HARNESS).toMatch(/hostname === expectedRemoteHost/);
    expect(HARNESS).toMatch(/\^\[a-z0-9\]\{20\}\$/);
  });

  it("tracks each run-unique disposable user immediately for teardown", () => {
    expect(HARNESS).toContain("const RUN_ID = crypto.randomUUID()");
    expect(HARNESS).toContain("${RUN_ID}@verdant.test");
    expect(HARNESS).toMatch(
      /const userId = await createUser\(EMAILS\[key\]\);\s*createdUserIds\.push\(userId\);\s*userIds\[key\] = userId;/,
    );
    expect(HARNESS).toContain("const ids = createdUserIds");
  });

  it("compares PostgREST timestamps by instant instead of wire-format spelling", () => {
    expect(HARNESS).toMatch(/function isSameInstant\(actual: unknown, expected: string\): boolean/);
    expect(HARNESS).toContain("Date.parse(actual)");
    expect(HARNESS).toContain("Date.parse(expected)");
    expect(HARNESS).not.toMatch(/row\.captured_at\s*===\s*(?:RECENT_AT|OLD_AT)/);
  });
});

describe("sensor-history server read-boundary audit", () => {
  const AI_COACH = source("supabase/functions/ai-coach/index.ts");
  const MCP = source("supabase/functions/mcp/index.ts");
  const SENSOR_WEBHOOK = source("supabase/functions/sensor-ingest-webhook/index.ts");
  const ECOWITT_INGEST = source("supabase/functions/ecowitt-ingest/index.ts");
  const RLS_SELFTEST = source("supabase/functions/rls-selftest/index.ts");
  const EXPORT_READERS = [
    source("src/hooks/useDiaryRangeReportData.ts"),
    source("src/hooks/usePostGrowLearningReportData.ts"),
    source("src/hooks/useImportedSensorHistory.ts"),
    source("src/hooks/use-sensor-readings.ts"),
  ].join("\n");

  it("AI Coach reads sensor evidence with the caller JWT, never its service client", () => {
    expect(AI_COACH).toMatch(
      /const supabase = createClient\([\s\S]*?SUPABASE_ANON_KEY[\s\S]*?Authorization: auth/,
    );
    expect(AI_COACH).toMatch(/supabase[\s\S]*?\.from\("sensor_readings"\)[\s\S]*?\.select\(/);
    expect(AI_COACH).not.toMatch(/creditSupabase[\s\S]{0,160}\.from\("sensor_readings"\)/);
  });

  it("MCP sensor reads carry the signed-in grower's token", () => {
    expect(MCP).toMatch(
      /function supabaseForUser[\s\S]*?Authorization: `Bearer \$\{ctx\.getToken\(\)\}`/,
    );
    // Whitespace-tolerant: the generated bundle line-wraps the query chain.
    expect(MCP).toMatch(/client\s*\.from\("sensor_readings"\)\s*\.select/);
    expect(MCP).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("service-role ingest functions write readings but expose no history SELECT", () => {
    for (const edgeSource of [SENSOR_WEBHOOK, ECOWITT_INGEST]) {
      const executable = edgeSource.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(executable).toMatch(/\.from\("sensor_readings"\)\s*\.(insert|upsert)\(/);
      expect(executable).not.toMatch(/\.from\("sensor_readings"\)\s*\.select\(/);
    }
  });

  it("the privileged RLS self-test uses admin only for cleanup, not a user history response", () => {
    expect(RLS_SELFTEST).toContain('admin.from("sensor_readings").delete()');
    expect(RLS_SELFTEST).not.toMatch(
      /admin[\s\S]{0,80}\.from\("sensor_readings"\)[\s\S]{0,100}\.select\(/,
    );
  });

  it("report/export history readers remain browser-RLS scoped", () => {
    expect(EXPORT_READERS).toMatch(/\.from\(["']sensor_readings["']\)/);
    expect(EXPORT_READERS).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|service_role/);
  });
});
