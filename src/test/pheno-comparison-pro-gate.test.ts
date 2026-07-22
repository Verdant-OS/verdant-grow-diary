/**
 * Real Pheno Comparison — Pro entitlement gate + wiring guardrails.
 *
 * Build 2: the real-data Pheno Comparison is a Pro capability. These assertions
 * pin the entitlement split, the client gate, and the route/entry wiring so a
 * refactor can't silently un-gate the feature or orphan the page.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { PLAN_CATALOG } from "@/lib/entitlements/planCatalog";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const PAGE = read("src/pages/GrowPhenoComparison.tsx");
const HOOK = read("src/hooks/useGrowPhenoComparison.ts");
const APP = read("src/App.tsx");
const MANIFEST = read("src/lib/appRouteManifest.ts");
const GROW_DETAIL = read("src/pages/GrowDetail.tsx");

describe("entitlement split — phenoComparison capability", () => {
  it("is OFF for free", () => {
    expect(FREE_CAPABILITIES.phenoComparison).toBe(false);
  });

  it("is ON for pro_monthly, pro_annual, and founder_lifetime", () => {
    expect(PLAN_CATALOG.pro_monthly.phenoComparison).toBe(true);
    expect(PLAN_CATALOG.pro_annual.phenoComparison).toBe(true);
    expect(PLAN_CATALOG.founder_lifetime.phenoComparison).toBe(true);
  });
});

describe("GrowPhenoComparison — client gate + upsell", () => {
  it("gates on the phenoComparison capability", () => {
    expect(PAGE).toMatch(/entitlement\.capabilities\.phenoComparison\s*===\s*true/);
  });

  it("shows a PaywallCta upsell when locked and does not load data", () => {
    expect(PAGE).toMatch(/grow-pheno-comparison-locked/);
    expect(PAGE).toMatch(/<PaywallCta/);
    // Data load is gated behind the capability (undefined growId when locked).
    expect(PAGE).toMatch(/useGrowPhenoComparison\(\s*canCompare\s*\?\s*growId\s*:\s*undefined/);
  });

  it("renders the shared PhenoComparison presenter with the REAL input", () => {
    expect(PAGE).toMatch(/<PhenoComparison\s+input=\{data\.input\}/);
  });

  it("handles no-hunt and too-few-candidate states", () => {
    expect(PAGE).toMatch(/grow-pheno-comparison-no-hunt/);
    expect(PAGE).toMatch(/grow-pheno-comparison-too-few/);
    expect(PAGE).toMatch(/candidateCount\s*<\s*2/);
  });

  it("links out to the read-only sample so free users can preview the format", () => {
    expect(PAGE).toMatch(/\/pheno-comparison/);
  });
});

describe("loader — read-only, RLS-scoped, real (non-demo) input", () => {
  it("reads pheno_hunts + plants + grow_events and never writes", () => {
    expect(HOOK).toMatch(/\.from\(\s*["']pheno_hunts["']\s*\)/);
    expect(HOOK).toMatch(/\.from\(\s*["']plants["']\s*\)/);
    expect(HOOK).toMatch(/\.from\(\s*["']grow_events["']\s*\)/);
    expect(HOOK).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
  });

  it("builds a real (isDemo:false) input via the pure mapper", () => {
    expect(HOOK).toMatch(/buildRealPhenoComparisonInput/);
  });
});

describe("route + entry wiring (no drift)", () => {
  it("route is mounted in App.tsx and declared in the manifest as auth", () => {
    expect(APP).toMatch(/path="\/grows\/:growId\/pheno-compare"/);
    expect(APP).toMatch(/<GrowPhenoComparison\s*\/>/);
    expect(MANIFEST).toMatch(
      /path:\s*"\/grows\/:growId\/pheno-compare"[\s\S]{0,80}access:\s*"auth"/,
    );
  });

  it("GrowDetail exposes a Compare candidates entry point", () => {
    expect(GROW_DETAIL).toMatch(/grow-detail-compare-candidates/);
    expect(GROW_DETAIL).toMatch(/growPhenoComparePath\(grow\.id\)/);
  });
});
