/**
 * Grow Lineage Repair safety tests.
 *
 * Static assertions only — no live DB calls. These guarantee:
 *   - The page exists and only queries/updates rows owned by auth.uid().
 *   - The tents UPDATE policy enforces that grow_id must belong to auth.uid().
 *   - No service_role bypass and no device-control surface introduced.
 *   - Action Queue tent targeting check (t.grow_id) is preserved.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE_PATH = resolve(ROOT, "src/pages/GrowLineageRepair.tsx");
const APP_PATH = resolve(ROOT, "src/App.tsx");
const SIDEBAR_PATH = resolve(ROOT, "src/components/AppSidebar.tsx");

function allMigrations(): string {
  const dir = resolve(ROOT, "supabase/migrations");
  return readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => readFileSync(join(dir, n), "utf8"))
    .join("\n\n");
}

describe("Grow Lineage Repair — page contract", () => {
  it("page file exists", () => {
    expect(existsSync(PAGE_PATH)).toBe(true);
  });

  const SRC = existsSync(PAGE_PATH) ? readFileSync(PAGE_PATH, "utf8") : "";

  it("tents query is scoped by user_id and null grow_id", () => {
    expect(SRC).toMatch(/from\(\s*["']tents["']\s*\)/);
    expect(SRC).toMatch(/\.eq\(\s*["']user_id["']\s*,\s*user\.id\s*\)/);
    expect(SRC).toMatch(/\.is\(\s*["']grow_id["']\s*,\s*null\s*\)/);
  });

  it("grows query is scoped by user_id", () => {
    expect(SRC).toMatch(
      /from\(\s*["']grows["']\s*\)[\s\S]{0,200}\.eq\(\s*["']user_id["']\s*,\s*user\.id\s*\)/,
    );
  });

  it("update is scoped to the user's own tent (defense in depth)", () => {
    expect(SRC).toMatch(
      /\.update\(\s*\{\s*grow_id[\s\S]{0,80}\}\s*\)[\s\S]{0,200}\.eq\(\s*["']user_id["']\s*,\s*user\.id\s*\)/,
    );
  });

  it("client refuses to save a grow the user does not own", () => {
    expect(SRC).toMatch(/grows\.some\(\s*\(\s*g\s*\)\s*=>\s*g\.id\s*===\s*growId\s*\)/);
  });

  it("displays the Action-Queue targeting warning", () => {
    expect(SRC).toMatch(/Action Queue targeting/i);
  });

  it("shows the all-assigned empty state", () => {
    expect(SRC).toMatch(/All tents are assigned to grows/);
  });

  it("contains no device-control surface", () => {
    expect(SRC).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|service_role/i,
    );
  });

  it("is wired into App routes and sidebar", () => {
    const app = readFileSync(APP_PATH, "utf8");
    const sb = readFileSync(SIDEBAR_PATH, "utf8");
    expect(app).toMatch(/GrowLineageRepair/);
    expect(app).toMatch(/path=["']\/grow-lineage["']/);
    expect(sb).toMatch(/\/grow-lineage/);
  });
});

describe("Grow Lineage Repair — RLS enforcement", () => {
  const MIG = allMigrations();

  it("a migration tightens tents UPDATE WITH CHECK to verify grow ownership", () => {
    expect(MIG).toMatch(
      /CREATE\s+POLICY\s+"Users update own tents"[\s\S]*?FOR\s+UPDATE[\s\S]*?WITH\s+CHECK[\s\S]*?grow_id\s+IS\s+NULL[\s\S]*?EXISTS[\s\S]*?public\.grows[\s\S]*?g\.id\s*=\s*tents\.grow_id[\s\S]*?g\.user_id\s*=\s*auth\.uid\(\)/i,
    );
  });

  it("a migration tightens tents INSERT WITH CHECK to verify grow ownership", () => {
    expect(MIG).toMatch(
      /CREATE\s+POLICY\s+"Users insert own tents"[\s\S]*?FOR\s+INSERT[\s\S]*?WITH\s+CHECK[\s\S]*?grow_id\s+IS\s+NULL[\s\S]*?EXISTS[\s\S]*?public\.grows[\s\S]*?g\.user_id\s*=\s*auth\.uid\(\)/i,
    );
  });

  it("action_queue still enforces tent-grow lineage (t.grow_id)", () => {
    expect(MIG).toMatch(/t\.grow_id\s*=\s*grow_id/i);
  });

  it("no service_role introduced anywhere in migrations for this feature", () => {
    expect(MIG).not.toMatch(/service_role/i);
  });
});
