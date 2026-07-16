import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const APP = read("src/App.tsx");
const MANIFEST = read("src/lib/appRouteManifest.ts");
const PAGE = read("src/pages/PublicVpdCalculator.tsx");
const RULES = read("src/lib/publicVpdCalculatorRules.ts");
const GUIDE = read("src/pages/GuidePage.tsx");
const GUIDE_INDEX = read("src/pages/GuidesIndex.tsx");
const SITEMAP = read("public/sitemap.xml");
const SEO_SMOKE = read("scripts/seo-runtime-smoke.mjs");
const ATTRIBUTION = read("src/lib/paidAcquisitionAttributionRules.ts");
const LEAD_POLICY = read("supabase/migrations/20260714190000_restore_public_lead_insert_only.sql");
const GROWTH_SNAPSHOT = read(
  "supabase/migrations/20260714193000_subscriber_growth_operator_snapshot.sql",
);
const SIGNUP_SNAPSHOT = read(
  "supabase/migrations/20260714231627_signup_acquisition_attribution.sql",
);

describe("public VPD acquisition surface", () => {
  it("is public, crawlable, linked from VPD content, and runtime-smoked", () => {
    expect(APP).toContain('path="/tools/vpd-calculator"');
    expect(MANIFEST).toMatch(/path: "\/tools\/vpd-calculator",\s+access: "public"/);
    expect(GUIDE).toContain('to="/tools/vpd-calculator"');
    expect(GUIDE_INDEX).toContain('to="/tools/vpd-calculator"');
    expect(SITEMAP).toContain("https://verdantgrowdiary.com/tools/vpd-calculator");
    expect(SEO_SMOKE).toContain('path: "/tools/vpd-calculator"');
  });

  it("stays client-local, manual, derived, and read-only", () => {
    const combined = `${PAGE}\n${RULES}`;
    expect(combined).not.toMatch(/integrations\/supabase|supabase\.(from|rpc)|fetch\(|invoke\(/i);
    expect(combined).not.toMatch(/\.insert\(|\.update\(|mqtt\.publish|webhook\s*\(/i);
    expect(combined).not.toMatch(/calculateLeaf|leafTemperature|leaf_vpd/i);
    expect(combined).toContain("Manual inputs · derived air VPD · not live telemetry");
    expect(combined).toMatch(/not a plant-health diagnosis/i);
    expect(combined).toMatch(/does not issue device commands/i);
  });

  it("tracks signup and pricing interest through fixed, PII-free allowlists", () => {
    expect(ATTRIBUTION).toContain('source: "vpd_calculator"');
    expect(ATTRIBUTION).toContain('leadSource: "pricing_interest_vpd_calculator"');
    expect(LEAD_POLICY).toContain("'pricing_interest_vpd_calculator'");
    expect(GROWTH_SNAPSHOT).toContain("AS pricing_interest_vpd_calculator");
    expect(SIGNUP_SNAPSHOT).toContain("AS vpd_calculator");
    expect(PAGE).not.toMatch(/email|user_?id|plant_?id|tent_?id|grow_?id/i);
  });
});
