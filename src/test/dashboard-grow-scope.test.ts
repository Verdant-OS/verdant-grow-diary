/**
 * Tests for grow-scoped Dashboard support.
 *
 * Read-only contract tests: assert wiring in Dashboard.tsx and GrowDetail.tsx
 * plus route helper, without booting the full Dashboard page (which depends on
 * Supabase + React Query + many mock hooks).
 *
 * Safety:
 *   - No ai-coach call introduced (invocation forms only).
 *   - No device-command surface introduced.
 *   - No service_role surface introduced.
 *   - No new write paths (no .insert/.update/.delete/.upsert added).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dashboardPath } from "@/lib/routes";
import { buildSwitcherTarget } from "@/components/GrowBreadcrumbs";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const GROW_DETAIL = readFileSync(resolve(ROOT, "src/pages/GrowDetail.tsx"), "utf8");

const AI_COACH_CALL = /["'`]ai-coach["'`]|functions\/ai-coach|ai_coach/;
const DEVICE_SURFACE =
  /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b/i;

describe("dashboardPath helper", () => {
  it("returns /dashboard without growId", () => {
    expect(dashboardPath()).toBe("/dashboard");
    expect(dashboardPath(null)).toBe("/dashboard");
  });
  it("appends ?growId= when provided", () => {
    expect(dashboardPath("g1")).toBe("/dashboard?growId=g1");
  });
  it("is wired into GrowBreadcrumbs switcher for section=dashboard", () => {
    expect(buildSwitcherTarget("dashboard", "g2")).toBe("/dashboard?growId=g2");
  });
});

describe("Dashboard — grow-scoped wiring", () => {
  it("imports the shared useScopedGrow hook", () => {
    expect(DASHBOARD).toMatch(/import\s+\{\s*useScopedGrow\s*\}\s+from\s+["']@\/hooks\/useScopedGrow["']/);
    expect(DASHBOARD).toMatch(/useScopedGrow\(\)/);
  });

  it("renders the shared ScopedGrowBanner with label='dashboard' and dashboardPath() clearHref", () => {
    expect(DASHBOARD).toMatch(/import\s+ScopedGrowBanner/);
    expect(DASHBOARD).toMatch(
      /<ScopedGrowBanner[\s\S]*?label=\s*["']dashboard["'][\s\S]*?clearHref=\{dashboardPath\(\)\}/,
    );
    expect(DASHBOARD).toMatch(/backHref=\{backHref\}/);
  });

  it("renders GrowBreadcrumbs with section='dashboard'", () => {
    expect(DASHBOARD).toMatch(/import\s+GrowBreadcrumbs/);
    expect(DASHBOARD).toMatch(
      /<GrowBreadcrumbs[\s\S]*?current=\s*["']Dashboard["'][\s\S]*?section=\s*["']dashboard["']/,
    );
  });

  it("uses grow-aware plants/tents hooks scoped to the resolved growId", () => {
    expect(DASHBOARD).toMatch(/useGrowTents\(scopedGrowId\)/);
    expect(DASHBOARD).toMatch(/useGrowPlants\(undefined,\s*scopedGrowId\)/);
  });

  it("guards scopedGrowId on isValidScopedGrow so invalid ids fall back to all data", () => {
    expect(DASHBOARD).toMatch(
      /scopedGrowId\s*=\s*isValidScopedGrow\s*\?\s*urlGrowId[^:]*:\s*undefined/,
    );
  });

  it("only renders the banner when urlGrowId is present", () => {
    expect(DASHBOARD).toMatch(/\{urlGrowId\s*&&\s*\(\s*\n?\s*<ScopedGrowBanner/);
  });

  it("introduces no new write paths or privileged surface", () => {
    expect(DASHBOARD).not.toMatch(
      /\.from\(["'][^"']+["']\)\s*\.(insert|update|delete|upsert)/,
    );
    expect(DASHBOARD).not.toMatch(/service_role/);
    expect(DASHBOARD).not.toMatch(AI_COACH_CALL);
    expect(DASHBOARD).not.toMatch(DEVICE_SURFACE);
  });
});

describe("GrowDetail — Dashboard hub card", () => {
  it("imports dashboardPath and links a hub card to /dashboard?growId=<id>", () => {
    expect(GROW_DETAIL).toMatch(/dashboardPath/);
    expect(GROW_DETAIL).toMatch(
      /<HubLink[\s\S]*?to=\{dashboardPath\(growId\)\}[\s\S]*?title="Dashboard"/,
    );
  });

  it("remains safe (no ai-coach call, no device surface, no service_role)", () => {
    expect(GROW_DETAIL).not.toMatch(AI_COACH_CALL);
    expect(GROW_DETAIL).not.toMatch(DEVICE_SURFACE);
    expect(GROW_DETAIL).not.toMatch(/service_role/);
  });
});
