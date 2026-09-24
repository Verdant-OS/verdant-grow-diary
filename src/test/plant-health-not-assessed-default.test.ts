/**
 * QA 2026-09-24, BUG-009: new plants were stored and shown as "healthy" with
 * zero evidence — the plants.health column defaulted to 'healthy' and the
 * create forms preselected Healthy.
 *
 * The migration behaviour itself (default 'unknown', 'unknown' accepted, NOT
 * NULL kept, bogus values and stages still rejected, existing rows untouched,
 * re-apply harmless, and the pre-apply trigger rejecting 'unknown') was proven
 * against PostgreSQL 16 while authoring; the replay CI lanes apply it on every
 * run. These tests pin the file's shape and the client contract that makes it
 * safe to publish before the operator applies it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePlantInsertPayload } from "@/lib/plantPayloadValidation";
import {
  PLANT_HEALTH_NOT_ASSESSED_LABEL,
  buildPlantHealthUpdate,
  normalizePlantHealth,
} from "@/lib/plantHealthRules";
import { buildStartRoomPlantPayload, DEFAULT_START_YOUR_ROOM_FORM } from "@/lib/startYourRoomRules";

const MIGRATION = "supabase/migrations/20260924120000_plants_health_unassessed_default.sql";

function executableSql(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  name: "Plant A",
  stage: "seedling",
  plant_type: "unknown",
  grow_id: "33333333-3333-4333-8333-333333333333",
};

describe("plants.health migration shape", () => {
  // @source-scan-justified: a SQL migration has no resolvable value in vitest;
  // its runtime behaviour is exercised by the local-replay CI lanes.
  const sql = executableSql(MIGRATION);

  it("accepts 'unknown' and makes it the default", () => {
    expect(sql).toMatch(/IF NEW\.health NOT IN \('healthy','watch','issue','unknown'\) THEN/);
    expect(sql).toMatch(/ALTER TABLE public\.plants ALTER COLUMN health SET DEFAULT 'unknown';/);
  });

  it("keeps the stage check and NOT NULL, and never rewrites existing rows", () => {
    expect(sql).toMatch(
      /IF NEW\.stage NOT IN \('seedling','veg','flower','flush','harvest','cure'\) THEN/,
    );
    expect(sql).not.toMatch(/DROP NOT NULL/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.plants/i);
    expect(sql).not.toMatch(/DROP\s+(TRIGGER|FUNCTION)/i);
  });
});

describe("client never claims or writes health it did not assess", () => {
  it("omits health when not assessed and never sends 'unknown'", () => {
    expect(buildPlantHealthUpdate("")).toEqual({});
    expect(buildPlantHealthUpdate("unknown")).toEqual({});
    expect(buildPlantHealthUpdate("watch")).toEqual({ health: "watch" });
    expect(PLANT_HEALTH_NOT_ASSESSED_LABEL).toBe("Not assessed yet");
  });

  it("insert validation accepts an omitted health and still rejects 'unknown'", () => {
    expect(validatePlantInsertPayload({ ...base }).ok).toBe(true);
    expect(validatePlantInsertPayload({ ...base, health: "issue" }).ok).toBe(true);
    // The pre-apply trigger rejects 'unknown'; the client must never send it.
    expect(validatePlantInsertPayload({ ...base, health: "unknown" }).ok).toBe(false);
    expect(validatePlantInsertPayload({ ...base, health: "great" }).ok).toBe(false);
  });

  it("guided setup plants are created without a health claim", () => {
    const payload = buildStartRoomPlantPayload(
      { ...DEFAULT_START_YOUR_ROOM_FORM, plantName: "Plant A" },
      { growId: "g1", tentId: "t1", plantId: null },
    );
    expect(payload).not.toBeNull();
    expect(payload).not.toHaveProperty("health");
    // @source-scan-justified: the starter adapter's insert needs a live client.
    const adapter = readFileSync(
      resolve(process.cwd(), "src/lib/starterSetupSupabaseAdapter.ts"),
      "utf8",
    );
    expect(adapter).not.toMatch(/health:\s*"healthy"/);
  });

  it("a stored 'unknown' reads as not assessed", () => {
    expect(normalizePlantHealth("unknown")).toBe("unknown");
    expect(normalizePlantHealth("healthy")).toBe("healthy");
  });
});
