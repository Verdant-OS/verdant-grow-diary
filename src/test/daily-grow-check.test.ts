/**
 * Daily Grow Check tests — pure rules + entry-point + safety audit.
 *
 * Verifies:
 *  - guard logic for no tents / no plants / plant-needs-tent
 *  - step order, next/previous, progress
 *  - completion summary outcomes
 *  - entry points exist on Dashboard and PlantDetail
 *  - DailyCheck page route is registered
 *  - static safety: no service_role, mqtt, home_assistant, pi_bridge,
 *    actuator, device_command, autopilot, alert/action_queue mutations,
 *    or sensor_readings writes outside the existing ManualSensorReadingCard
 *    path
 *  - copy uses grower-native language
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DAILY_GROW_CHECK_STEPS,
  INITIAL_DAILY_GROW_CHECK_STATE,
  buildDailyGrowCheckSummary,
  canCompleteDailyGrowCheck,
  evaluateDailyGrowCheckGuard,
  nextStep,
  previousStep,
  stepProgress,
} from "@/lib/dailyGrowCheckRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const PAGE = read("src/pages/DailyCheck.tsx");
const APP = read("src/App.tsx");
const DASHBOARD = read("src/pages/Dashboard.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");
const RULES = read("src/lib/dailyGrowCheckRules.ts");

describe("dailyGrowCheckRules — guards", () => {
  it("flags no tents", () => {
    const g = evaluateDailyGrowCheckGuard({
      tentsCount: 0,
      plantsCount: 1,
      selectedPlantTentId: null,
      hasSelectedPlant: false,
    });
    expect(g.ok).toBe(false);
    expect(g.reason).toBe("no-tents");
    expect(g.message).toBe("Add a tent first.");
  });
  it("flags no plants", () => {
    const g = evaluateDailyGrowCheckGuard({
      tentsCount: 1,
      plantsCount: 0,
      selectedPlantTentId: null,
      hasSelectedPlant: false,
    });
    expect(g.reason).toBe("no-plants");
    expect(g.message).toBe("Add a plant first.");
  });
  it("flags plant-needs-tent when selected plant has no tent", () => {
    const g = evaluateDailyGrowCheckGuard({
      tentsCount: 2,
      plantsCount: 2,
      selectedPlantTentId: null,
      hasSelectedPlant: true,
    });
    expect(g.reason).toBe("plant-needs-tent");
    expect(g.message).toContain("Assign this plant to a tent");
  });
  it("passes when tents/plants exist and selected plant has tent", () => {
    const g = evaluateDailyGrowCheckGuard({
      tentsCount: 1,
      plantsCount: 1,
      selectedPlantTentId: "tent-1",
      hasSelectedPlant: true,
    });
    expect(g.ok).toBe(true);
  });
  it("passes when no plant is selected (browse mode)", () => {
    const g = evaluateDailyGrowCheckGuard({
      tentsCount: 1,
      plantsCount: 1,
      selectedPlantTentId: null,
      hasSelectedPlant: false,
    });
    expect(g.ok).toBe(true);
  });
});

describe("dailyGrowCheckRules — navigation", () => {
  it("includes the six grower-facing steps plus done", () => {
    expect(DAILY_GROW_CHECK_STEPS).toEqual([
      "select",
      "environment",
      "manual",
      "quicklog",
      "handheld",
      "review",
      "done",
    ]);
  });
  it("nextStep walks forward and clamps at done", () => {
    expect(nextStep("select")).toBe("environment");
    expect(nextStep("review")).toBe("done");
    expect(nextStep("done")).toBe("done");
  });
  it("previousStep walks back and clamps at select", () => {
    expect(previousStep("environment")).toBe("select");
    expect(previousStep("select")).toBe("select");
  });
  it("stepProgress is deterministic", () => {
    expect(stepProgress("select").index).toBe(0);
    const last = stepProgress("review");
    expect(last.percent).toBeGreaterThan(0);
    expect(last.total).toBe(DAILY_GROW_CHECK_STEPS.length - 1);
  });
});

describe("dailyGrowCheckRules — summary", () => {
  it("reports all five summary lines with outcomes", () => {
    const summary = buildDailyGrowCheckSummary({
      ...INITIAL_DAILY_GROW_CHECK_STATE,
      manual: "added",
      quicklog: "skipped",
      handheld: "skipped",
      alertsReviewed: true,
      tasksReviewed: false,
    });
    expect(summary.map((r) => r.key)).toEqual([
      "manual",
      "quicklog",
      "handheld",
      "alerts",
      "tasks",
    ]);
    const get = (k: string) => summary.find((r) => r.key === k)!.outcome;
    expect(get("manual")).toBe("added");
    expect(get("quicklog")).toBe("skipped");
    expect(get("handheld")).toBe("skipped");
    expect(get("alerts")).toBe("reviewed");
    expect(get("tasks")).toBe("not-reviewed");
  });
  it("missing optional readings do not block completion", () => {
    expect(canCompleteDailyGrowCheck(INITIAL_DAILY_GROW_CHECK_STATE)).toBe(true);
  });
});

describe("DailyCheck page — entry points and structure", () => {
  it("page renders the six step titles and grower-native copy", () => {
    expect(PAGE).toMatch(/Step 1 · Select Current Tent \/ Plant/);
    expect(PAGE).toMatch(/Step 2 · Review Current Environment/);
    expect(PAGE).toMatch(/Step 3 · Add Manual Sensor Snapshot/);
    expect(PAGE).toMatch(/Step 4 · Quick Log/);
    expect(PAGE).toMatch(/Step 5 · Handheld Readings/);
    expect(PAGE).toMatch(/Step 6 · Review Alerts & Pending Tasks/);
    expect(PAGE).toMatch(/Daily Grow Check/);
    expect(PAGE).toMatch(/Current Tent/);
    expect(PAGE).toMatch(/Current Plant/);
    expect(PAGE).toMatch(/Current Environment/);
  });
  it("reuses existing ManualSensorReadingCard, QuickLog, PlantStatusStrip", () => {
    expect(PAGE).toMatch(/ManualSensorReadingCard/);
    expect(PAGE).toMatch(/import QuickLog/);
    expect(PAGE).toMatch(/PlantStatusStrip/);
    expect(PAGE).toMatch(/PlantAssignedTentAlertsPanel/);
    expect(PAGE).toMatch(/PlantAssignedTentActionsPanel/);
  });
  it("registers the /daily-check route", () => {
    expect(APP).toMatch(/path="\/daily-check"/);
    expect(APP).toMatch(/DailyCheck/);
  });
  it("Dashboard exposes a Daily Grow Check entry button", () => {
    expect(DASHBOARD).toMatch(/data-testid="dashboard-daily-grow-check-entry"/);
    expect(DASHBOARD).toMatch(/\/daily-check/);
  });
  it("PlantDetail exposes a Daily Grow Check entry button with plantId", () => {
    expect(PLANT_DETAIL).toMatch(/data-testid="plant-detail-daily-grow-check-entry"/);
    expect(PLANT_DETAIL).toMatch(/\/daily-check\?plantId=/);
  });
  it("emphasizes manual snapshot is not live data and uses Fahrenheit", () => {
    expect(PAGE).toMatch(/Manual snapshot, not live sensor data/i);
    expect(PAGE).toMatch(/°F/);
  });
});

describe("DailyCheck — static safety audit", () => {
  const surfaces = [PAGE, RULES];
  const FORBIDDEN = [
    /service_role/i,
    /\bmqtt\b/i,
    /\bhome_assistant\b/i,
    /\bpi_bridge\b/i,
    /actuator/i,
    /device_command/i,
    /autopilot/i,
  ];
  it("contains no forbidden integration / automation strings", () => {
    for (const surface of surfaces) {
      for (const re of FORBIDDEN) {
        expect(surface).not.toMatch(re);
      }
    }
  });
  it("does not write to sensor_readings directly (uses ManualSensorReadingCard)", () => {
    expect(PAGE).not.toMatch(/from\(["']sensor_readings["']\)\s*\.\s*insert/);
    expect(PAGE).not.toMatch(/sensor_readings.*insert/);
  });
  it("does not mutate alerts or action_queue", () => {
    expect(PAGE).not.toMatch(/from\(["']alerts["']\)\s*\.\s*(insert|update|delete)/);
    expect(PAGE).not.toMatch(/from\(["']action_queue["']\)\s*\.\s*(insert|update|delete)/);
  });
  it("does not modify Leads", () => {
    expect(PAGE).not.toMatch(/leads/i);
  });
  it("uses grower-native copy (no 'Workspace' or 'Assignment mapping')", () => {
    expect(PAGE).not.toMatch(/Workspace/);
    expect(PAGE).not.toMatch(/Assignment mapping/);
  });
});

import {
  buildDailyGrowCheckReviewLinks,
  formatOutcomeLabel,
} from "@/lib/dailyGrowCheckRules";

describe("buildDailyGrowCheckReviewLinks", () => {
  it("includes plant + tent + timeline when both are present", () => {
    const links = buildDailyGrowCheckReviewLinks({ plantId: "p1", tentId: "t1" });
    const keys = links.map((l) => l.key);
    expect(keys).toContain("plant");
    expect(keys).toContain("tent");
    expect(keys).toContain("timeline");
    expect(links.find((l) => l.key === "plant")?.href).toBe("/plants/p1");
    expect(links.find((l) => l.key === "tent")?.href).toBe("/tents/t1");
    expect(links.find((l) => l.key === "plant")?.primary).toBe(true);
  });
  it("hides plant link when no plant is selected (tent-only nav)", () => {
    const links = buildDailyGrowCheckReviewLinks({ plantId: null, tentId: "t1" });
    expect(links.find((l) => l.key === "plant")).toBeUndefined();
    expect(links.find((l) => l.key === "tent")).toBeDefined();
  });
  it("falls back to safe Dashboard + Add Tent when no tent context", () => {
    const links = buildDailyGrowCheckReviewLinks({ plantId: null, tentId: null });
    const keys = links.map((l) => l.key);
    expect(keys).toEqual(["dashboard", "add-tent"]);
    expect(links.find((l) => l.key === "dashboard")?.href).toBe("/");
    expect(links.find((l) => l.key === "add-tent")?.href).toBe("/tents");
  });
  it("preserves plant context when plant is set", () => {
    const links = buildDailyGrowCheckReviewLinks({ plantId: "abc", tentId: "xyz" });
    expect(links[0].href).toBe("/plants/abc");
  });
});

describe("formatOutcomeLabel — conservative copy", () => {
  it("renders confirmed states verbatim", () => {
    expect(formatOutcomeLabel("added")).toBe("Added");
    expect(formatOutcomeLabel("skipped")).toBe("Skipped");
    expect(formatOutcomeLabel("reviewed")).toBe("Reviewed");
  });
  it("uses Visited when save was not confirmed", () => {
    expect(formatOutcomeLabel("visited")).toBe("Visited");
  });
  it("shows Not reviewed clearly", () => {
    expect(formatOutcomeLabel("not-reviewed")).toBe("Not reviewed");
  });
});

describe("DailyCheck — completion screen polish", () => {
  it("uses grower-native completion copy", () => {
    expect(PAGE).toMatch(/Today's check is saved/);
    expect(PAGE).toMatch(/Review what changed/);
    expect(PAGE).toMatch(/Run another check/);
  });
  it("manual step uses conservative 'visited' outcome (no save confirmation)", () => {
    expect(PAGE).toMatch(/markAndAdvance\("manual", "visited"\)/);
  });
  it("renders review links container and restart action", () => {
    expect(PAGE).toMatch(/data-testid="daily-grow-check-review-links"/);
    expect(PAGE).toMatch(/data-testid="daily-grow-check-restart"/);
  });
  it("does not claim live data on the completion screen", () => {
    // "live sensor data" only appears in the negation copy ("not live sensor data").
    const liveMatches = PAGE.match(/\blive\b/g) ?? [];
    for (const _ of liveMatches) {
      // every occurrence must be inside a "not live" phrase
      expect(PAGE).not.toMatch(/is live data/i);
      expect(PAGE).not.toMatch(/now live/i);
    }
  });
  it("does not introduce a persistent checklist write path", () => {
    expect(PAGE).not.toMatch(/daily_check/);
    expect(PAGE).not.toMatch(/checklist/i);
    expect(RULES).not.toMatch(/from\(["'][a-z_]+["']\)/);
    expect(RULES).not.toMatch(/import.*supabase/i);
  });
});

const GROW_ROOM = read("src/pages/GrowRoomMode.tsx");
const MOBILE_NAV = read("src/components/MobileNav.tsx");

describe("Daily Grow Check entry access — multi-surface", () => {
  it("GrowRoomMode (Live Dashboard) exposes a Start Check entry", () => {
    expect(GROW_ROOM).toMatch(/data-testid="grow-room-daily-grow-check-entry"/);
    expect(GROW_ROOM).toMatch(/\/daily-check/);
    expect(GROW_ROOM).toMatch(/Start Check/);
  });
  it("Dashboard entry still routes to /daily-check with grower-native copy", () => {
    expect(DASHBOARD).toMatch(/Daily Grow Check/);
    expect(DASHBOARD).toMatch(/\/daily-check/);
  });
  it("Plant Detail entry preserves ?plantId= prefill", () => {
    expect(PLANT_DETAIL).toMatch(/\/daily-check\?plantId=/);
  });
  it("Mobile nav 'More' sheet includes Daily Grow Check", () => {
    expect(MOBILE_NAV).toMatch(/Daily Grow Check/);
    expect(MOBILE_NAV).toMatch(/\/daily-check/);
  });
  it("does not duplicate DailyCheck flow logic outside the page/rules", () => {
    for (const surface of [GROW_ROOM, MOBILE_NAV, DASHBOARD, PLANT_DETAIL]) {
      expect(surface).not.toMatch(/DAILY_GROW_CHECK_STEPS/);
      expect(surface).not.toMatch(/buildDailyGrowCheckSummary/);
      expect(surface).not.toMatch(/buildDailyGrowCheckReviewLinks/);
    }
  });
  it("entry surfaces contain no forbidden integration strings", () => {
    const FORBIDDEN = [/service_role/i, /\bmqtt\b/i, /\bhome_assistant\b/i, /\bpi_bridge\b/i, /actuator/i, /device_command/i, /autopilot/i];
    for (const surface of [GROW_ROOM, MOBILE_NAV]) {
      for (const re of FORBIDDEN) expect(surface).not.toMatch(re);
    }
  });
});
