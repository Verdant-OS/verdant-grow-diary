import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  normalizeDiaryEntries,
  type NormalizedDiaryEntry,
} from "@/lib/diaryEntryRules";
import { buildFeedingHistory } from "@/lib/feedingHistoryRules";
import { typedWateringWriteEnabled } from "@/lib/featureFlags";
import { findMatches } from "./testFileSearchRules";

const REPO_ROOT = process.cwd();

function normalize(raw: unknown[]): NormalizedDiaryEntry[] {
  return normalizeDiaryEntries({ rawEntries: raw });
}

const validFeeding = {
  id: "f1",
  grow_id: "g1",
  plant_id: "p1",
  tent_id: "t1",
  stage: "veg",
  entry_at: "2025-05-10T12:00:00.000Z",
  entry_type: "feeding",
  note: "Fed full-strength veg mix.",
  photo_url: null,
  details: {
    watering_amount_ml: 750,
    ph: 6.0,
    ec: 1.8,
    runoff_ph: 6.2,
    runoff_ec: 2.0,
    nutrients: [
      { name: "Grow A", amount: 2, unit: "ml/L" },
      { name: "Grow B", amount: 2, unit: "ml/L" },
    ],
    recipe: "Veg Week 3",
  },
};

describe("buildFeedingHistory", () => {
  it("derives a feeding row from a valid diary entry", () => {
    const rows = buildFeedingHistory(normalize([validFeeding]));
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.id).toBe("f1");
    expect(r.plantId).toBe("p1");
    expect(r.tentId).toBe("t1");
    expect(r.volumeMl).toBe(750);
    expect(r.ph).toBe(6);
    expect(r.ec).toBe(1.8);
    expect(r.runoffPh).toBe(6.2);
    expect(r.runoffEc).toBe(2.0);
    expect(r.recipe).toBe("Veg Week 3");
    expect(r.nutrients.map((n) => n.name)).toEqual(["Grow A", "Grow B"]);
    expect(r.nutrients[0].amount).toBe(2);
    expect(r.nutrients[0].unit).toBe("ml/L");
    expect(r.notePreview).toContain("Fed");
    expect(r.warnings).toEqual([]);
    expect(r.occurredAt).toBe("2025-05-10T12:00:00.000Z");
  });

  it("returns empty array for empty input", () => {
    expect(buildFeedingHistory([])).toEqual([]);
    expect(buildFeedingHistory(normalize([]))).toEqual([]);
  });

  it("non-feeding entries (notes, watering) are excluded", () => {
    const note = {
      ...validFeeding,
      id: "n1",
      entry_type: "note",
      details: {},
    };
    const watering = {
      ...validFeeding,
      id: "w1",
      entry_type: "watering",
      details: { watering_amount_ml: 500, ph: 6.3 },
    };
    const rows = buildFeedingHistory(normalize([note, watering]));
    expect(rows).toEqual([]);
  });

  it("malformed feeding entry surfaces as a row with warnings (not dropped)", () => {
    const bad = {
      ...validFeeding,
      id: "bad1",
      details: {
        watering_amount_ml: 0,
        ph: 99,
        ec: -1,
        runoff_ph: -2,
        runoff_ec: -5,
        nutrients: "not-an-array",
      },
    };
    const rows = buildFeedingHistory(normalize([bad]));
    expect(rows).toHaveLength(1);
    expect(rows[0].warnings.length).toBeGreaterThan(0);
    const joined = rows[0].warnings.join("|");
    expect(joined).toMatch(/volume|ph|ec|nutrients/i);
  });

  it("invalid pH appears as a warning", () => {
    const e = {
      ...validFeeding,
      id: "ph1",
      details: { watering_amount_ml: 500, ph: 15, nutrients: validFeeding.details.nutrients },
    };
    const rows = buildFeedingHistory(normalize([e]));
    expect(rows).toHaveLength(1);
    expect(rows[0].warnings.join("|")).toMatch(/ph/i);
  });

  it("invalid EC appears as a warning", () => {
    const e = {
      ...validFeeding,
      id: "ec1",
      details: { watering_amount_ml: 500, ec: -3, nutrients: validFeeding.details.nutrients },
    };
    const rows = buildFeedingHistory(normalize([e]));
    expect(rows).toHaveLength(1);
    expect(rows[0].warnings.join("|")).toMatch(/ec/i);
  });

  it("invalid volume appears as a warning", () => {
    const e = {
      ...validFeeding,
      id: "v1",
      details: { watering_amount_ml: 0, nutrients: validFeeding.details.nutrients },
    };
    const rows = buildFeedingHistory(normalize([e]));
    expect(rows).toHaveLength(1);
    expect(rows[0].warnings.join("|")).toMatch(/volume/i);
  });

  it("nutrient and recipe fields render safely (missing/odd values do not throw)", () => {
    const e = {
      ...validFeeding,
      id: "nut1",
      details: {
        watering_amount_ml: 500,
        nutrients: [
          { name: "CalMag" }, // no amount/unit
          { name: "", amount: 1 }, // blank name → dropped
          "Plain string nutrient",
          { amount: 5 }, // no name → dropped
        ],
        recipe: "  ",
      },
    };
    const rows = buildFeedingHistory(normalize([e]));
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.recipe).toBeNull();
    const names = r.nutrients.map((n) => n.name);
    expect(names).toContain("CalMag");
    expect(names).toContain("Plain string nutrient");
    expect(names).not.toContain("");
    for (const n of r.nutrients) {
      expect(typeof n.name).toBe("string");
      expect(n.name.length).toBeGreaterThan(0);
      expect(n.amount === null || typeof n.amount === "number").toBe(true);
      expect(n.unit === null || typeof n.unit === "string").toBe(true);
    }
  });

  it("orders rows newest-first deterministically", () => {
    const a = { ...validFeeding, id: "a", entry_at: "2025-05-01T00:00:00Z" };
    const b = { ...validFeeding, id: "b", entry_at: "2025-05-03T00:00:00Z" };
    const c = { ...validFeeding, id: "c", entry_at: "2025-05-02T00:00:00Z" };
    const rows = buildFeedingHistory(normalize([a, b, c]));
    expect(rows.map((r) => r.id)).toEqual(["b", "c", "a"]);
    const rows2 = buildFeedingHistory(normalize([c, a, b]));
    expect(rows2.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("entries with no valid timestamp sort last, stable by id", () => {
    const bad = { ...validFeeding, id: "z", entry_at: "not-a-date" };
    const good = { ...validFeeding, id: "y", entry_at: "2025-05-10T00:00:00Z" };
    const rows = buildFeedingHistory(normalize([bad, good]));
    expect(rows.map((r) => r.id)).toEqual(["y", "z"]);
  });
});

describe("FeedingHistoryPanel runtime safety", () => {
  it("typedWateringWriteEnabled remains false", () => {
    expect(typedWateringWriteEnabled).toBe(false);
  });

  it("no runtime code calls create_watering_event RPC", () => {
    const hits = findMatches(["src"], "create_watering_event")
      .filter((path) => path !== "src/integrations/supabase/types.ts")
      .filter((path) => path !== "src/lib/quickLogTypedEventPayloadRules.ts")
      .filter((path) => path !== "src/lib/writeWateringTypedEvent.ts")
      .filter((path) => path !== "src/lib/featureFlags.ts")
      .filter((path) => !path.startsWith("src/test/"));
    expect(hits).toEqual([]);
  });

  it("FeedingHistoryPanel does not read raw diary details JSON or perform writes", () => {
    const src = readFileSync(
      resolve(REPO_ROOT, "src/components/FeedingHistoryPanel.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/\.details\?\./);
    expect(src).not.toMatch(/\["details"\]/);
    expect(src).not.toMatch(/JSON\.parse/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
    expect(src).not.toMatch(/create_watering_event/);
    expect(src).not.toMatch(/service_role/i);
  });
});
