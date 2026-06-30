/**
 * Verdant Quick Log Empty-State Polish v1 — static presenter contract.
 *
 * Presenter-only assertions. Reads DailyCheck.tsx + empty-state copy
 * constants and verifies routes, identifier wiring, and safety language
 * so that missing context never gets described as healthy/live, and
 * growers see clear next actions.
 *
 * No Supabase, no writes, no rendering side effects.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DAILY_CHECK_EMPTY_NO_TENT_TITLE,
  DAILY_CHECK_EMPTY_NO_TENT_BODY,
  DAILY_CHECK_EMPTY_NO_PLANT_TITLE,
  DAILY_CHECK_EMPTY_NO_PLANT_BODY,
  DAILY_CHECK_EMPTY_NO_SELECTED_PLANT_TITLE,
  DAILY_CHECK_EMPTY_NO_SELECTED_PLANT_BODY,
  DAILY_CHECK_EMPTY_PLANT_NEEDS_TENT_TITLE,
  DAILY_CHECK_EMPTY_PLANT_NEEDS_TENT_BODY,
  DAILY_CHECK_EMPTY_GO_TO_PLANTS_LABEL,
  DAILY_CHECK_EMPTY_GO_TO_TENTS_LABEL,
  DAILY_CHECK_EMPTY_OPEN_TIMELINE_LABEL,
  DAILY_CHECK_EMPTY_OPEN_SENSORS_LABEL,
} from "@/constants/dailyCheckEmptyStateCopy";

const SRC = readFileSync(resolve("src/pages/DailyCheck.tsx"), "utf8");

const POSITIVE_HEALTHY = /(?:is|are|looks?|reads?|stays?)\s+healthy/i;

describe("Quick Log Empty-State Polish v1 — copy safety (constants)", () => {
  const ALL = [
    DAILY_CHECK_EMPTY_NO_TENT_TITLE,
    DAILY_CHECK_EMPTY_NO_TENT_BODY,
    DAILY_CHECK_EMPTY_NO_PLANT_TITLE,
    DAILY_CHECK_EMPTY_NO_PLANT_BODY,
    DAILY_CHECK_EMPTY_NO_SELECTED_PLANT_TITLE,
    DAILY_CHECK_EMPTY_NO_SELECTED_PLANT_BODY,
    DAILY_CHECK_EMPTY_PLANT_NEEDS_TENT_TITLE,
    DAILY_CHECK_EMPTY_PLANT_NEEDS_TENT_BODY,
    DAILY_CHECK_EMPTY_GO_TO_PLANTS_LABEL,
    DAILY_CHECK_EMPTY_GO_TO_TENTS_LABEL,
    DAILY_CHECK_EMPTY_OPEN_TIMELINE_LABEL,
    DAILY_CHECK_EMPTY_OPEN_SENSORS_LABEL,
  ].join(" | ");

  it("never positively claims missing context is healthy", () => {
    expect(ALL).not.toMatch(POSITIVE_HEALTHY);
  });

  it("explicitly says missing context stays unknown", () => {
    expect(ALL.toLowerCase()).toContain("unknown");
  });

  it("never relabels missing context as live sensor data", () => {
    expect(ALL).not.toMatch(/\blive sensor data\b(?!.*not)/i);
  });

  it("Go-to labels target user-facing surfaces only", () => {
    expect(DAILY_CHECK_EMPTY_GO_TO_PLANTS_LABEL).toMatch(/plants/i);
    expect(DAILY_CHECK_EMPTY_GO_TO_TENTS_LABEL).toMatch(/tents/i);
    expect(DAILY_CHECK_EMPTY_OPEN_TIMELINE_LABEL).toMatch(/timeline/i);
    expect(DAILY_CHECK_EMPTY_OPEN_SENSORS_LABEL).toMatch(/sensors/i);
  });
});

describe("Quick Log Empty-State Polish v1 — no-tents empty state wiring", () => {
  it("renders the no-tents empty state with calm copy constants + Add Tent CTA", () => {
    expect(SRC).toContain("DAILY_CHECK_EMPTY_NO_TENT_TITLE");
    expect(SRC).toContain("DAILY_CHECK_EMPTY_NO_TENT_BODY");
    expect(SRC).toMatch(/data-testid="daily-grow-check-add-tent"/);
    expect(SRC).toMatch(/to=\{tentsPath\(\)\}/);
  });

  it("offers secondary Go to Plants → /plants", () => {
    expect(SRC).toMatch(/data-testid="daily-grow-check-empty-no-tents-go-plants"/);
    expect(SRC).toContain("DAILY_CHECK_EMPTY_GO_TO_PLANTS_LABEL");
  });

  it("offers secondary Open Timeline → /timeline", () => {
    expect(SRC).toMatch(/data-testid="daily-grow-check-empty-no-tents-open-timeline"/);
    expect(SRC).toContain("DAILY_CHECK_EMPTY_OPEN_TIMELINE_LABEL");
    expect(SRC).toMatch(/to=\{timelinePath\(\)\}/);
  });
});

describe("Quick Log Empty-State Polish v1 — no-plants empty state wiring", () => {
  it("renders the no-plants empty state with calm copy constants + Add Plant CTA", () => {
    expect(SRC).toContain("DAILY_CHECK_EMPTY_NO_PLANT_TITLE");
    expect(SRC).toContain("DAILY_CHECK_EMPTY_NO_PLANT_BODY");
    expect(SRC).toMatch(/data-testid="daily-grow-check-add-plant"/);
    expect(SRC).toMatch(/to=\{plantsPath\(\)\}/);
  });

  it("offers secondary Go to Tents → /tents", () => {
    expect(SRC).toMatch(/data-testid="daily-grow-check-empty-no-plants-go-tents"/);
    expect(SRC).toContain("DAILY_CHECK_EMPTY_GO_TO_TENTS_LABEL");
  });

  it("offers secondary Open Sensors → /sensors", () => {
    expect(SRC).toMatch(/data-testid="daily-grow-check-empty-no-plants-open-sensors"/);
    expect(SRC).toContain("DAILY_CHECK_EMPTY_OPEN_SENSORS_LABEL");
    expect(SRC).toMatch(/to=\{sensorsPath\(\)\}/);
  });
});

describe("Quick Log Empty-State Polish v1 — Choose section hints", () => {
  it("shows a 'Pick a plant' block when no plant is selected", () => {
    expect(SRC).toMatch(/data-testid="daily-grow-check-choose-no-plant"/);
    expect(SRC).toContain("DAILY_CHECK_EMPTY_NO_SELECTED_PLANT_TITLE");
    expect(SRC).toContain("DAILY_CHECK_EMPTY_NO_SELECTED_PLANT_BODY");
    expect(SRC).toMatch(/data-testid="daily-grow-check-choose-no-plant-go-plants"/);
    expect(SRC).toMatch(/data-testid="daily-grow-check-choose-no-plant-open-timeline"/);
  });

  it("shows a calm 'Assign a tent' block with Assign tent + Go to Tents", () => {
    expect(SRC).toMatch(/data-testid="daily-grow-check-choose-no-tent"/);
    expect(SRC).toContain("DAILY_CHECK_EMPTY_PLANT_NEEDS_TENT_TITLE");
    expect(SRC).toContain("DAILY_CHECK_EMPTY_PLANT_NEEDS_TENT_BODY");
    expect(SRC).toMatch(/data-testid="daily-grow-check-choose-no-tent-assign"/);
    expect(SRC).toMatch(/data-testid="daily-grow-check-choose-no-tent-go-tents"/);
  });
});

describe("Quick Log Empty-State Polish v1 — behavior guards", () => {
  it("preserves Add plant note + Add sensor snapshot fast paths", () => {
    expect(SRC).toMatch(/data-testid="daily-grow-check-choose-quicklog"/);
    expect(SRC).toMatch(/data-testid="daily-grow-check-choose-snapshot"/);
  });

  it("preserves Manual snapshot sensor truth copy", () => {
    expect(SRC).toMatch(/Saved as <strong>manual<\/strong>, not live sensor data/);
  });

  it("preserves save-confirmation gating on the success event", () => {
    expect(SRC).toMatch(/lastSubmittedAt !== null/);
    expect(SRC).toMatch(/verdant:entry-created/);
    expect(SRC).toMatch(/verdant:sensor-reading-created/);
  });

  it("only links to known existing route helpers from empty states", () => {
    for (const h of ["tentsPath", "plantsPath", "timelinePath", "sensorsPath", "plantDetailPath"]) {
      expect(SRC).toContain(`${h}(`);
    }
  });
});
