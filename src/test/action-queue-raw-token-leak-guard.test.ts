/**
 * Bug #1 / #2 regression guard — raw internal tokens must never appear
 * in grower-facing copy.
 *
 *  - #1: AI Doctor / AI Coach annotate prompts with `LATEST_SENSOR_SNAPSHOT`.
 *        When the model echoes that token back into `suggested_change` /
 *        `reason`, the Action Queue presenter MUST replace it with a
 *        human phrase before render.
 *  - #2: The Quick Log photo empty-state previously mentioned the
 *        internal `grow_events` table. Grower-facing copy must be calm
 *        and free of schema/writer terminology.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sanitizeActionCopy } from "@/lib/actionQueueRowView";

describe("sanitizeActionCopy — Bug #1 (LATEST_SENSOR_SNAPSHOT leak)", () => {
  it("replaces the bare token with a human phrase", () => {
    const out = sanitizeActionCopy(
      "VPD 0.885 in LATEST_SENSOR_SNAPSHOT remains low.",
    );
    expect(out).not.toContain("LATEST_SENSOR_SNAPSHOT");
    expect(out).toContain("the latest sensor snapshot");
    expect(out).toBe("VPD 0.885 in the latest sensor snapshot remains low.");
  });

  it("strips the [source=..., stale=..., trust=...] annotation block", () => {
    const out = sanitizeActionCopy(
      "LATEST_SENSOR_SNAPSHOT [source=manual, stale=false, trust=medium]: temp=76°F",
    );
    expect(out).not.toMatch(/LATEST_SENSOR_SNAPSHOT/);
    expect(out).not.toMatch(/\[source=/);
    expect(out).toContain("the latest sensor snapshot");
    expect(out).toContain("temp=76°F");
  });

  it("is a no-op for clean copy", () => {
    expect(sanitizeActionCopy("Raise the light by 10 cm")).toBe(
      "Raise the light by 10 cm",
    );
  });

  it("safely handles null / undefined / empty", () => {
    expect(sanitizeActionCopy(null)).toBe("");
    expect(sanitizeActionCopy(undefined)).toBe("");
    expect(sanitizeActionCopy("")).toBe("");
  });
});

describe("Bug #1 — Action Queue render sites wire sanitizeActionCopy", () => {
  const READ = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
  const QUEUE = READ("src/pages/ActionQueue.tsx");
  const DETAIL = READ("src/pages/ActionDetail.tsx");
  const DASH = READ("src/pages/Dashboard.tsx");

  it("ActionQueue list wraps suggested_change + reason through sanitizeActionCopy", () => {
    expect(QUEUE).toMatch(/sanitizeActionCopy\(\s*row\.suggested_change\s*\)/);
    expect(QUEUE).toMatch(
      /sanitizeActionCopy\(\s*stripBackPointerTokens\(\s*row\.reason\s*\)\s*\)/,
    );
  });

  it("ActionDetail header wraps suggested_change + reason through sanitizeActionCopy", () => {
    expect(DETAIL).toMatch(/sanitizeActionCopy\(\s*row\.suggested_change\s*\)/);
    expect(DETAIL).toMatch(
      /sanitizeActionCopy\(\s*stripBackPointerTokens\(\s*row\.reason\s*\)\s*\)/,
    );
  });

  it("Dashboard approval queue card wraps suggested_change + reason", () => {
    expect(DASH).toMatch(/sanitizeActionCopy\(\s*a\.suggested_change\s*\)/);
    expect(DASH).toMatch(/sanitizeActionCopy\(\s*a\.reason\s*\)/);
  });

  it("no Action Queue render site leaves a raw LATEST_SENSOR_SNAPSHOT token in JSX text", () => {
    for (const src of [QUEUE, DETAIL, DASH]) {
      expect(src).not.toContain("LATEST_SENSOR_SNAPSHOT");
    }
  });
});

describe("Bug #2 — Quick Log presenter copy stays grower-safe", () => {
  const QL = readFileSync(
    resolve(__dirname, "../..", "src/components/QuickLog.tsx"),
    "utf8",
  );

  it("never leaks internal prompt / implementation tokens to the grower", () => {
    expect(QL).not.toMatch(/LATEST_SENSOR_SNAPSHOT/);
    expect(QL).not.toMatch(/\bunified_plant_analysis\b/);
  });
});
