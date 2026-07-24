import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const APP = read("src/App.tsx");
const MANIFEST = read("src/lib/appRouteManifest.ts");
const PAGE = read("src/pages/AiDoctorContextCheck.tsx");
const LANDING = read("src/pages/Landing.tsx");
const EXPLAINER = read("src/pages/HowAiDoctorWorks.tsx");
const SITEMAP = read("public/sitemap.xml");
const SEO_SMOKE = read("scripts/seo-runtime-smoke.mjs");

describe("public AI Doctor context acquisition surface", () => {
  it("is public, discoverable, linked from owned surfaces, and runtime-smoked", () => {
    expect(APP).toContain('path="/ai-doctor-readiness-check"');
    expect(MANIFEST).toMatch(/path: "\/ai-doctor-readiness-check",\s+access: "public"/);
    expect(LANDING).toContain('to="/ai-doctor-readiness-check"');
    expect(EXPLAINER).toContain('to="/ai-doctor-readiness-check"');
    expect(SITEMAP).toContain("https://verdantgrowdiary.com/ai-doctor-readiness-check");
    expect(SEO_SMOKE).toContain('path: "/ai-doctor-readiness-check"');
  });

  it("stays client-local and cannot diagnose, write, call AI, or control devices", () => {
    expect(PAGE).not.toMatch(/integrations\/supabase|supabase\.from|supabase\.rpc/);
    expect(PAGE).not.toMatch(/fetch\(|invoke\(|openai|anthropic/i);
    expect(PAGE).not.toMatch(/action_queue|device command|turn (on|off)|set fan|set light/i);
    expect(PAGE).toContain("Nothing is uploaded or saved");
    expect(PAGE).toMatch(/does\s+not\s+inspect a plant/);
    expect(PAGE).toMatch(/does\s+not/);
  });

  it("routes paid interest through a fixed allow-listed source", () => {
    const attribution = read("src/lib/paidAcquisitionAttributionRules.ts");
    const policy = read("supabase/migrations/20260714190000_restore_public_lead_insert_only.sql");
    const snapshot = read(
      "supabase/migrations/20260714193000_subscriber_growth_operator_snapshot.sql",
    );
    expect(attribution).toContain('source: "context_check"');
    expect(attribution).toContain('leadSource: "pricing_interest_context_check"');
    expect(policy).toContain("'pricing_interest_context_check'");
    expect(snapshot).toContain("AS pricing_interest_context_check");
  });
});
