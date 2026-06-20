/**
 * Tests — Quick Log default timestamps.
 *
 * Pure helper tests. No I/O, no model calls, no Supabase writes.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyFastAddTimestampDefaults,
  buildFastAddTimestampDefaults,
  resolveFastAddIntent,
} from "../lib/fastAddActionRules";

const FIXED = new Date("2026-06-04T10:00:00.000Z");
const now = () => FIXED;

describe("buildFastAddTimestampDefaults", () => {
  it.each([
    ["diary_note"],
    ["watering"],
    ["feeding"],
    ["training"],
    ["photo"],
    ["harvest"],
  ] as const)("defaults occurred_at to now for %s", (id) => {
    const d = buildFastAddTimestampDefaults(id, now);
    expect(d.occurred_at).toBe(FIXED.toISOString());
    expect(d.captured_at).toBeUndefined();
  });

  it("Environment defaults both captured_at and occurred_at", () => {
    const d = buildFastAddTimestampDefaults("environment", now);
    expect(d.occurred_at).toBe(FIXED.toISOString());
    expect(d.captured_at).toBe(FIXED.toISOString());
  });

  it("Diagnosis returns no timestamps (navigation-only)", () => {
    expect(buildFastAddTimestampDefaults("diagnosis", now)).toEqual({});
  });
});

describe("resolveFastAddIntent — defaults flow into Quick Log prefill", () => {
  const ctx = { plantId: "p1", tentId: null, growId: "g1" };

  it("includes occurred_at in prefill for watering", () => {
    const intent = resolveFastAddIntent("watering", ctx, { now });
    expect(intent.kind).toBe("open-quicklog");
    if (intent.kind === "open-quicklog") {
      expect(intent.prefill.occurred_at).toBe(FIXED.toISOString());
    }
  });

  it("includes captured_at + occurred_at for environment", () => {
    const intent = resolveFastAddIntent("environment", ctx, { now });
    if (intent.kind === "open-quicklog") {
      expect(intent.prefill.captured_at).toBe(FIXED.toISOString());
      expect(intent.prefill.occurred_at).toBe(FIXED.toISOString());
    }
  });

  it("Diagnosis does not trigger a model/API call — navigate only", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never);
    const intent = resolveFastAddIntent("diagnosis", ctx, { now });
    expect(intent.kind).toBe("navigate");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("applyFastAddTimestampDefaults — never overwrites user edits", () => {
  it("preserves user-edited occurred_at", () => {
    const existing = { occurred_at: "2026-01-01T00:00:00.000Z" };
    const out = applyFastAddTimestampDefaults(existing, {
      occurred_at: FIXED.toISOString(),
    });
    expect(out.occurred_at).toBe("2026-01-01T00:00:00.000Z");
  });
  it("fills missing occurred_at with default", () => {
    const out = applyFastAddTimestampDefaults(
      {} as { occurred_at?: string; captured_at?: string },
      { occurred_at: FIXED.toISOString() },
    );
    expect(out.occurred_at).toBe(FIXED.toISOString());
  });
  it("preserves user-edited captured_at", () => {
    const out = applyFastAddTimestampDefaults(
      { captured_at: "2026-01-01T00:00:00.000Z" },
      { captured_at: FIXED.toISOString() },
    );
    expect(out.captured_at).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("fastAddActionRules — static safety", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../lib/fastAddActionRules.ts"),
    "utf8",
  );
  it("performs no writes / network / device control", () => {
    expect(SRC).not.toMatch(/service_role/i);
    expect(SRC).not.toMatch(/bridge_token/i);
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    for (const t of [
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "execute_device",
      "setpoint_write",
      "irrigation_control",
      "auto_apply",
      "autopilot",
      "scheduler.run",
      "action_queue",
    ]) {
      expect(SRC).not.toContain(t);
    }
  });
});
