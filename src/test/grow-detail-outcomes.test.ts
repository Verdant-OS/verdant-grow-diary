/**
 * GrowDetail — Recent Outcomes rollup (static structural assertions).
 *
 * Verifies the read-only Recent Outcomes card on GrowDetail:
 *  - hook fetches outcomes scoped by grow_id + event_type filter
 *  - safe unavailable + empty + ready states
 *  - count chips + status labels
 *  - links to ActionDetail (action_queue_id) and AlertDetail (source_alert_id)
 *  - copy uses grower-recorded / recorded-after-follow-up language
 *  - no causation/resolution language
 *  - page remains read-only — no writes, no device-control surface
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/GrowDetail.tsx"), "utf8");
const HOOK = readFileSync(resolve(ROOT, "src/hooks/useGrowDetailData.ts"), "utf8");
const ALL = PAGE + "\n" + HOOK;

describe("GrowDetail — Recent Outcomes rollup", () => {
  it("renders a Recent Outcomes section", () => {
    expect(PAGE).toMatch(/aria-label="Recent outcomes"/);
    expect(PAGE).toContain("Recent Outcomes");
  });

  it("hook queries diary_entries scoped by grow_id with action_outcome filter", () => {
    expect(HOOK).toMatch(
      /\.from\(\s*["']diary_entries["']\s*\)[\s\S]{0,400}\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)[\s\S]{0,400}\.eq\(\s*["']details->>event_type["']\s*,\s*["']action_outcome["']\s*\)/,
    );
    expect(HOOK).toMatch(/\.order\(\s*["']entry_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/);
    expect(HOOK).toMatch(/\.limit\(\s*20\s*\)/);
  });

  it("renders empty, loading, and unavailable states", () => {
    expect(PAGE).toContain("No recorded outcomes yet.");
    expect(PAGE).toContain("Recent outcomes unavailable.");
    expect(PAGE).toMatch(/status === "loading"/);
  });

  it("renders count chips for all four statuses", () => {
    expect(PAGE).toMatch(/label="Improved"/);
    expect(PAGE).toMatch(/label="Unchanged"/);
    expect(PAGE).toMatch(/label="Worsened"/);
    expect(PAGE).toMatch(/label="More data needed"/);
  });

  it("links to ActionDetail and AlertDetail via route helpers", () => {
    expect(PAGE).toMatch(/actionDetailPath\(o\.action_queue_id\)/);
    expect(PAGE).toMatch(/alertDetailPath\(o\.source_alert_id\)/);
  });

  it("uses grower-recorded copy", () => {
    expect(PAGE).toContain("Grower-recorded");
    expect(PAGE).toContain("Recorded after follow-up");
  });

  it("does not use causation/resolution copy", () => {
    expect(PAGE).not.toMatch(/\b(fixed|resolved|confirmed by verdant|proven)\b/i);
  });

  it("page remains read-only — no writes or RPC", () => {
    expect(PAGE).not.toMatch(/\.insert\(/);
    expect(PAGE).not.toMatch(/\.update\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/\.rpc\(/);
    expect(HOOK).not.toMatch(/\.insert\(/);
    expect(HOOK).not.toMatch(/\.update\(/);
    expect(HOOK).not.toMatch(/\.delete\(/);
    expect(HOOK).not.toMatch(/\.upsert\(/);
    expect(HOOK).not.toMatch(/\.rpc\(/);
  });

  it("introduces no device-control surface or service_role", () => {
    expect(ALL).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
    expect(ALL).not.toMatch(/service_role/i);
  });

  it("hook degrades safely to unavailable on outcome query failure", () => {
    expect(HOOK).toMatch(/setOutcomes\(\s*\{\s*status:\s*["']unavailable["']/);
  });
});
