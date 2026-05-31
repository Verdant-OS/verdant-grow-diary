/**
 * Static-scan tests confirming the Dashboard wires the onboarding
 * progress pill into the header and continues to render the checklist
 * card, view-model, and existing V0 loop surfaces (latest snapshot,
 * persisted alerts, daily grow check).
 *
 * Also enforces the slice's safety/copy constraints on both the
 * progress pill and the checklist card.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const DASH = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const DASH_EXEC = stripSourceComments(DASH);
const PILL = readFileSync(
  resolve(ROOT, "src/components/OnboardingProgressPill.tsx"),
  "utf8",
);
const CARD = readFileSync(
  resolve(ROOT, "src/components/OnboardingChecklistCard.tsx"),
  "utf8",
);
const PREFS = readFileSync(
  resolve(ROOT, "src/lib/localOnboardingPreferences.ts"),
  "utf8",
);

describe("Dashboard wires the onboarding progress pill in the header", () => {
  it("imports OnboardingProgressPill", () => {
    expect(DASH_EXEC).toMatch(
      /from\s+["']@\/components\/OnboardingProgressPill["']/,
    );
  });

  it("renders the pill alongside the existing checklist card", () => {
    expect(DASH_EXEC).toMatch(/<OnboardingProgressPill\s+vm=\{onboardingVm\}/);
    expect(DASH_EXEC).toMatch(/<OnboardingChecklistCard\s+vm=\{onboardingVm\}/);
  });

  it("does not add new Supabase queries for the checklist", () => {
    // Pill + card stay pure; Dashboard reuses already-loaded counts.
    expect(PILL).not.toMatch(/supabase/i);
    expect(CARD).not.toMatch(/supabase/i);
  });

  it("preserves the V0 loop surfaces on the Dashboard", () => {
    expect(DASH).toMatch(/Latest Environment/);
    expect(DASH).toMatch(/usePersistEnvironmentAlerts/);
    expect(DASH).toMatch(/useAlertsList/);
    expect(DASH).toMatch(/DashboardDailyGrowCheckPanel/);
  });
});

describe("Onboarding pill + card + prefs — safety constraints", () => {
  const ALL = [PILL, CARD, PREFS].join("\n");

  it("no autopilot / AI-grows-for-you / guaranteed yield copy", () => {
    expect(ALL).not.toMatch(/autopilot/i);
    expect(ALL).not.toMatch(/AI grows for you/i);
    expect(ALL).not.toMatch(/guaranteed yield/i);
  });

  it("no fake-live data claims", () => {
    // Allow benign words like "active"; forbid "live data" specifically.
    expect(ALL).not.toMatch(/\blive data\b/i);
  });

  it("no device-control copy", () => {
    for (const re of [/turn on/i, /turn off/i, /control your (fan|light|pump|heater|humidifier|dehumidifier)/i]) {
      expect(ALL).not.toMatch(re);
    }
  });

  it("local preferences helper does not call Supabase or the network", () => {
    expect(PREFS).not.toMatch(/supabase/i);
    expect(PREFS).not.toMatch(/fetch\s*\(/);
    expect(PREFS).not.toMatch(/XMLHttpRequest/);
  });

  it("local preferences helper uses the scoped versioned key", () => {
    expect(PREFS).toMatch(/verdant:onboarding-checklist-dismissed:v1/);
  });
});
