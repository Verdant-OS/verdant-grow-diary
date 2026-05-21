/**
 * Tests for the production domain (verdantgrowdiary.com) and the public
 * landing page at /welcome.
 *
 * Verifies:
 *   - README references the production domain
 *   - docs/architecture.md references the production domain
 *   - Landing page exists with required public copy
 *   - Landing page is registered as a public route (outside AppShell)
 *   - Landing page does not import or render private dashboard data
 *   - No service_role / external-control / ai-coach call sites introduced
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "..", "..", p), "utf8");
const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

const README = read("README.md");
const ARCH = read("docs/architecture.md");
const APP = readSrc("App.tsx");
const LANDING = readSrc("pages/Landing.tsx");

describe("production domain", () => {
  it("README references verdantgrowdiary.com", () => {
    expect(README).toMatch(/verdantgrowdiary\.com/);
  });

  it("architecture doc references verdantgrowdiary.com", () => {
    expect(ARCH).toMatch(/verdantgrowdiary\.com/);
  });
});

describe("public landing page", () => {
  it("registers /welcome as a public route outside AppShell", () => {
    // route is declared as a sibling to /auth (both outside AppShell wrapper)
    expect(APP).toMatch(/path="\/welcome"\s+element=\{<Landing\s*\/>\}/);
    expect(APP).toMatch(/import\s+Landing\s+from\s+"\.\/pages\/Landing"/);
  });

  it("landing copy explains the product without exposing dashboards", () => {
    expect(LANDING).toMatch(/Verdant Grow Diary/);
    expect(LANDING).toMatch(/Grow OS/);
    expect(LANDING).toMatch(/Grow logs/);
    expect(LANDING).toMatch(/Plant and tent tracking/);
    expect(LANDING).toMatch(/Sensor-aware dashboard/);
    expect(LANDING).toMatch(/Environment alerts/);
    expect(LANDING).toMatch(/AI Coach/);
    expect(LANDING).toMatch(/Approval-required Action Queue/);
    expect(LANDING).toMatch(/No blind automation/);
    expect(LANDING).toMatch(/grower stays in control/i);
    expect(LANDING).toMatch(/cautious/i);
    expect(LANDING).toMatch(/safer insight/i);
  });

  it("landing page does not link to private dashboard routes", () => {
    const privateRoutes = [
      "/grows",
      "/plants",
      "/tents",
      "/sensors",
      "/alerts",
      "/actions",
      "/timeline",
      "/logs",
      "/doctor",
      "/settings",
      "/diagnostics",
      "/cameras",
    ];
    for (const r of privateRoutes) {
      expect(LANDING).not.toMatch(new RegExp(`to=["']${r}["']`));
      expect(LANDING).not.toMatch(new RegExp(`href=["']${r}["']`));
    }
  });

  it("landing page does not import dashboard hooks, supabase client, or private pages", () => {
    expect(LANDING).not.toMatch(/@\/integrations\/supabase\/client/);
    expect(LANDING).not.toMatch(/@\/hooks\//);
    expect(LANDING).not.toMatch(/@\/store\//);
    expect(LANDING).not.toMatch(/from\s+["']\.\/Dashboard/);
  });

  it("landing page introduces no service_role, external-control, or ai-coach call", () => {
    expect(LANDING).not.toMatch(/service_role/);
    expect(LANDING).not.toMatch(/external[-_ ]control/i);
    expect(LANDING).not.toMatch(/device[-_ ]command/i);
    expect(LANDING).not.toMatch(/functions\.invoke\(["']ai-coach/);
  });

  it("landing page contains no live numeric metrics or fake sensor values", () => {
    // No percentages, no °C/°F readings, no humidity/VPD numbers
    expect(LANDING).not.toMatch(/\d+\s*%/);
    expect(LANDING).not.toMatch(/\d+\s*°[CF]/);
  });
});
