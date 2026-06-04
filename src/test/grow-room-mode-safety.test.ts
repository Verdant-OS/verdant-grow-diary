/**
 * Static safety guardrails for Grow-Room Mode.
 *
 * Page must be strictly read-only:
 *  - no .insert / .update / .delete / .upsert / .rpc
 *  - no action_queue or alerts/alert_events writes
 *  - no service_role / device-control / automation strings
 *  - no AI Coach calls
 *  - aggregation logic lives outside JSX
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE = resolve(ROOT, "src/pages/GrowRoomMode.tsx");
const RULES = resolve(ROOT, "src/lib/growRoomModeRules.ts");
const APP = resolve(ROOT, "src/App.tsx");
const SIDEBAR = resolve(ROOT, "src/components/AppSidebar.tsx");

const page = readFileSync(PAGE, "utf8");
const rules = readFileSync(RULES, "utf8");

describe("Grow-Room Mode · file presence", () => {
  it.each([PAGE, RULES, APP, SIDEBAR])("exists: %s", (p) => {
    expect(existsSync(p)).toBe(true);
  });
});

describe("Grow-Room Mode · page is read-only", () => {
  it.each([
    /\.insert\(/,
    /\.update\(/,
    /\.delete\(/,
    /\.upsert\(/,
    /\.rpc\(/,
  ])("page does not call %s", (re) => {
    expect(page).not.toMatch(re);
  });

  it("page does not write to action_queue", () => {
    expect(page).not.toMatch(
      /\.from\(\s*["']action_queue["']\s*\)\s*\.(insert|update|delete|upsert)\(/,
    );
  });

  it("page does not write to alerts or alert_events", () => {
    expect(page).not.toMatch(
      /\.from\(\s*["']alerts["']\s*\)\s*\.(insert|update|delete|upsert)\(/,
    );
    expect(page).not.toMatch(
      /\.from\(\s*["']alert_events["']\s*\)\s*\.(insert|update|delete|upsert)\(/,
    );
  });

  it("page does not call alert persistence writers", () => {
    expect(page).not.toMatch(/\bsaveAlert\b/);
    expect(page).not.toMatch(/\blogAlertEvent\b/);
    expect(page).not.toMatch(/\busePersistEnvironmentAlerts\b/);
  });

  it("page does not call AI Coach / edge functions", () => {
    expect(page).not.toMatch(/ai-coach/i);
    expect(page).not.toMatch(/functions\.invoke/);
  });
});

describe("Grow-Room Mode · no device control / automation / service_role", () => {
  const surfaces = [
    /service_role/i,
    /mqtt/i,
    /home[\s_-]?assistant/i,
    /pi[\s_-]?bridge/i,
    /\brelay\b/i,
    /\bactuator\b/i,
    /webhook/i,
    /device[_-]?command/i,
    /auto[_-]?(approve|reject|cancel|create)/i,
  ];
  it.each(surfaces)("page does not reference %s", (re) => {
    expect(page).not.toMatch(re);
  });
  it.each(surfaces)("rules do not reference %s", (re) => {
    expect(rules).not.toMatch(re);
  });
});

describe("Grow-Room Mode · business logic lives outside JSX", () => {
  it("page imports the pure aggregation helper", () => {
    expect(page).toMatch(/from\s+["']@\/lib\/growRoomModeRules["']/);
    expect(page).toMatch(/buildGrowRoomTentCards/);
  });

  it("page does not duplicate severity ranking tables in JSX", () => {
    // The shared severity → rank mapping must live in the rules module.
    expect(page).not.toMatch(/critical:\s*4[\s\S]{0,80}warning:\s*3/);
  });

  it("page does not inline its own recommendation copy table", () => {
    // Recommendation copy is centralized in RECOMMENDATION_LABEL.
    expect(page).toMatch(/RECOMMENDATION_LABEL/);
  });
});

describe("Grow-Room Mode · route + nav wiring", () => {
  const app = readFileSync(APP, "utf8");
  const sidebar = readFileSync(SIDEBAR, "utf8");

  it("App registers a /grow-room route", () => {
    expect(app).toMatch(/path=["']\/grow-room["']/);
    expect(app).toMatch(/<GrowRoomMode\s*\/?>/);
  });

  it("Sidebar no longer surfaces the Live Dashboard entry (consolidated into Dashboard)", () => {
    expect(sidebar).not.toMatch(/\/grow-room/);
    expect(sidebar).not.toMatch(/Live Dashboard/);
    expect(sidebar).not.toMatch(/"Grow-Room Mode"/);
  });

});

describe("Grow-Room Mode · rules module is I/O-free", () => {
  it("does not import Supabase, React, or hooks", () => {
    expect(rules).not.toMatch(/@\/integrations\/supabase/);
    expect(rules).not.toMatch(/from\s+["']react["']/);
    expect(rules).not.toMatch(/@tanstack\/react-query/);
  });

  it("does not call Date.now() (caller passes now for determinism)", () => {
    expect(rules).not.toMatch(/Date\.now\(\)/);
  });
});
