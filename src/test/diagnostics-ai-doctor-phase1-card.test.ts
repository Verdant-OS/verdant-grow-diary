/**
 * Diagnostics page — AI Doctor Phase 1 internal preview card.
 *
 * Static source-level assertions only (no rendering). Verifies that the
 * internal Diagnostics page exposes a discoverable card linking to the
 * read-only Phase 1 preview, with required labels and the docs reference,
 * without introducing model calls, writes, or device-control copy in the
 * new section.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE = "src/pages/Diagnostics.tsx";

function read(p: string): string {
  return readFileSync(resolve(ROOT, p), "utf8");
}

describe("Diagnostics — AI Doctor Phase 1 preview card", () => {
  const src = read(PAGE);

  it("includes an Internal previews section", () => {
    expect(src).toMatch(/Internal previews/);
    expect(src).toMatch(/internal-previews-heading/);
  });

  it("includes the AI Doctor Phase 1 Preview card title", () => {
    expect(src).toMatch(/AI Doctor Phase 1 Preview/);
  });

  it("includes the read-only / static / internal labels", () => {
    expect(src).toMatch(/Internal/);
    expect(src).toMatch(/Static demo data/);
    expect(src).toMatch(/Read-only/);
  });

  it("includes the required description copy", () => {
    expect(src).toMatch(/No\s+model calls/);
    expect(src).toMatch(/no writes/);
    expect(src).toMatch(/no device control/);
  });

  it("references the contract docs path", () => {
    expect(src).toMatch(/docs\/ai-doctor-phase1-contract\.md/);
  });

  it("links to the internal preview route", () => {
    expect(src).toMatch(/\/internal\/ai-doctor-phase1-preview/);
  });

  it("does not introduce forbidden device-control or write copy in the new section", () => {
    // Sanity scan over the preview-card region only.
    const start = src.indexOf("internal-previews-heading");
    expect(start).toBeGreaterThan(-1);
    const region = src.slice(start);
    expect(region).not.toMatch(/turnOn|turnOff|sendCommand|controlDevice/i);
    expect(region).not.toMatch(/action_queue/);
    expect(region).not.toMatch(/functions\.invoke/);
    expect(region).not.toMatch(/fetch\s*\(/);
    expect(region).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(region).not.toMatch(/\bApprove\b|\bExecute\b|\bDose\b/);
  });
});
