/**
 * Static guardrails for the two live V0-loop bugs fixed in this change:
 *
 *  1) QuickLog submit must invalidate the React Query caches that back
 *     Recent Plant Activity so a just-saved diary entry appears without
 *     a hard refresh.
 *  2) Tent Detail must source its plant list from the real Supabase-backed
 *     `useGrowPlants` hook (not the mock `usePlants`) so a plant assigned
 *     or moved into the tent is actually shown.
 *
 * Source-level only. No rendering, no schema, no Edge Function, no
 * pi-ingest, no automation, no device-control surface.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const QUICKLOG = read("src/components/QuickLog.tsx");
const TENT_DETAIL = read("src/pages/TentDetail.tsx");

describe("Bug 1 · QuickLog invalidates Recent Plant Activity caches", () => {
  it("imports useQueryClient from tanstack/react-query", () => {
    expect(QUICKLOG).toMatch(/useQueryClient/);
    expect(QUICKLOG).toMatch(/from\s+["']@tanstack\/react-query["']/);
  });

  it("invalidates the plant_recent_activity query key after insert", () => {
    expect(QUICKLOG).toMatch(
      /invalidateQueries\(\{\s*queryKey:\s*\["plant_recent_activity"\]/,
    );
  });

  it("invalidates the shared diary_entries query key after insert", () => {
    expect(QUICKLOG).toMatch(
      /invalidateQueries\(\{\s*queryKey:\s*\["diary_entries"\]/,
    );
  });

  it("still writes only to diary_entries (no new write surface)", () => {
    const inserts = [...QUICKLOG.matchAll(/\.from\(["'](\w+)["']\)\s*\.insert/g)];
    expect(inserts.length).toBeGreaterThan(0);
    for (const m of inserts) {
      expect(m[1]).toBe("diary_entries");
    }
  });

  it("does not add automation / device-control / service_role surface", () => {
    expect(QUICKLOG).not.toMatch(
      /service_role|mqtt|home[\s_-]?assistant|relay|actuator|device_command/i,
    );
  });
});

describe("Bug 2 · Tent Detail uses real Supabase-backed plant list", () => {
  it("imports useGrowPlants from useGrowData", () => {
    expect(TENT_DETAIL).toMatch(/useGrowPlants/);
    expect(TENT_DETAIL).toMatch(/from\s+["']@\/hooks\/useGrowData["']/);
  });

  it("no longer pulls usePlants from the mock data hook", () => {
    expect(TENT_DETAIL).not.toMatch(
      /import[^;]*\busePlants\b[^;]*from\s+["']@\/hooks\/useMockData["']/,
    );
  });

  it("calls useGrowPlants scoped to the tent id", () => {
    expect(TENT_DETAIL).toMatch(/useGrowPlants\(\s*id/);
  });
});
