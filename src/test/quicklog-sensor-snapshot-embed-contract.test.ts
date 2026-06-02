/**
 * Static contract test: QuickLog.tsx embeds the new labeling fields
 * (source + state) on its `details.sensor_snapshot` payload via the
 * pure helper, and does not regress to an unlabeled embed.
 *
 * This avoids spinning up the heavy QuickLog dialog while still pinning
 * the integration point. Behavior of the helper itself is covered in
 * quicklog-sensor-snapshot-labeling.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../../src/components/QuickLog.tsx"),
  "utf8",
);

describe("QuickLog sensor_snapshot labeling integration", () => {
  it("imports the pure labeling helper", () => {
    expect(SRC).toMatch(
      /import\s*{\s*classifyQuickLogSnapshotSource\s*}\s*from\s*["']@\/lib\/quickLogSensorSnapshotRules["']/,
    );
  });

  it("invokes classifyQuickLogSnapshotSource before embedding", () => {
    const idxClassify = SRC.indexOf("classifyQuickLogSnapshotSource(");
    const idxEmbed = SRC.indexOf("cleanDetails.sensor_snapshot");
    expect(idxClassify).toBeGreaterThan(-1);
    expect(idxEmbed).toBeGreaterThan(-1);
    expect(idxClassify).toBeLessThan(idxEmbed);
  });

  it("attaches source and state fields to the embedded snapshot", () => {
    // Inspect the object literal assigned to cleanDetails.sensor_snapshot.
    const embedStart = SRC.indexOf("cleanDetails.sensor_snapshot");
    expect(embedStart).toBeGreaterThan(-1);
    const slice = SRC.slice(embedStart, embedStart + 800);
    expect(slice).toMatch(/source:\s*snapshotSource/);
    expect(slice).toMatch(/state:\s*snapshotState/);
  });

  it("keeps existing snapshot fields intact (no regression)", () => {
    const embedStart = SRC.indexOf("cleanDetails.sensor_snapshot");
    const slice = SRC.slice(embedStart, embedStart + 800);
    for (const field of ["ts:", "tent_id:", "temp:", "rh:", "vpd:", "co2:", "soil:", "available_metrics:"]) {
      expect(slice, `missing field ${field}`).toContain(field);
    }
  });

  it("does not add reject/drop logic in this slice", () => {
    // The slice is additive labeling only — embed must still happen for
    // every snapshot path. No early-return that skips assignment based
    // on the new state.
    const embedStart = SRC.indexOf("cleanDetails.sensor_snapshot");
    const sliceBefore = SRC.slice(Math.max(0, embedStart - 600), embedStart);
    expect(sliceBefore).not.toMatch(/state\s*===\s*["']invalid["']\s*\)\s*{[^}]*return/);
    expect(sliceBefore).not.toMatch(/state\s*===\s*["']stale["']\s*\)\s*{[^}]*return/);
  });
});
