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
import {
  resolveQuickLogEventIdentity,
  INVALID_EVENT_TYPE_IDENTITY,
  INVALID_EVENT_TYPE_NEUTRAL_LABEL,
} from "@/lib/quickLogEventIdentityRules";
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

  it("resolves unknown declared types to the explicit invalid_event_type identity", () => {
    const identity = resolveQuickLogEventIdentity({
      eventType: "quick_log",
      details: { declaredEventType: "bogus_action" },
    });
    // envelope was a wrapper, declared type is unknown → the row's kind is
    // unknowable. It gets the explicit neutral identity — NEVER "Note"
    // (masquerade) and NEVER the raw invalid string.
    expect(identity.effectiveEventType).toBe(INVALID_EVENT_TYPE_IDENTITY);
    expect(identity.displayLabel).toBe(INVALID_EVENT_TYPE_NEUTRAL_LABEL);
    expect(identity.displayLabel).not.toBe("Note");
    expect(identity.displayLabel.toLowerCase()).not.toContain("bogus");
    expect(identity.fromQuickLog).toBe(true);
    expect(identity.summarySuffix).toBe("");
  });

  it("never masquerades an invalid declared type as a note, for any wrapper envelope", () => {
    for (const envelope of ["quick_log", "note", ""]) {
      const identity = resolveQuickLogEventIdentity({
        eventType: envelope,
        details: { declaredEventType: "invalid_event_type" },
      });
      expect(identity.effectiveEventType).toBe(INVALID_EVENT_TYPE_IDENTITY);
      expect(identity.displayLabel).toBe(INVALID_EVENT_TYPE_NEUTRAL_LABEL);
      expect(identity.displayLabel).not.toMatch(/note/i);
    }
  });

  it("renders an envelope that literally carries the sentinel neutrally (no title-case leak)", () => {
    const identity = resolveQuickLogEventIdentity({
      eventType: "invalid_event_type",
      details: {},
    });
    expect(identity.displayLabel).toBe(INVALID_EVENT_TYPE_NEUTRAL_LABEL);
    expect(identity.displayLabel).not.toBe("Invalid Event Type");
  });

  it("keeps recognized machine markers on the envelope — never invalid (Codex P2)", () => {
    // The default Quick Log photo path stamps
    // details.event_type = "quicklog_photo_attachment"; learning-loop rows
    // stamp "action_followup". Both are valid history, not invalid types.
    for (const marker of [
      "quicklog_photo_attachment",
      "action_followup",
      "action_outcome",
      "manual_snapshot",
    ]) {
      const identity = resolveQuickLogEventIdentity({
        eventType: "note",
        details: { declaredEventType: marker },
      });
      expect(identity.effectiveEventType, marker).toBe("note");
      expect(identity.displayLabel, marker).toBe("Note");
    }
  });

  it("keeps a photo-attachment marker row classified as Photo in the recap", () => {
    const rows = buildPlantRecentActivity(
      [
        rawEntry({
          event_type: "note",
          note: "",
          photo_url: "https://example.invalid/photo.jpg",
          details: { event_type: "quicklog_photo_attachment" },
        }),
      ],
      { plantId: PLANT_ID },
    );
    expect(rows[0].effectiveEventType).toBe("note");
    const items = buildPlantRecentActivityRecap({ rows });
    expect(items).toHaveLength(1);
    // source=photo wins in the classifier; the label must stay "Photo",
    // never the neutral invalid label and never "Log entry".
    expect(items[0].category).toBe("photos");
    expect(items[0].categoryLabel).toBe("Photo");
  });

  it("keeps a plain note row (no declared type) labeled Note — neutrality is scoped to invalid identities", () => {
    const identity = resolveQuickLogEventIdentity({
      eventType: "note",
      details: {},
    });
    expect(identity.effectiveEventType).toBe("note");
    expect(identity.displayLabel).toBe("Note");
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

  it("labels an invalid_event_type identity neutrally — never as the Note category", () => {
    const rows = buildPlantRecentActivity(
      [
        rawEntry({
          event_type: "quick_log",
          note: "",
          details: { event_type: "legacy_mystery_row" },
        }),
      ],
      { plantId: PLANT_ID },
    );
    expect(rows[0].effectiveEventType).toBe(INVALID_EVENT_TYPE_IDENTITY);
    expect(rows[0].displayLabel).toBe(INVALID_EVENT_TYPE_NEUTRAL_LABEL);
    const items = buildPlantRecentActivityRecap({ rows });
    expect(items).toHaveLength(1);
    expect(items[0].categoryLabel).toBe(INVALID_EVENT_TYPE_NEUTRAL_LABEL);
    expect(items[0].categoryLabel).not.toBe("Note");
    // Summary stays honest: nothing invented for an unknown kind.
    expect(items[0].summary).toBe("No details recorded.");
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

describe("payload summary honesty — legacy rows never gain invented fields", () => {
  // Legacy Quick Log rows predate the typed detail fields: their `details`
  // may carry only the declared type, a partial subset of EC/pH/volume, or
  // values that fail plausibility normalization. The summary must contain
  // ONLY what the row actually stored — never a defaulted or invented value.

  it("watering with no payload fields → empty summary (no invented ml/pH)", () => {
    const identity = resolveQuickLogEventIdentity({
      eventType: "quick_log",
      details: { declaredEventType: "watering" },
    });
    expect(identity.effectiveEventType).toBe("watering");
    expect(identity.summarySuffix).toBe("");
  });

  it("watering with only pH → pH alone; no volume, no runoff", () => {
    const identity = resolveQuickLogEventIdentity({
      eventType: "quick_log",
      details: { declaredEventType: "watering", ph: 6.1 },
    });
    expect(identity.summarySuffix).toBe("pH 6.1");
    expect(identity.summarySuffix).not.toMatch(/ml/i);
    expect(identity.summarySuffix).not.toMatch(/runoff/i);
  });

  it("watering with only volume → volume alone; no pH", () => {
    const identity = resolveQuickLogEventIdentity({
      eventType: "quick_log",
      details: { declaredEventType: "watering", wateringAmountMl: 500 },
    });
    expect(identity.summarySuffix).toBe("500 ml");
    expect(identity.summarySuffix).not.toMatch(/ph/i);
  });

  it("feeding with only EC → EC alone; no TDS, no pH, no volume", () => {
    const identity = resolveQuickLogEventIdentity({
      eventType: "note",
      details: { declaredEventType: "feeding", ec: 1.4 },
    });
    expect(identity.summarySuffix).toBe("EC 1.4");
    expect(identity.summarySuffix).not.toMatch(/tds|ph|ml/i);
  });

  it("summary text never contains placeholder junk for any sparse payload", () => {
    const sparsePayloads = [
      { declaredEventType: "watering" },
      { declaredEventType: "watering", ph: 5.9 },
      { declaredEventType: "feeding" },
      { declaredEventType: "measurement" },
      { declaredEventType: "sensor_snapshot" },
    ];
    for (const details of sparsePayloads) {
      const identity = resolveQuickLogEventIdentity({
        eventType: "quick_log",
        details,
      });
      expect(identity.summarySuffix).not.toMatch(/undefined|NaN|null/i);
    }
  });

  it("end-to-end through normalization: legacy watering row with missing + implausible values keeps only the valid field", () => {
    const rows = buildPlantRecentActivity(
      [
        rawEntry({
          event_type: "quick_log",
          note: "",
          details: {
            event_type: "watering",
            // implausible / malformed values normalization must drop:
            ph: 22, // out of 0–14 band
            runoff_ph: "not-a-number",
            // the single honest field:
            watering_amount_ml: 750,
          },
        }),
      ],
      { plantId: PLANT_ID },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].summarySuffix).toBe("750 ml");
    expect(rows[0].summarySuffix).not.toMatch(/ph/i);

    const items = buildPlantRecentActivityRecap({ rows });
    expect(items[0].summary).toBe("750 ml");
    expect(items[0].summary).not.toMatch(/undefined|NaN|null/i);
  });

  it("end-to-end: legacy watering row with details = only the declared type falls back honestly", () => {
    const rows = buildPlantRecentActivity(
      [
        rawEntry({
          event_type: "quick_log",
          note: "",
          details: { event_type: "watering" },
        }),
      ],
      { plantId: PLANT_ID },
    );
    expect(rows[0].effectiveEventType).toBe("watering");
    expect(rows[0].displayLabel).toBe("Watering");
    expect(rows[0].summarySuffix).toBe("");

    const items = buildPlantRecentActivityRecap({ rows });
    // Category still promotes to Watering, but the summary admits there is
    // no payload rather than inventing one.
    expect(items[0].categoryLabel).toBe("Watering");
    expect(items[0].summary).toBe("No details recorded.");
    expect(items[0].summary).not.toMatch(/\bml\b|\bph\b|\bec\b/i);
  });
});
