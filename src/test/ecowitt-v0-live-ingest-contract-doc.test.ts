import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(__dirname, "../../docs/ecowitt-v0-live-ingest-contract.md");

describe("ecowitt v0 live ingest contract doc", () => {
  it("exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const doc = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";
  const lower = doc.toLowerCase();

  it("lists canonical source labels", () => {
    for (const src of ["live", "manual", "csv", "demo", "stale", "invalid"]) {
      expect(lower).toContain(src);
    }
  });

  it("documents source=\"live\" rule and raw_payload lineage", () => {
    expect(doc).toContain('source="live"');
    expect(doc).toContain("raw_payload");
    expect(lower).toContain("vendor");
    expect(lower).toContain("transport_source");
  });

  it("documents dedupe index / upsert contract", () => {
    expect(lower).toContain("dedupe index");
    expect(lower).toContain("upsert");
    expect(lower).toContain("non-partial");
    expect(lower).toContain("conflict target");
  });

  it("contains required safety rules", () => {
    expect(lower).toContain("no fake live data");
    expect(lower).toContain("no device control");
    expect(lower).toContain("no trigger-forward");
    expect(lower).toContain("no blind automation");
    expect(lower).toContain("no action queue");
    expect(lower).toContain("no alert creation");
  });

  it("includes the regression checklist sections", () => {
    for (const section of [
      "### Bridge",
      "### Edge / webhook",
      "### Database",
      "### UI",
      "### AI Doctor readiness",
      "### Safety",
    ]) {
      expect(doc).toContain(section);
    }
  });

  it("lists validation commands", () => {
    expect(doc).toContain("bunx vitest run");
    expect(doc).toContain("bun run test:edge:sensor-ingest-webhook");
    expect(doc).toContain("bun run typecheck");
    expect(doc).toContain("python3 -m unittest");
  });

  it("does not leak secret-shaped strings", () => {
    expect(doc).not.toMatch(/PASSKEY\s*[:=]\s*\S+/);
    expect(doc).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{8,}/);
    expect(doc).not.toMatch(/vbt_[A-Za-z0-9]{6,}/);
  });
});
