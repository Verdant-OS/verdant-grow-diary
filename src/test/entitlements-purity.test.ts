/**
 * Purity + no-shadowing guards for the entitlements module.
 *
 * 1. src/lib/entitlements/** must NEVER import React, the supabase client,
 *    fetch, or read time internally. Pure logic only.
 * 2. src/lib/entitlements/** must NEVER import from profiles or reference
 *    the XP `tier` column. profiles.tier is the gamification level
 *    (seedling → harvest_master) and is a different domain from billing plan.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const LIB_DIR = resolve(__dirname, "../lib/entitlements");

function readAll(dir: string): Array<{ path: string; src: string }> {
  const out: Array<{ path: string; src: string }> = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...readAll(full));
    else if (/\.(ts|tsx)$/.test(entry)) {
      out.push({ path: full, src: readFileSync(full, "utf8") });
    }
  }
  return out;
}

const FILES = readAll(LIB_DIR);

describe("entitlements lib purity", () => {
  it("contains at least types/capabilities/planCatalog/resolver", () => {
    const names = FILES.map((f) => f.path).join("\n");
    expect(names).toMatch(/types\.ts/);
    expect(names).toMatch(/capabilities\.ts/);
    expect(names).toMatch(/planCatalog\.ts/);
    expect(names).toMatch(/resolveEntitlements\.ts/);
  });

  for (const banned of [
    /from\s+["']react["']/,
    /from\s+["']@\/integrations\/supabase\/client["']/,
    /from\s+["']@supabase\/supabase-js["']/,
    /\bfetch\s*\(/,
  ]) {
    it(`no entitlements lib file imports/uses ${banned}`, () => {
      for (const f of FILES) {
        expect(f.src, `in ${f.path}`).not.toMatch(banned);
      }
    });
  }

  it("resolveEntitlements.ts does not call Date.now() or new Date() without args (now must be injected)", () => {
    const resolver = FILES.find((f) => f.path.endsWith("resolveEntitlements.ts"))!;
    // `new Date(row.current_period_end)` is allowed — it parses an input field.
    expect(resolver.src).not.toMatch(/Date\.now\s*\(/);
    expect(resolver.src).not.toMatch(/new\s+Date\s*\(\s*\)/);
  });
});

describe("entitlements lib does not shadow profiles.tier (XP)", () => {
  it("no file imports from profiles or pulls the XP tier column", () => {
    for (const f of FILES) {
      expect(f.src, `in ${f.path}`).not.toMatch(/from\s+["'][^"']*profiles[^"']*["']/);
      // The XP gamification tier value list — must not appear in entitlement code.
      expect(f.src, `in ${f.path}`).not.toMatch(
        /\b(seedling|vegetative|flowering|fruiting|harvest_master)\b/,
      );
      // No SELECT/.from('profiles') style call.
      expect(f.src, `in ${f.path}`).not.toMatch(/\.from\(\s*["']profiles["']/);
    }
  });
});
