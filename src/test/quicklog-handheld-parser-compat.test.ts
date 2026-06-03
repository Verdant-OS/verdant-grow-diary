/**
 * #13 — Quick Log hardware-reading parser round-trip compatibility.
 *
 * Asserts `parseManualHandheldReadings` reads BOTH the pre-patch writer
 * labels (`Input pH`, `Input EC/PPM`, `Runoff EC/PPM`) AND the
 * post-patch unit-disambiguated labels (`Feed/Input pH`,
 * `Feed/Input EC (mS/cm)`, `Runoff EC (mS/cm)`). Display-unit suffixes
 * in parens are stripped before lookup. Unknown labels still flow into
 * `other[]`. No schema / writer / RPC changes — parser-only.
 */
import { describe, it, expect } from "vitest";
import {
  buildMeasurementHistory,
  buildPestDiseaseHistory,
  parseManualHandheldReadings,
} from "@/lib/quickLogHistoryRules";
import { normalizeDiaryEntries } from "@/lib/diaryEntryRules";

const HEADER = "Hardware readings (manual handheld):";

const FIXED_NOW = Date.parse("2026-05-24T12:00:00Z");
const FIXED_NOW_ISO = new Date(FIXED_NOW).toISOString();

function rawEntry(eventType: string, note: string) {
  return {
    id: `e-${eventType}`,
    grow_id: "grow-1",
    plant_id: "pl-1",
    tent_id: null,
    stage: "veg",
    entry_at: FIXED_NOW_ISO,
    entry_type: eventType,
    note,
    photo_url: null,
    details: { event_type: eventType },
  };
}

describe("#13 parseManualHandheldReadings — pre-patch label compatibility", () => {
  const oldNote = [
    "Watered today.",
    "",
    HEADER,
    "- Input pH: 6.1",
    "- Input EC/PPM: 1.4",
    "- Runoff pH: 6.0",
    "- Runoff EC/PPM: 1.6",
    "- PPFD canopy: 665",
    "- Light distance: 45 cm",
  ].join("\n");

  it("parses every pre-patch field", () => {
    const parsed = parseManualHandheldReadings(oldNote);
    expect(parsed).not.toBeNull();
    expect(parsed!.inputPh).toBe("6.1");
    expect(parsed!.inputEc).toBe("1.4");
    expect(parsed!.runoffPh).toBe("6.0");
    expect(parsed!.runoffEc).toBe("1.6");
    expect(parsed!.ppfdCanopy).toBe("665");
    expect(parsed!.lightDistance).toBe("45 cm");
    expect(parsed!.other).toBeUndefined();
  });
});

describe("#13 parseManualHandheldReadings — post-patch label compatibility", () => {
  const newNote = [
    "Sticky traps + 500ml water.",
    "",
    HEADER,
    "- Feed/Input pH: 6.1",
    "- Feed/Input EC (mS/cm): 1.4",
    "- Runoff pH: 6.0",
    "- Runoff EC (mS/cm): 1.6",
    "- PPFD canopy (µmol): 665",
    "- Light distance: 45 cm",
  ].join("\n");

  it("parses every post-patch field with unit-suffix stripping", () => {
    const parsed = parseManualHandheldReadings(newNote);
    expect(parsed).not.toBeNull();
    expect(parsed!.inputPh).toBe("6.1");
    expect(parsed!.inputEc).toBe("1.4");
    expect(parsed!.runoffPh).toBe("6.0");
    expect(parsed!.runoffEc).toBe("1.6");
    expect(parsed!.ppfdCanopy).toBe("665");
    expect(parsed!.lightDistance).toBe("45 cm");
    expect(parsed!.other).toBeUndefined();
  });

  it("tolerates harmless label drift without treating known readings as unknown", () => {
    const driftedNote = [
      "Reading copied from a handheld meter.",
      "",
      HEADER,
      "-   FEED / INPUT   pH  : 6.1",
      "- Feed / Input EC (ppm): 1.4",
      "- Runoff EC (MS/CM): 1.6",
      "- PPFD canopy (umol): 665",
    ].join("\n");
    const parsed = parseManualHandheldReadings(driftedNote);
    expect(parsed).not.toBeNull();
    expect(parsed!.inputPh).toBe("6.1");
    expect(parsed!.inputEc).toBe("1.4");
    expect(parsed!.runoffEc).toBe("1.6");
    expect(parsed!.ppfdCanopy).toBe("665");
    expect(parsed!.other).toBeUndefined();
  });

  it("buildPestDiseaseHistory populates manualHandheld for new-format notes", () => {
    const entries = normalizeDiaryEntries({
      rawEntries: [rawEntry("pest_disease", newNote)],
      now: FIXED_NOW,
    });
    const rows = buildPestDiseaseHistory(entries);
    expect(rows).toHaveLength(1);
    expect(rows[0].manualHandheld).not.toBeNull();
    expect(rows[0].manualHandheld!.inputPh).toBe("6.1");
    expect(rows[0].manualHandheld!.inputEc).toBe("1.4");
  });

  it("buildMeasurementHistory includes a new-format pest entry that carries handheld readings", () => {
    const entries = normalizeDiaryEntries({
      rawEntries: [rawEntry("pest_disease", newNote)],
      now: FIXED_NOW,
    });
    const rows = buildMeasurementHistory(entries);
    expect(rows.map((r) => r.id)).toContain("e-pest_disease");
    const r = rows.find((row) => row.id === "e-pest_disease");
    expect(r?.manualHandheld?.inputPh).toBe("6.1");
    expect(r?.manualHandheld?.inputEc).toBe("1.4");
  });
});

describe("#13 parseManualHandheldReadings — unknown labels still land in other[]", () => {
  const mixed = [
    "Note prose.",
    "",
    HEADER,
    "- Feed/Input pH: 6.1",
    "- Custom Reading (foo): 42",
  ].join("\n");

  it("routes recognized labels to typed fields and unknowns to other[]", () => {
    const parsed = parseManualHandheldReadings(mixed);
    expect(parsed).not.toBeNull();
    expect(parsed!.inputPh).toBe("6.1");
    expect(parsed!.other).toBeDefined();
    expect(parsed!.other!.length).toBe(1);
    expect(parsed!.other![0].label).toBe("Custom Reading (foo)");
    expect(parsed!.other![0].value).toBe("42");
  });
});
