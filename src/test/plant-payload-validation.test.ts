import { describe, expect, it } from "vitest";
import {
  validatePlantInsertPayload,
  validatePlantRowResponse,
  filterValidPlantRows,
} from "@/lib/plantPayloadValidation";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

describe("validatePlantInsertPayload", () => {
  const base = {
    user_id: UUID_A,
    name: "Blue Dream #1",
    strain: "Blue Dream",
    stage: "seedling",
    health: "healthy",
    plant_type: "unknown",
  };

  it("accepts a canonical payload", () => {
    const r = validatePlantInsertPayload(base);
    expect(r.ok).toBe(true);
    expect(r.value?.plant_type).toBe("unknown");
  });

  it("rejects a missing name", () => {
    const r = validatePlantInsertPayload({ ...base, name: "   " });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/name/i);
  });

  it("rejects unknown stage/health", () => {
    expect(validatePlantInsertPayload({ ...base, stage: "bloom" }).ok).toBe(false);
    expect(validatePlantInsertPayload({ ...base, health: "great" }).ok).toBe(false);
  });

  it("canonicalizes plant_type synonyms before validating", () => {
    const r = validatePlantInsertPayload({ ...base, plant_type: "Auto " });
    expect(r.ok).toBe(true);
    expect(r.value?.plant_type).toBe("autoflower");
  });

  it("defaults missing plant_type to unknown (never silently photoperiod)", () => {
    const { plant_type: _pt, ...rest } = base;
    const r = validatePlantInsertPayload(rest);
    expect(r.ok).toBe(true);
    expect(r.value?.plant_type).toBe("unknown");
  });

  it("rejects a non-uuid user_id", () => {
    expect(validatePlantInsertPayload({ ...base, user_id: "not-uuid" }).ok).toBe(false);
  });
});

describe("validatePlantRowResponse", () => {
  it("rejects null/undefined rows", () => {
    expect(validatePlantRowResponse(null).ok).toBe(false);
    expect(validatePlantRowResponse(undefined).ok).toBe(false);
  });

  it("rejects rows missing plant_type entirely", () => {
    const r = validatePlantRowResponse({ id: UUID_A, name: "P" });
    expect(r.ok).toBe(false);
  });

  it("repairs unrecognized plant_type values to unknown", () => {
    const r = validatePlantRowResponse({ id: UUID_A, name: "P", plant_type: "hybrid" });
    expect(r.ok).toBe(true);
    expect(r.value?.plant_type).toBe("unknown");
  });

  it("passes through valid rows", () => {
    const r = validatePlantRowResponse({ id: UUID_A, name: "P", plant_type: "autoflower" });
    expect(r.ok).toBe(true);
    expect(r.value?.plant_type).toBe("autoflower");
  });
});

describe("filterValidPlantRows", () => {
  it("drops malformed rows and reports the count", () => {
    const rows = [
      { id: UUID_A, name: "Good", plant_type: "photoperiod" },
      { id: UUID_B, name: "Missing type" },
      { id: "bad-id", name: "Bad id", plant_type: "autoflower" },
    ] as Array<Record<string, unknown>>;
    const r = filterValidPlantRows(rows);
    expect(r.valid).toHaveLength(1);
    expect(r.rejected).toBe(2);
  });

  it("returns empty result for empty input", () => {
    expect(filterValidPlantRows([]).rejected).toBe(0);
    expect(filterValidPlantRows(null).rejected).toBe(0);
  });
});
