/**
 * Admin Boundary contract tests for the Leads module.
 *
 * Leads is an internal admin/operator module — it must not leak into
 * grower-facing navigation, and its docs must clearly state the boundary
 * against grower/plant/sensor/diary/customer/public-companion data.
 *
 * These tests are file-content contracts (no runtime mounting required).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Leads admin boundary — routing", () => {
  const APP = read("src/App.tsx");

  it("registers /admin/leads as the primary Leads route", () => {
    expect(APP).toMatch(/path="\/admin\/leads"\s+element=\{<Leads\s*\/>\}/);
  });

  it("keeps /leads as a back-compat alias only", () => {
    expect(APP).toMatch(/path="\/leads"\s+element=\{<Leads\s*\/>\}/);
  });

  it("documents the admin/operator scoping next to the route", () => {
    expect(APP).toMatch(/admin\/operator|back-compat alias|internal admin/i);
  });
});

describe("Leads admin boundary — navigation", () => {
  it("AppSidebar does not expose Leads", () => {
    const SIDEBAR = read("src/components/AppSidebar.tsx");
    expect(SIDEBAR).not.toMatch(/\/leads/);
    expect(SIDEBAR).not.toMatch(/\bLeads\b/);
  });

  it("MobileNav does not expose Leads", () => {
    const NAV = read("src/components/MobileNav.tsx");
    expect(NAV).not.toMatch(/\/leads/);
    expect(NAV).not.toMatch(/\bLeads\b/);
  });
});

describe("Leads admin boundary — documentation", () => {
  const DOC = read("docs/leads-command-center.md");

  it("states Leads is an internal admin/operator module", () => {
    expect(DOC).toMatch(/internal admin\s*\/\s*operator module/i);
  });

  it("states Leads is separate from the main Grow OS", () => {
    expect(DOC).toMatch(/separate from the main\s+Verdant Grow OS/i);
  });

  it("forbids mixing Leads with grower-facing data domains", () => {
    for (const term of [
      "plants",
      "grow diaries",
      "sensors",
      "AI Grow Doctor",
      "customer mode",
      "public grow companion",
    ]) {
      expect(DOC.toLowerCase()).toContain(term.toLowerCase());
    }
  });

  it("declares the BD / partner / outreach purpose", () => {
    expect(DOC).toMatch(/business development/i);
    expect(DOC).toMatch(/partner tracking/i);
    expect(DOC).toMatch(/outreach pipeline/i);
  });

  it("names /admin/leads as the primary route and /leads as the alias", () => {
    expect(DOC).toMatch(/\/admin\/leads/);
    expect(DOC).toMatch(/\/leads/);
    expect(DOC).toMatch(/back-compat alias/i);
  });
});
