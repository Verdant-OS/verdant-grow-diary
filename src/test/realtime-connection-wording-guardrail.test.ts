/**
 * Realtime connection wording guardrail.
 *
 * The Supabase Realtime cache-invalidation work for sensor_readings must
 * never surface a connection-state badge that uses the word "Live", and
 * must never render a "Live updating" / heartbeat indicator. Live status
 * is a property of the resolved sensor snapshot (`fresh_live`), never of
 * the realtime channel.
 *
 * Allowed connection-state copy (if/when ever added) is source-neutral:
 *   - "Realtime connected"
 *   - "Connecting to updates…"
 *   - "Realtime updates unavailable"
 *
 * This file scans the realtime-adjacent source files and asserts that
 * none of the forbidden strings have been re-introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

const TARGETED_FILES = [
  "lib/sensor.ts",
  "lib/lastUpdatedAgo.ts",
  "components/SensorSnapshotPreview.tsx",
  "components/QuickLogSensorSnapshotStrip.tsx",
];

// Forbidden phrases — must NEVER appear in realtime-adjacent UI/source.
const FORBIDDEN = [
  /\blive\s*updating\b/i,
  /\blive-updating\b/i,
  /\bheartbeat\b/i,
  /\blive\s+feed\b/i,
  /\bstreaming\s+live\b/i,
];

describe("realtime connection wording guardrail", () => {
  for (const rel of TARGETED_FILES) {
    it(`${rel} contains no fake-live / heartbeat wording`, () => {
      const src = readFileSync(path.join(ROOT, rel), "utf-8");
      for (const re of FORBIDDEN) {
        expect(
          re.test(src),
          `${rel} contains forbidden pattern ${re}`,
        ).toBe(false);
      }
    });
  }

  it("sensor.ts realtime subscription is read-only invalidation only", () => {
    const src = readFileSync(path.join(ROOT, "lib/sensor.ts"), "utf-8");
    expect(src).toMatch(/invalidateQueries/);
    // No client cache mutation / no broadcast publish from this surface.
    expect(src).not.toMatch(/setQueryData\(/);
    expect(src).not.toMatch(/\.send\(/);
    expect(src).not.toMatch(/broadcast/i);
  });

  it("SensorSnapshotPreview separates Last updated from captured_at meta", () => {
    const src = readFileSync(
      path.join(ROOT, "components/SensorSnapshotPreview.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/sensor-snapshot-preview-last-updated/);
    expect(src).toMatch(/sensor-snapshot-preview-meta/);
    // Live label must only come from snapshot.badge_label (resolver), not
    // from any hardcoded "Live updating" / connection string.
    expect(src).not.toMatch(/Live updating/i);
    expect(src).not.toMatch(/Realtime[^"]*Live/i);
  });

  it("scans all sensor-adjacent components for forbidden phrases", () => {
    const dir = path.join(ROOT, "components");
    const entries = readdirSync(dir).filter(
      (f) =>
        /sensor|quicklog/i.test(f) &&
        (f.endsWith(".tsx") || f.endsWith(".ts")),
    );
    for (const f of entries) {
      const src = readFileSync(path.join(dir, f), "utf-8");
      for (const re of FORBIDDEN) {
        expect(
          re.test(src),
          `components/${f} contains forbidden pattern ${re}`,
        ).toBe(false);
      }
    }
  });
});
