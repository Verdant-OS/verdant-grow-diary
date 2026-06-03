/**
 * Static contract test: post-unification, QuickLog does NOT embed a
 * `sensor_snapshot` into any save payload. The sensor strip is
 * presenter-only (renders QuickLogSensorSnapshotStrip) and snapshot
 * values are not persisted via the RPC in this slice.
 *
 * Replaces the legacy embed-labeling contract — the embed surface was
 * removed when the legacy diary_entries write path was retired.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../../src/components/QuickLog.tsx"),
  "utf8",
);

describe("QuickLog sensor snapshot · presenter-only contract", () => {
  it("renders the QuickLogSensorSnapshotStrip presenter component", () => {
    expect(SRC).toMatch(/<QuickLogSensorSnapshotStrip\b/);
    expect(SRC).toMatch(
      /from\s+["']@\/components\/QuickLogSensorSnapshotStrip["']/,
    );
  });

  it("does NOT embed sensor_snapshot into any payload", () => {
    // Legacy embed path (cleanDetails.sensor_snapshot = …) is removed.
    expect(SRC).not.toMatch(/cleanDetails\.sensor_snapshot/);
    expect(SRC).not.toMatch(/sensor_snapshot\s*:/);
  });

  it("does NOT classify/label snapshot for persistence", () => {
    // The persistence-side labeling helper is no longer used by QuickLog.
    expect(SRC).not.toMatch(/classifyQuickLogSnapshotSource\s*\(/);
    expect(SRC).not.toMatch(/shouldEmbedSnapshot\s*\(/);
  });

  it("does NOT introduce any new write/persistence for snapshot values", () => {
    expect(SRC).not.toMatch(
      /\.from\(\s*["']sensor_readings["']\s*\)\s*\.insert/,
    );
    expect(SRC).not.toMatch(/\.from\(\s*["']diary_entries["']\s*\)\.insert/);
  });
});
