/**
 * VER-300 regression pins added after #2581 merged — complements
 * alert-target-archived-removed.test.tsx and alerts-historical-targets-toggle.test.tsx.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "@/lib/react-router-compat";
import { AlertTargetContext } from "@/components/AlertTargetContext";
import {
  ALERT_TARGET_NAME_UNAVAILABLE_LABEL,
  ALERT_TARGET_REMOVED_LABEL,
  alertTargetHiddenCountLabel,
  alertTargetHistoricalToggleLabel,
  buildAlertTargetPresenterInput,
  deriveAlertTargetContext,
  type AlertTargetRecordState,
} from "@/lib/alertTargetContextRules";

const GROW = "44444444-4444-4444-8444-444444444444";
const TENT_ACTIVE = "11111111-1111-4111-8111-111111111111";
const TENT_GONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLANT_ARCHIVED = "66666666-6666-4666-8666-666666666666";

const NAMES = {
  tentNameById: new Map([[TENT_ACTIVE, "Veg Tent"]]),
  plantNameById: new Map([[PLANT_ARCHIVED, "Culled Pheno #3"]]),
  tentStateById: new Map<string, AlertTargetRecordState>([[TENT_ACTIVE, "active"]]),
  plantStateById: new Map<string, AlertTargetRecordState>([[PLANT_ARCHIVED, "archived"]]),
  singleTentIdByGrowId: new Map([[GROW, TENT_ACTIVE]]),
};

describe("VER-300 list toggle copy helpers", () => {
  it("names show/hide and the hidden count while alerts stay filtered", () => {
    expect(alertTargetHistoricalToggleLabel(false, 2)).toBe("Show archived targets (2)");
    expect(alertTargetHistoricalToggleLabel(true, 2)).toBe("Hide archived targets (2)");
    expect(alertTargetHiddenCountLabel(2)).toBe("2 hidden for archived tents/plants");
    expect(alertTargetHiddenCountLabel(0)).toBeNull();
  });
});

describe("VER-300 buildAlertTargetPresenterInput — removed inference gate", () => {
  it("never marks an absent id removed until namesReady", () => {
    const input = buildAlertTargetPresenterInput({
      tentId: TENT_GONE,
      growId: GROW,
      tentNameById: new Map(),
      plantNameById: new Map(),
      tentStateById: new Map(),
      plantStateById: new Map(),
      namesReady: false,
      namesLoading: false,
    });
    expect(input.tentState).toBeNull();
    const ctx = deriveAlertTargetContext(input);
    expect(ctx.historical).toBe(false);
    expect(ctx.text).toBe(`Tent: ${ALERT_TARGET_NAME_UNAVAILABLE_LABEL}`);
  });

  it("marks an absent id removed only after a complete owner read", () => {
    const input = buildAlertTargetPresenterInput({
      tentId: TENT_GONE,
      growId: GROW,
      tentNameById: new Map(),
      plantNameById: new Map(),
      tentStateById: new Map([[TENT_ACTIVE, "active"]]),
      plantStateById: new Map(),
      namesReady: true,
      namesLoading: false,
    });
    expect(input.tentState).toBe("missing");
    expect(deriveAlertTargetContext(input).historical).toBe(true);
  });
});

describe("VER-300 AlertTargetContext — removed tent link safety", () => {
  it("detailed variant drops the tent link when the record is missing", () => {
    const input = buildAlertTargetPresenterInput({
      ...NAMES,
      tentId: TENT_GONE,
      plantId: PLANT_ARCHIVED,
      growId: GROW,
      namesReady: true,
      namesLoading: false,
    });
    render(
      <MemoryRouter>
        <dl>
          <AlertTargetContext
            {...input}
            variant="detailed"
            tentHref={`/tents/${TENT_GONE}`}
            plantHref={`/plants/${PLANT_ARCHIVED}`}
          />
        </dl>
      </MemoryRouter>,
    );
    const tent = screen.getByTestId("alert-detail-tent-label");
    expect(tent.textContent).toBe(ALERT_TARGET_REMOVED_LABEL.Tent);
    expect(tent.tagName).toBe("SPAN");
    const plant = screen.getByTestId("alert-detail-plant-label");
    expect(plant.textContent).toBe("Archived plant: Culled Pheno #3");
    expect(plant.tagName).toBe("A");
  });
});

const DETAIL_SRC = readFileSync(resolve(__dirname, "../pages/AlertDetail.tsx"), "utf8");

describe("VER-300 AlertDetail wiring", () => {
  it("passes archived-target state maps and the complete-read gate into the presenter", () => {
    expect(DETAIL_SRC).toMatch(/tentStateById:\s*targetNames\.tentStateById/);
    expect(DETAIL_SRC).toMatch(/plantStateById:\s*targetNames\.plantStateById/);
    expect(DETAIL_SRC).toMatch(
      /namesReady:\s*targetNames\.status\s*===\s*["']ok["']\s*&&\s*targetNames\.readComplete\s*===\s*true/,
    );
  });
});
