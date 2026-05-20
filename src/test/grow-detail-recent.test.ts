/**
 * GrowDetail recent-activity section — read-only combined feed.
 *
 * Asserts:
 *  - Fetches latest 5 diary_entries by grow_id, sorted entry_at desc.
 *  - Fetches latest 5 action_queue_events by grow_id, sorted created_at desc.
 *  - Resolves parent action_queue rows via .in('id', actionIds) for context.
 *  - Merges newest-first via a Date-based sort comparator.
 *  - Empty state, loading state, and unavailable state all exist.
 *  - Link to full Timeline exists.
 *  - Page remains read-only.
 *  - No device-control surface introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/GrowDetail.tsx"), "utf8") + "\n" + readFileSync(resolve(ROOT, "src/hooks/useGrowDetailData.ts"), "utf8") + "\n" + readFileSync(resolve(ROOT, "src/lib/growStatus.ts"), "utf8");

describe("GrowDetail — recent activity", () => {
  it("fetches latest 5 diary_entries by grow_id, entry_at desc", () => {
    expect(PAGE).toMatch(
      /\.from\(\s*["']diary_entries["']\s*\)[\s\S]{0,300}\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)[\s\S]{0,200}\.order\(\s*["']entry_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)[\s\S]{0,80}\.limit\(\s*5\s*\)/,
    );
  });

  it("fetches latest 5 action_queue_events by grow_id, created_at desc", () => {
    expect(PAGE).toMatch(
      /\.from\(\s*["']action_queue_events["']\s*\)[\s\S]{0,400}\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)[\s\S]{0,200}\.order\(\s*["']created_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)[\s\S]{0,80}\.limit\(\s*5\s*\)/,
    );
  });

  it("resolves parent action_queue rows for context via .in()", () => {
    expect(PAGE).toMatch(
      /\.from\(\s*["']action_queue["']\s*\)[\s\S]{0,200}\.select\(\s*["']id,suggested_change,reason["']\s*\)[\s\S]{0,80}\.in\(\s*["']id["']\s*,\s*actionIds\s*\)/,
    );
  });

  it("merges items newest-first via timestamp sort", () => {
    expect(PAGE).toMatch(/new Date\(b\.ts\)\.getTime\(\)\s*-\s*new Date\(a\.ts\)\.getTime\(\)/);
  });

  it("renders Recent Activity section with view-full-Timeline link", () => {
    expect(PAGE).toMatch(/aria-label="Recent activity"/);
    expect(PAGE).toMatch(/Recent Activity/);
    expect(PAGE).toMatch(/View full Timeline/);
    expect(PAGE).toMatch(/to="\/logs"/);
  });

  it("shows empty state when no activity", () => {
    expect(PAGE).toContain("No recent activity yet.");
  });

  it("shows safe unavailable state on query failure", () => {
    expect(PAGE).toContain("Recent activity unavailable.");
    expect(PAGE).toMatch(/setRecent\(\{\s*status:\s*["']unavailable["']\s*\}\)/);
    expect(PAGE).toMatch(/catch\s*\{\s*setRecent\(\{\s*status:\s*["']unavailable["']\s*\}\)/);
  });

  it("labels items as Diary Entry or Action Queue Event", () => {
    expect(PAGE).toContain("Diary Entry");
    expect(PAGE).toContain("Action Queue Event");
  });

  it("page remains read-only — no writes", () => {
    expect(PAGE).not.toMatch(/\.insert\(/);
    expect(PAGE).not.toMatch(/\.update\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/\.rpc\(/);
  });

  it("introduces no device-control surface or service_role", () => {
    expect(PAGE).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
    expect(PAGE).not.toMatch(/service_role/i);
  });
});
