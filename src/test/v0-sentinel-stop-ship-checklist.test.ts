/**
 * V0 Sentinel stop-ship checklist — static safety test.
 *
 * Asserts that docs/v0-sentinel-stop-ship-checklist.md exists and
 * contains every hard stop-ship rule listed in the Verdant V0 spec.
 * This test is intentionally read-only and does not exercise any
 * runtime behavior, network, Supabase, or model calls.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CHECKLIST_PATH = resolve(
  process.cwd(),
  "docs/v0-sentinel-stop-ship-checklist.md",
);

const REQUIRED_STOP_SHIP_PHRASES: readonly string[] = [
  "Auth loading smoke is red",
  "One-Tent Loop smoke is red",
  "EcoWitt-only safety scan is red",
  "fake live",
  "Invalid or stale telemetry rendered as healthy",
  "Automatic Action Queue creation or device action",
  "service_role",
  "bridge token",
  "Sensor evidence missing a source label",
];

const REQUIRED_SOURCE_LABELS: readonly string[] = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
];

const REQUIRED_COMMANDS: readonly string[] = [
  "bun run test:one-tent-loop-smoke",
  "node scripts/assert-ecowitt-only-sensor-direction.mjs",
  "chromium-mocked",
];

describe("V0 Sentinel stop-ship checklist", () => {
  it("exists at docs/v0-sentinel-stop-ship-checklist.md", () => {
    expect(existsSync(CHECKLIST_PATH)).toBe(true);
  });

  const body = existsSync(CHECKLIST_PATH)
    ? readFileSync(CHECKLIST_PATH, "utf8")
    : "";

  it.each(REQUIRED_STOP_SHIP_PHRASES)(
    "documents stop-ship rule containing %j",
    (phrase) => {
      expect(body).toContain(phrase);
    },
  );

  it("lists every allowed sensor source label", () => {
    for (const label of REQUIRED_SOURCE_LABELS) {
      expect(body).toContain(label);
    }
  });

  it.each(REQUIRED_COMMANDS)(
    "references required local command containing %j",
    (cmd) => {
      expect(body).toContain(cmd);
    },
  );

  it("never says invalid/stale telemetry is healthy", () => {
    // Defensive: the checklist itself must not contradict its own rule.
    expect(/stale\s+as\s+healthy/i.test(body)).toBe(false);
    expect(/invalid\s+as\s+healthy/i.test(body)).toBe(false);
  });

  it("never describes demo/manual/stale/invalid as live", () => {
    expect(/demo\s+(data\s+)?as\s+live/i.test(body)).toBe(false);
    expect(/manual\s+(data\s+)?as\s+live/i.test(body)).toBe(false);
  });

  it("does not leak service_role or bridge token values", () => {
    // The doc names the concepts but must not contain key-like material.
    expect(/eyJ[A-Za-z0-9_-]{20,}/.test(body)).toBe(false);
    expect(/sbp_[A-Za-z0-9]{20,}/.test(body)).toBe(false);
  });
});
