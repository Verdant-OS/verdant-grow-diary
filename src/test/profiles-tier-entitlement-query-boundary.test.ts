/**
 * profiles.tier entitlement-query boundary scan.
 *
 * Proves billing / entitlement / subscription code paths never read
 * profiles.tier, and that profiles.tier is never used as a proxy for
 * Pro / plan / capability / founder / lifetime status.
 *
 * profiles.tier is the XP/gamification tier (seedling → harvest_master),
 * not a billing signal. Any reference to it in an entitlement code path
 * is a critical entitlement-bypass risk.
 *
 * Complements the runtime write-protection integration test
 * (src/test/integration/profiles-gamification-write-protection.integration.test.ts)
 * which proves clients cannot mutate it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();

const SCAN_TARGETS = [
  "src/hooks/useMyEntitlements.ts",
  "src/lib/entitlements",
  "supabase/functions",
  "supabase/migrations",
];

// Files/dirs allowed to mention profiles.tier for reasons unrelated to
// entitlement decisions.
const TIER_MENTION_ALLOWLIST: RegExp[] = [
  // Generated types & this test itself
  /src\/integrations\/supabase\/types\.ts$/,
  /src\/test\/profiles-tier-entitlement-query-boundary\.test\.ts$/,
  /src\/test\/profiles-gamification-write-protection\.test\.ts$/,
  /src\/test\/integration\/profiles-gamification-write-protection\.integration\.test\.ts$/,
  // Trigger migration itself
  /supabase\/migrations\/.*profiles.*gamification.*\.sql$/i,
  /supabase\/migrations\/.*block_gamification.*\.sql$/i,
];

// Any file within an entitlement/billing path must NOT mention profiles.tier
// AND must NOT query .from("profiles").
const ENTITLEMENT_KEYWORDS = [
  "entitlement",
  "subscription",
  "billing",
  "plan_id",
  "isPro",
  "canUseCapability",
  "founder",
  "lifetime",
  "capability",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mts|js|mjs|sql)$/.test(entry)) out.push(full);
  }
  return out;
}

function collectFiles(): string[] {
  const files: string[] = [];
  for (const t of SCAN_TARGETS) {
    const full = resolve(ROOT, t);
    try {
      const st = statSync(full);
      if (st.isDirectory()) files.push(...walk(full));
      else files.push(full);
    } catch {
      /* target may not exist in some checkouts */
    }
  }
  return files;
}

function isAllowlisted(path: string): boolean {
  const norm = path.replace(/\\/g, "/");
  return TIER_MENTION_ALLOWLIST.some((rx) => rx.test(norm));
}

describe("profiles.tier entitlement-query boundary", () => {
  const files = collectFiles();

  it("no entitlement / billing / supabase-function code references profiles.tier", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (isAllowlisted(f)) continue;
      const src = readFileSync(f, "utf8");
      // Match "profiles.tier" and .select("tier") from profiles-adjacent queries.
      if (/profiles\.tier\b/.test(src)) offenders.push(`${f}: profiles.tier reference`);
      if (/\.from\(["']profiles["']\)[\s\S]{0,200}?\.select\([^)]*\btier\b/.test(src)) {
        offenders.push(`${f}: selects tier from profiles`);
      }
      if (/select\s+[^;]*\btier\b[^;]*\bfrom\s+(public\.)?profiles/i.test(src)) {
        offenders.push(`${f}: SQL selects tier from profiles`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("useMyEntitlements never queries the profiles table", () => {
    const src = readFileSync(
      resolve(ROOT, "src/hooks/useMyEntitlements.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\.from\(["']profiles["']\)/);
    expect(src).not.toMatch(/profiles\.tier/);
  });

  it("no allowlisted profiles.tier reference sits next to entitlement decision keywords", () => {
    // Even where profiles.tier is legitimately mentioned (types, trigger
    // migration, tests), it must not be paired with billing/entitlement
    // decision keywords — that would signal repurposing.
    for (const f of files) {
      if (!isAllowlisted(f)) continue;
      const src = readFileSync(f, "utf8");
      const lines = src.split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!/profiles\.tier|\btier\b/.test(line)) return;
        const window = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
        // Trigger migration & tests will use words like "block", "trigger",
        // "gamification", "test" — those are fine. What we disallow is
        // entitlement decision vocabulary in the same window.
        for (const kw of ENTITLEMENT_KEYWORDS) {
          // Test files intentionally mention entitlement to describe what
          // is being asserted; the runtime files listed as allowlist are
          // generated types + trigger migration, neither of which should
          // ever contain entitlement decision keywords.
          if (/\.test\.tsx?$/.test(f)) return;
          const rx = new RegExp(`\\b${kw}\\b`, "i");
          if (rx.test(window)) {
            throw new Error(
              `${f}:${i + 1} — 'tier' appears near entitlement keyword '${kw}'`,
            );
          }
        }
      });
    }
  });
});
