import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

import {
  normalizeDiaryEntries,
  type NormalizedDiaryEntry,
} from "@/lib/diaryEntryRules";
import { buildWateringHistory } from "@/lib/wateringHistoryRules";
import { typedWateringWriteEnabled } from "@/lib/featureFlags";

const REPO_ROOT = process.cwd();

function rg(args: string[]): string {
  try {
    return execSync(`rg ${args.map((a) => JSON.stringify(a)).join(" ")}`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string };
    if (e && e.status === 1) return "";
    throw err;
  }
}

function normalize(raw: unknown[]): NormalizedDiaryEntry[] {
  return normalizeDiaryEntries({ rawEntries: raw });
}

const validWatering = {
  id: "w1",
  grow_id: "g1",
  plant_id: "p1",
  tent_id: "t1",
  stage: "veg",
  entry_at: "2025-05-10T12:00:00.000Z",
  note: "Watered evenly, slight runoff.",
  photo_url: null,
  details: {
    event_type: "watering",
    watering_amount_ml: 500,
    ph: 6.3,
    ec: 1.4,
    runoff_ph: 6.1,
    runoff_ec: 1.6,
    runoff_ml: 60,
  },
};

describe("buildWateringHistory", () => {
  it("derives a watering row from a valid diary entry", () => {
    const rows = buildWateringHistory(normalize([validWatering]));
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.id).toBe("w1");
    expect(r.plantId).toBe("p1");
    expect(r.tentId).toBe("t1");
    expect(r.volumeMl).toBe(500);
    expect(r.ph).toBe(6.3);
    expect(r.ec).toBe(1.4);
    expect(r.runoffMl).toBe(60);
    expect(r.runoffPh).toBe(6.1);
    expect(r.runoffEc).toBe(1.6);
    expect(r.notePreview).toContain("Watered");
    expect(r.warnings).toEqual([]);
    expect(r.occurredAt).toBe("2025-05-10T12:00:00.000Z");
  });

  it("returns empty array for empty input", () => {
    expect(buildWateringHistory([])).toEqual([]);
    expect(buildWateringHistory(normalize([]))).toEqual([]);
  });

  it("non-watering entries are excluded", () => {
    const notes = {
      ...validWatering,
      id: "n1",
      details: { event_type: "note" },
    };
    const rows = buildWateringHistory(normalize([notes]));
    expect(rows).toEqual([]);
  });

  it("malformed watering entry surfaces as a row with warnings (not dropped)", () => {
    const bad = {
      ...validWatering,
      id: "bad1",
      details: {
        event_type: "watering",
        watering_amount_ml: 0,
        ph: 99,
        ec: -1,
        runoff_ph: -2,
        runoff_ec: -5,
      },
    };
    const rows = buildWateringHistory(normalize([bad]));
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.warnings.length).toBeGreaterThan(0);
    // At least the volume/ph/ec problems must be reported somewhere.
    const joined = r.warnings.join("|");
    expect(joined).toMatch(/volume|ph|ec/i);
  });

  it("invalid pH appears as a warning", () => {
    const e = {
      ...validWatering,
      id: "ph1",
      details: { event_type: "watering", watering_amount_ml: 500, ph: 15 },
    };
    const rows = buildWateringHistory(normalize([e]));
    expect(rows).toHaveLength(1);
    expect(rows[0].warnings.join("|")).toMatch(/ph/i);
  });

  it("invalid EC appears as a warning", () => {
    const e = {
      ...validWatering,
      id: "ec1",
      details: { event_type: "watering", watering_amount_ml: 500, ec: -3 },
    };
    const rows = buildWateringHistory(normalize([e]));
    expect(rows).toHaveLength(1);
    expect(rows[0].warnings.join("|")).toMatch(/ec/i);
  });

  it("invalid volume appears as a warning", () => {
    const e = {
      ...validWatering,
      id: "v1",
      details: { event_type: "watering", watering_amount_ml: 0 },
    };
    const rows = buildWateringHistory(normalize([e]));
    expect(rows).toHaveLength(1);
    expect(rows[0].warnings.join("|")).toMatch(/volume/i);
  });

  it("orders rows newest-first deterministically", () => {
    const a = { ...validWatering, id: "a", entry_at: "2025-05-01T00:00:00Z" };
    const b = { ...validWatering, id: "b", entry_at: "2025-05-03T00:00:00Z" };
    const c = { ...validWatering, id: "c", entry_at: "2025-05-02T00:00:00Z" };
    const rows = buildWateringHistory(normalize([a, b, c]));
    expect(rows.map((r) => r.id)).toEqual(["b", "c", "a"]);
    // Repeatable: shuffled input → same output.
    const rows2 = buildWateringHistory(normalize([c, a, b]));
    expect(rows2.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("entries with no valid timestamp sort last, stable by id", () => {
    const bad = { ...validWatering, id: "z", entry_at: "not-a-date" };
    const good = {
      ...validWatering,
      id: "y",
      entry_at: "2025-05-10T00:00:00Z",
    };
    const rows = buildWateringHistory(normalize([bad, good]));
    expect(rows.map((r) => r.id)).toEqual(["y", "z"]);
  });
});

describe("WateringHistoryPanel runtime safety", () => {
  it("typedWateringWriteEnabled remains false", () => {
    expect(typedWateringWriteEnabled).toBe(false);
  });

  it("no runtime code calls create_watering_event RPC", () => {
    const hits = rg(["-n", "create_watering_event", "src"])
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      // Generated types, pure adapter, disabled helper, docs, and tests are allowed.
      .filter((line) => {
        const path = line.split(":")[0];
        if (path === "src/integrations/supabase/types.ts") return false;
        if (path === "src/lib/quickLogTypedEventPayloadRules.ts") return false;
        if (path === "src/lib/writeWateringTypedEvent.ts") return false;
        if (path.startsWith("src/test/")) return false;
        return true;
      });
    expect(hits).toEqual([]);
  });

  it("WateringHistoryPanel does not read raw diary details JSON", () => {
    const src = readFileSync(
      resolve(REPO_ROOT, "src/components/WateringHistoryPanel.tsx"),
      "utf8",
    );
    // The presenter must consume WateringHistoryRow from the rules layer,
    // never reach into raw `details` blobs.
    expect(src).not.toMatch(/\.details\?\./);
    expect(src).not.toMatch(/\["details"\]/);
    expect(src).not.toMatch(/JSON\.parse/);
    // It also must not perform any Supabase write or call the RPC.
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
    expect(src).not.toMatch(/create_watering_event/);
    expect(src).not.toMatch(/service_role/i);
  });
});
