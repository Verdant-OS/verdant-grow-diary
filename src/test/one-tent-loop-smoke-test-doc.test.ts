import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOC = resolve(__dirname, "../../docs/one-tent-loop-smoke-test.md");

describe("one-tent-loop smoke test doc", () => {
  it("exists", () => {
    expect(existsSync(DOC)).toBe(true);
  });

  const body = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  const lower = body.toLowerCase();

  it("includes the full One-Tent Loop sequence", () => {
    for (const step of [
      "Grow",
      "Tent",
      "Plant",
      "Quick Log",
      "Timeline",
      "Sensor Snapshot",
      "AI Doctor",
      "Action Queue",
    ]) {
      expect(body).toContain(step);
    }
  });

  it("includes safety language", () => {
    expect(lower).toContain("no fake live data");
    expect(lower).toContain("no device control");
    expect(lower).toContain("approval-required");
    expect(lower).toContain("no blind automation");
    expect(lower).toContain("no alert");
  });

  it("documents regression commands", () => {
    expect(body).toContain("bunx vitest run");
    expect(body).toContain("bun run typecheck");
    expect(body).toContain("bun run test:edge:sensor-ingest-webhook");
    expect(body).toContain("python3 -m unittest");
    expect(body).toContain("scripts/run-ecowitt-v0-validation.mjs");
  });

  it("contains rollback notes", () => {
    expect(lower).toContain("rollback");
  });

  it("does not leak secret-shaped strings", () => {
    expect(body).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{8,}/);
    expect(body).not.toMatch(/vbt_[A-Za-z0-9]{6,}/);
    expect(body).not.toMatch(
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    );
  });
});
