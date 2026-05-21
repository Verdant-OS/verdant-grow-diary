/**
 * Contract test for docs/grow-os-architecture.md.
 *
 * Pins the architectural contract for the grower-facing Grow OS so future
 * refactors don't quietly drop the Live/Manual/Demo/Stale/Unavailable
 * sensor labeling rule, the useGrowData mock-fallback disclosure, the
 * Leads admin-only boundary, or the AI safety contract.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(process.cwd(), "docs/grow-os-architecture.md");

describe("docs/grow-os-architecture.md — contract", () => {
  it("exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const DOC = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

  it("documents all five sensor label states", () => {
    for (const label of ["Live", "Manual", "Demo", "Stale", "Unavailable"]) {
      expect(DOC).toContain(label);
    }
  });

  it("documents the useGrowData mock-fallback risk", () => {
    expect(DOC).toMatch(/useGrowData/);
    expect(DOC).toMatch(/silent.*mock.*fallback|mock-fallback|silently falls back to mock/i);
  });

  it("documents useMockData as a mock surface", () => {
    expect(DOC).toMatch(/useMockData/);
  });

  it("documents diary_entries as real Supabase-backed", () => {
    expect(DOC).toMatch(/diary_entries/);
  });

  it("documents the diary-photos storage bucket", () => {
    expect(DOC).toMatch(/diary-photos/);
  });

  it("states Leads is separate, internal, admin/operator only", () => {
    expect(DOC).toMatch(/Leads/);
    expect(DOC).toMatch(/separate from Grow OS/i);
    expect(DOC).toMatch(/admin\s*\/\s*operator/i);
    expect(DOC).toMatch(/internal/i);
  });

  it("states mock/demo data must not be presented as live", () => {
    expect(DOC).toMatch(/must never be presented as live/i);
  });

  it("states empty real Supabase results must produce empty states", () => {
    expect(DOC).toMatch(
      /empty real Supabase results\s+must produce empty states/i,
    );
  });

  it("states AI confidence must be limited when context is missing or demo-backed", () => {
    expect(DOC).toMatch(/AI/);
    expect(DOC).toMatch(/must not give high-confidence/i);
    expect(DOC).toMatch(/Demo data must not raise AI confidence/i);
  });
});
