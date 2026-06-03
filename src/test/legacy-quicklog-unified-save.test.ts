import { describe, it, expect } from "vitest";
import {
  buildLegacyQuickLogUnifiedPayload,
  isSupportedLegacyEventType,
  appendLegacyDetailsToNote,
} from "@/lib/legacyQuickLogUnifiedSave";

const PLANT_ID = "11111111-1111-1111-1111-111111111111";
const TENT_ID = "22222222-2222-2222-2222-222222222222";

const baseInput = {
  eventType: "observation",
  noteWithHardware: "Leaves curling slightly",
  plantId: PLANT_ID,
  plantTentId: TENT_ID,
  details: { ph: "", ec: "", runoff: "", nutrients: "", training: "", watering: "" },
};

describe("legacyQuickLogUnifiedSave", () => {
  it("rejects unsupported event types with coming-soon copy", () => {
    const r = buildLegacyQuickLogUnifiedPayload({ ...baseInput, eventType: "photo" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unsupported_event_type");
      expect(r.message).toMatch(/coming soon/i);
    }
  });

  it("rejects when no plant is selected", () => {
    const r = buildLegacyQuickLogUnifiedPayload({ ...baseInput, plantId: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("plant_required");
  });

  it("maps watering to RPC water action with volume_ml", () => {
    const r = buildLegacyQuickLogUnifiedPayload({
      ...baseInput,
      eventType: "watering",
      noteWithHardware: "",
      details: { ...baseInput.details, watering: "500" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.p_action).toBe("water");
      expect(r.payload.p_target_type).toBe("plant");
      expect(r.payload.p_target_id).toBe(PLANT_ID);
      expect(r.payload.p_volume_ml).toBe(500);
      expect(r.payload.p_temperature_c).toBeNull();
      expect(r.payload.p_humidity_pct).toBeNull();
      expect(r.payload.p_vpd_kpa).toBeNull();
    }
  });

  it("rejects watering with missing or non-positive volume", () => {
    for (const v of ["", "0", "-3", "abc"]) {
      const r = buildLegacyQuickLogUnifiedPayload({
        ...baseInput,
        eventType: "watering",
        details: { ...baseInput.details, watering: v },
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("invalid_volume");
    }
  });

  it("maps observation to RPC note action", () => {
    const r = buildLegacyQuickLogUnifiedPayload(baseInput);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.p_action).toBe("note");
      expect(r.payload.p_note).toBe("Leaves curling slightly");
      expect(r.payload.p_volume_ml).toBeNull();
    }
  });

  it("requires a note for the note action", () => {
    const r = buildLegacyQuickLogUnifiedPayload({ ...baseInput, noteWithHardware: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("note_required");
  });

  it("folds free-text detail fields into the note", () => {
    const r = buildLegacyQuickLogUnifiedPayload({
      ...baseInput,
      noteWithHardware: "Daily check",
      details: { ...baseInput.details, ph: "6.2", ec: "1.4", nutrients: "CalMag" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.p_note).toContain("Daily check");
      expect(r.payload.p_note).toContain("pH: 6.2");
      expect(r.payload.p_note).toContain("EC/PPM: 1.4");
      expect(r.payload.p_note).toContain("Nutrients: CalMag");
    }
  });

  it("isSupportedLegacyEventType only accepts watering/observation/note", () => {
    expect(isSupportedLegacyEventType("watering")).toBe(true);
    expect(isSupportedLegacyEventType("observation")).toBe(true);
    expect(isSupportedLegacyEventType("note")).toBe(true);
    expect(isSupportedLegacyEventType("photo")).toBe(false);
    expect(isSupportedLegacyEventType("feeding")).toBe(false);
    expect(isSupportedLegacyEventType("training")).toBe(false);
    expect(isSupportedLegacyEventType("reminder")).toBe(false);
  });

  it("appendLegacyDetailsToNote returns base note unchanged when no extras", () => {
    expect(appendLegacyDetailsToNote("hi", baseInput.details)).toBe("hi");
  });
});

describe("legacyQuickLogUnifiedSave — static safety", () => {
  it("QuickLog.tsx must not insert into diary_entries or grow_events directly", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/components/QuickLog.tsx", "utf8");
    expect(src).not.toMatch(/\.from\(\s*["']diary_entries["']\s*\)\s*\.insert/);
    expect(src).not.toMatch(/\.from\(\s*["']grow_events["']\s*\)\s*\.insert/);
  });
});
