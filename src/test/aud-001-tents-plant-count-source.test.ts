/**
 * AUD-001: Tents page must derive plant counts from the real (Supabase)
 * plants table, not from mock plants. Mock plants reference mock tent ids
 * like "t1", which never match real tent UUIDs and produce 0-plant counts
 * for every real tent.
 *
 * This is a static-safety test on the source: it pins the data source used
 * by the Tents page so a future refactor cannot silently regress to mock
 * plants.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../pages/Tents.tsx"),
  "utf8",
);

describe("AUD-001 — Tents page uses real plants for plant count", () => {
  it("does NOT import usePlants from the mock data hook", () => {
    expect(SRC).not.toMatch(/usePlants\s*[,}]/);
    expect(SRC).not.toMatch(/usePlants\s*\(/);
  });

  it("imports useGrowPlants from the real grow-data hook", () => {
    expect(SRC).toMatch(/useGrowPlants/);
    expect(SRC).toMatch(/from\s+["']@\/hooks\/useGrowData["']/);
  });

  it("filters the plants list by tent id when rendering each card", () => {
    expect(SRC).toMatch(/plants\.filter\(\s*\([a-z]\)\s*=>\s*[a-z]\.tentId\s*===\s*[a-z]\.id\s*\)/);
  });
});
