/**
 * Tests for the /demo conversion improvements: "Make this your real grow"
 * panel, contextual action signup copy, and "What happens after signup?".
 *
 * Static reads only — no runtime mount. Verifies copy and safety contract.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEMO = readFileSync(resolve(__dirname, "..", "pages/Demo.tsx"), "utf8");

describe("/demo — Make this your real grow conversion panel", () => {
  it("renders the conversion panel heading", () => {
    expect(DEMO).toMatch(/Make this your real grow/);
  });
  it("explains demo replacement, privacy, and preview-only behavior", () => {
    expect(DEMO).toMatch(/Create a free account to replace demo data with your own grow, tent, plant, logs, and sensor readings/);
    expect(DEMO).toMatch(/Your real dashboard stays private/);
    expect(DEMO).toMatch(/Demo actions are previews only/);
  });
  it("exposes both Create Free Account and Sign In CTAs", () => {
    expect(DEMO).toMatch(/Create Free Account/);
    expect(DEMO).toMatch(/Sign In/);
  });
});

describe("/demo — contextual signup copy per write-gated action", () => {
  it("Add log → save real diary entries", () => {
    expect(DEMO).toMatch(/"Add log":\s*"Create an account to save real diary entries\."/);
  });
  it("Run AI Doctor → analyze your real grow context", () => {
    expect(DEMO).toMatch(/"Run AI Doctor":\s*"Create an account to analyze your real grow context\."/);
  });
  it("Add to Action Queue → manage real approval-required actions", () => {
    expect(DEMO).toMatch(/"Add to Action Queue":\s*"Create an account to manage real approval-required actions\."/);
  });
  it("dialog renders the contextual copy from ACTION_PROMPTS", () => {
    expect(DEMO).toMatch(/ACTION_PROMPTS\[promptOpen\]/);
  });
});

describe("/demo — What happens after signup section", () => {
  it("renders the section heading", () => {
    expect(DEMO).toMatch(/What happens after signup\?/);
  });
  it("renders all 4 steps with required titles", () => {
    expect(DEMO).toMatch(/Step 1[\s\S]*Create your grow/);
    expect(DEMO).toMatch(/Step 2[\s\S]*Add your tent and plant/);
    expect(DEMO).toMatch(/Step 3[\s\S]*Log your first note or sensor reading/);
    expect(DEMO).toMatch(/Step 4[\s\S]*Let Verdant build your plant timeline/);
  });
});

describe("/demo — safety contract still holds", () => {
  it("does not import the Supabase client", () => {
    expect(DEMO).not.toMatch(/@\/integrations\/supabase\/client/);
  });
  it("does not import any data hook", () => {
    expect(DEMO).not.toMatch(/from\s+["']@\/hooks\//);
  });
  it("does not invoke edge functions or use service_role", () => {
    expect(DEMO).not.toMatch(/functions\.invoke/);
    expect(DEMO).not.toMatch(/service_role/);
  });
  it("still labels demo data and demo mode visibly", () => {
    expect(DEMO).toMatch(/Demo mode/);
    expect(DEMO).toMatch(/Demo data/);
  });
  it("contains no forbidden marketing claims", () => {
    for (const re of [/autopilot/i, /AI grows for you/i, /guaranteed yield/i]) {
      expect(DEMO).not.toMatch(re);
    }
  });
});
