/**
 * Tests for grow-scoped Dashboard "Recent Activity" and "Pending Actions" cards.
 *
 * Read-only static-inspection tests in the style of dashboard-grow-scope.test.ts.
 * They assert wiring in Dashboard.tsx and the new useDashboardScopedData hook
 * without booting the React tree.
 *
 * Safety:
 *  - No ai-coach call introduced.
 *  - No device-command surface introduced.
 *  - No service_role surface introduced.
 *  - No new write paths (no .insert/.update/.delete/.upsert).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { actionDetailPath, actionsPath, logsPath } from "@/lib/routes";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const HOOK = readFileSync(
  resolve(ROOT, "src/hooks/useDashboardScopedData.ts"),
  "utf8",
);

const AI_COACH_CALL = /["'`]ai-coach["'`]|functions\/ai-coach|ai_coach/;
const DEVICE_SURFACE =
  /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b/i;
const WRITE_PATH = /\.from\(["'][^"']+["']\)\s*\.(insert|update|delete|upsert)/;

describe("useDashboardScopedData hook — read-only scoped fetches", () => {
  it("fetches latest 5 diary_entries by grow_id, newest-first", () => {
    expect(HOOK).toMatch(/\.from\(\s*["']diary_entries["']\s*\)/);
    expect(HOOK).toMatch(
      /from\(\s*["']diary_entries["']\s*\)[\s\S]*?\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)[\s\S]*?\.order\(\s*["']entry_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)[\s\S]*?\.limit\(\s*5\s*\)/,
    );
  });

  it("fetches latest 5 action_queue_events by grow_id, newest-first", () => {
    expect(HOOK).toMatch(/\.from\(\s*["']action_queue_events["']\s*\)/);
    expect(HOOK).toMatch(
      /from\(\s*["']action_queue_events["']\s*\)[\s\S]*?\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)[\s\S]*?\.order\(\s*["']created_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)[\s\S]*?\.limit\(\s*5\s*\)/,
    );
  });

  it("fetches pending action_queue items by grow_id and status='pending_approval'", () => {
    expect(HOOK).toMatch(
      /from\(\s*["']action_queue["']\s*\)[\s\S]*?\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)[\s\S]*?\.eq\(\s*["']status["']\s*,\s*["']pending_approval["']\s*\)/,
    );
  });

  it("idles when growId is missing (does not query)", () => {
    expect(HOOK).toMatch(/if\s*\(\s*!user\s*\|\|\s*!growId\s*\)/);
  });

  it("degrades to 'unavailable' on query failure (no crash)", () => {
    expect(HOOK).toMatch(/status:\s*["']unavailable["']/);
    expect(HOOK).toMatch(/catch\s*\{/);
  });

  it("introduces no new write paths or privileged/AI/device surface", () => {
    expect(HOOK).not.toMatch(WRITE_PATH);
    expect(HOOK).not.toMatch(/\.rpc\(/);
    expect(HOOK).not.toMatch(/service_role/);
    expect(HOOK).not.toMatch(AI_COACH_CALL);
    expect(HOOK).not.toMatch(DEVICE_SURFACE);
  });
});

describe("Dashboard — scoped Recent Activity & Pending Actions cards", () => {
  it("imports useDashboardScopedData and calls it with the scoped grow id", () => {
    expect(DASHBOARD).toMatch(
      /import\s+\{\s*useDashboardScopedData\s*\}\s+from\s+["']@\/hooks\/useDashboardScopedData["']/,
    );
    expect(DASHBOARD).toMatch(/useDashboardScopedData\(scopedGrowId\s*\?\?\s*null\)/);
  });

  it("only renders the scoped cards when scopedGrowId is truthy", () => {
    expect(DASHBOARD).toMatch(/\{scopedGrowId\s*\?\s*\(/);
  });

  it("renders the Recent Activity card with logsPath link", () => {
    expect(DASHBOARD).toMatch(/aria-label="Recent activity"/);
    expect(DASHBOARD).toMatch(/Recent Activity/);
    expect(DASHBOARD).toMatch(/to=\{logsPath\(scopedGrowId\)\}/);
  });

  it("renders the Pending Actions card with actionsPath link and per-item actionDetailPath links", () => {
    expect(DASHBOARD).toMatch(/aria-label="Pending actions"/);
    expect(DASHBOARD).toMatch(/Pending Actions/);
    expect(DASHBOARD).toMatch(/to=\{actionsPath\(scopedGrowId\)\}/);
    expect(DASHBOARD).toMatch(/to=\{actionDetailPath\(a\.id\)\}/);
  });

  it("surfaces risk_level, suggested_change and reason for each pending action", () => {
    expect(DASHBOARD).toMatch(/a\.risk_level/);
    expect(DASHBOARD).toMatch(/a\.suggested_change/);
    expect(DASHBOARD).toMatch(/a\.reason/);
  });

  it("renders empty-state copy for both cards", () => {
    expect(DASHBOARD).toMatch(/No recent activity yet\./);
    expect(DASHBOARD).toMatch(/No pending actions\./);
  });

  it("renders unavailable-state copy without crashing", () => {
    expect(DASHBOARD).toMatch(/Recent activity unavailable\./);
    expect(DASHBOARD).toMatch(/Pending actions unavailable\./);
  });

  it("shows a gentle prompt when not scoped", () => {
    expect(DASHBOARD).toMatch(/Select a grow to see scoped activity\./);
  });

  it("remains read-only and free of restricted surfaces", () => {
    expect(DASHBOARD).not.toMatch(WRITE_PATH);
    expect(DASHBOARD).not.toMatch(/\.rpc\(/);
    expect(DASHBOARD).not.toMatch(/service_role/);
    expect(DASHBOARD).not.toMatch(AI_COACH_CALL);
    expect(DASHBOARD).not.toMatch(DEVICE_SURFACE);
  });
});

describe("route helpers used by the scoped Dashboard", () => {
  it("logsPath / actionsPath / actionDetailPath shape", () => {
    expect(logsPath("g1")).toBe("/logs?growId=g1");
    expect(actionsPath("g1")).toBe("/actions?growId=g1");
    expect(actionDetailPath("a1")).toBe("/actions/a1");
  });
});
