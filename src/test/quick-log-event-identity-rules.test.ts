/**
 * Regression coverage for `resolveQuickLogEventIdentity` and the
 * Plant Detail read path that renders Quick Log entries.
 *
 * Confirms the fix for the confirmed live-production defect where
 * `quick_log` envelope rows were rendered generically as "Note" /
 * "logged manually" instead of their promoted action ("Watering ·
 * 500 ml"). Also asserts the panel no longer leaks a raw ISO timestamp.
 */
import { describe, it, expect } from "vitest";
import { resolveQuickLogEventIdentity } from "@/lib/quickLogEventIdentityRules";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import { buildPlantRecentActivityRecap } from "@/lib/plantRecentActivityRecap";

const PLANT_ID = "plant-1";

function rawEntry(overrides: Record<string, unknown>) {
  return {
    id: "entry-1",
    plant_id: PLANT_ID,
    tent_id: "tent-1",
    entry_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("resolveQuickLogEventIdentity", () => {
  it("promotes a `quick_log` envelope to the declared action type", () => {
    const identity = resolveQuickLogEventIdentity({
      eventType: "quick_log",
      details: {
        declaredEventType: "watering",
        wateringAmountMl: 500,
      },
    });
    expect(identity.effectiveEventType).toBe("watering");
    expect(identity.displayLabel).toBe("Watering");
    expect(identity.fromQuickLog).toBe(true);
    expect(identity.summarySuffix).toBe("500 ml");
  });

  it("promotes a `note` envelope when details declare a canonical type", () => {
    const identity = resolveQuickLogEventIdentity({
      eventType: "note",
      details: {
        declaredEventType: "feeding",
        ec: 1.2,
        ph: 6.1,
      },
    });
    expect(identity.effectiveEventType).toBe("feeding");
    expect(identity.displayLabel).toBe("Feeding");
    expect(identity.summarySuffix).toBe("EC 1.2 · pH 6.1");
  });

  it("keeps the envelope type when it is not a wrapper", () => {
    const identity = resolveQuickLogEventIdentity({
      eventType: "harvest",
      details: {},
    });
    expect(identity.effectiveEventType).toBe("harvest");
    expect(identity.displayLabel).toBe("Harvest");
  });

  it("does not promote unknown declared types", () => {
    const identity = resolveQuickLogEventIdentity({
      eventType: "quick_log",
      details: { declaredEventType: "bogus_action" },
    });
    // envelope was a wrapper, declared type is unknown → stay on wrapper
    // and fall back to a safe display label.
    expect(identity.effectiveEventType).toBe("quick_log");
    expect(identity.displayLabel).toBe("Note");
    expect(identity.summarySuffix).toBe("");
  });

  it("is null-safe", () => {
    const identity = resolveQuickLogEventIdentity(null);
    expect(identity.effectiveEventType).toBe("note");
    expect(identity.displayLabel).toBe("Note");
    expect(identity.summarySuffix).toBe("");
  });
});

describe("buildPlantRecentActivity — Quick Log envelope promotion", () => {
  it("populates effectiveEventType, displayLabel and summarySuffix", () => {
    const rows = buildPlantRecentActivity(
      [
        rawEntry({
          event_type: "quick_log",
          note: "",
          details: { event_type: "watering", watering_amount_ml: 500 },
        }),
      ],
      { plantId: PLANT_ID },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe("quick_log");
    expect(rows[0].effectiveEventType).toBe("watering");
    expect(rows[0].displayLabel).toBe("Watering");
    expect(rows[0].summarySuffix).toBe("500 ml");
    expect(rows[0].isManualEntry).toBe(true);
  });
});

describe("buildPlantRecentActivityRecap — Quick Log envelope promotion", () => {
  it("classifies quick_log/watering into the Watering bucket with structured summary", () => {
    const rows = buildPlantRecentActivity(
      [
        rawEntry({
          event_type: "quick_log",
          note: "",
          details: { event_type: "watering", watering_amount_ml: 500 },
        }),
      ],
      { plantId: PLANT_ID },
    );
    const items = buildPlantRecentActivityRecap({ rows });
    expect(items).toHaveLength(1);
    expect(items[0].category).toBe("watering");
    expect(items[0].categoryLabel).toBe("Watering");
    expect(items[0].summary).toBe("500 ml");
  });

  it("does not render a raw ISO timestamp", () => {
    const rows = buildPlantRecentActivity(
      [
        rawEntry({
          event_type: "quick_log",
          note: "check-in",
          details: { event_type: "observation" },
        }),
      ],
      { plantId: PLANT_ID },
    );
    const items = buildPlantRecentActivityRecap({ rows });
    expect(items[0].timestampLabel).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
