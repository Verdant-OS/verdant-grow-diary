/**
 * Profiles gamification write-protection — static safety scan.
 *
 * Mitigates the active "profiles.tier client-writable" security finding by
 * proving these invariants at code/migration level (no live DB required):
 *
 *   1. A BEFORE UPDATE trigger `profiles_block_gamification_updates` exists
 *      and raises when a client attempts to change `tier`, `level`, or
 *      `nugs_total` on public.profiles.
 *   2. Because the trigger runs BEFORE UPDATE and RAISEs, no partial row
 *      update is committed for the blocked fields.
 *   3. Billing entitlement resolution never reads profiles.tier.
 *   4. No client code uses profiles.tier as a Pro / paid entitlement source.
 *   5. Legitimate profile edits (display_name, current_badge) remain
 *      writable — the trigger only blocks the three gamification fields.
 *
 * profiles.tier is the XP/gamification level column (seedling → harvest_master)
 * and is intentionally distinct from billing plan. Runtime enforcement lives
 * in the trigger; billing entitlements are sourced from
 * `billing_subscriptions` + `subscriptions` (see useMyEntitlements).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const SRC_DIR = resolve(__dirname, "..");

function readAllMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // Skip generated Supabase types and this test's own file when scanning.
      if (full.includes("integrations/supabase")) continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("profiles gamification write-protection (regression for profiles.tier finding)", () => {
  const migrations = readAllMigrations();

  it("declares a BEFORE UPDATE trigger that blocks tier/level/nugs_total changes", () => {
    expect(migrations).toMatch(
      /CREATE OR REPLACE FUNCTION\s+public\.profiles_block_gamification_updates/i,
    );
    // Must be a BEFORE UPDATE trigger so blocked updates never commit
    // (requirement 5: no partial profile update for blocked fields).
    expect(migrations).toMatch(
      /CREATE TRIGGER\s+profiles_block_gamification_updates\s+BEFORE UPDATE ON public\.profiles/i,
    );
  });

  it("trigger body checks each of the three gamification fields and RAISEs", () => {
    // All three field-guards must be present in the trigger source.
    expect(migrations).toMatch(/NEW\.nugs_total\s+IS DISTINCT FROM\s+OLD\.nugs_total/i);
    expect(migrations).toMatch(/NEW\.level\s+IS DISTINCT FROM\s+OLD\.level/i);
    expect(migrations).toMatch(/NEW\.tier\s+IS DISTINCT FROM\s+OLD\.tier/i);
    // Blocked updates must raise (rejected → no commit, sanitized DB error).
    expect(migrations).toMatch(
      /RAISE EXCEPTION\s+'gamification fields[^']*are not directly writable'/i,
    );
  });

  it("trigger error message does not leak provider/customer/service_role identifiers", () => {
    // Sanitized DB error — no billing/provider IDs in the raise message.
    const triggerBlock = migrations.match(
      /CREATE OR REPLACE FUNCTION\s+public\.profiles_block_gamification_updates[\s\S]*?\$\$;/i,
    );
    expect(triggerBlock, "trigger definition must be present").toBeTruthy();
    const body = triggerBlock![0];
    for (const forbidden of [
      "paddle_subscription_id",
      "paddle_customer_id",
      "provider_subscription_id",
      "provider_customer_id",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]) {
      expect(body, `trigger must not mention ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  it("billing entitlement hook does not read profiles.tier", () => {
    const hook = readFileSync(
      join(SRC_DIR, "hooks", "useMyEntitlements.ts"),
      "utf8",
    );
    expect(hook).not.toMatch(/\.from\(\s*["']profiles["']/);
    expect(hook).not.toMatch(/profiles\.tier/);
  });

  it("no client code uses profiles.tier (or the XP tier column) as a paid/Pro entitlement source", () => {
    const files = walk(SRC_DIR).filter(
      (p) =>
        !p.endsWith("profiles-gamification-write-protection.test.ts") &&
        // entitlements-purity.test.ts already asserts the same and mentions
        // the XP tier names as literals in its assertion strings.
        !p.endsWith("entitlements-purity.test.ts"),
    );
    // Any `.from("profiles").select(... tier ...)` fused with an entitlement
    // decision would resurrect the finding. Diagnostics is an admin/staff
    // read-only view and is allowed to select the raw column for display.
    for (const path of files) {
      const src = readFileSync(path, "utf8");
      const usesProfilesTier =
        /profiles\.tier/.test(src) ||
        /\.from\(\s*["']profiles["']\s*\)[\s\S]{0,120}\btier\b/.test(src);
      if (!usesProfilesTier) continue;
      // Admin diagnostics page renders the raw XP tier for staff — not an
      // entitlement decision — and is explicitly allowlisted here.
      const isDiagnostics = path.endsWith(join("pages", "Diagnostics.tsx"));
      expect(
        isDiagnostics,
        `${path} references profiles.tier outside the diagnostics allowlist — ` +
          "profiles.tier must never gate paid features",
      ).toBe(true);
      // Even in Diagnostics, the value must not drive an entitlement branch.
      const src2 = readFileSync(path, "utf8");
      expect(src2).not.toMatch(/isPro|hasPro|entitlement|canUseCapability/i);
    }
  });

  it("trigger allows legitimate profile edits (display_name, current_badge) to pass through", () => {
    // The trigger only raises when one of the three gamification fields
    // changes; any other UPDATE returns NEW unmodified.
    const triggerBody = migrations.match(
      /CREATE OR REPLACE FUNCTION\s+public\.profiles_block_gamification_updates[\s\S]*?\$\$;/i,
    )![0];
    // Guarded fields are exactly the three gamification columns — nothing else.
    const guardedFields = triggerBody.match(/NEW\.(\w+)\s+IS DISTINCT FROM\s+OLD\.\1/gi) ?? [];
    const names = guardedFields
      .map((s) => s.match(/NEW\.(\w+)/i)?.[1])
      .filter(Boolean)
      .sort();
    expect(names).toEqual(["level", "nugs_total", "tier"].sort());
    // The trigger returns NEW on the non-blocked path (allowing the update).
    expect(triggerBody).toMatch(/RETURN NEW\s*;\s*END\s*;\s*\$\$/i);
  });
});
