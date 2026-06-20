import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const STRIP = readSource("src/components/QuickLogSensorSnapshotStrip.tsx");

const FORBIDDEN_SIDE_EFFECT_TOKENS = [
  "functions.invoke",
  "action_queue",
  "alerts.insert",
  "device-control",
  "deviceControl",
  "mqtt.connect",
  "publish(",
  "service_role",
];

describe("quick log sensor snapshot badge dedupe", () => {
  it("does not render the trust badge when it duplicates the strip status pill", () => {
    expect(STRIP).toMatch(/function shouldRenderTrustBadge/);
    expect(STRIP).toMatch(/trustLabel\.trim\(\)\.toLowerCase\(\)/);
    expect(STRIP).toMatch(/PILL_LABEL\[status\]\.toLowerCase\(\)/);
    expect(STRIP).toMatch(/showTrustBadge && <SnapshotTrustBadge/);
  });

  it("keeps the canonical strip status pill visible", () => {
    expect(STRIP).toContain('data-testid="quicklog-sensor-snapshot-pill"');
    expect(STRIP).toMatch(/PILL_LABEL\[view\.status\]/);
    expect(STRIP).toMatch(/PILL_ARIA\[view\.status\]/);
  });

  it("keeps provider/source rendering separate from trust status", () => {
    expect(STRIP).toContain('data-testid="quicklog-sensor-snapshot-source"');
    expect(STRIP).toMatch(/Sensor source: \$\{view\.providerLabel\}/);
    expect(STRIP).toMatch(/source: \{view\.providerLabel\}/);
  });

  it("does not weaken sensor snapshot safety copy or navigation-only action", () => {
    expect(STRIP).toContain("This does NOT change the save path.");
    expect(STRIP).toContain('role="note"');
    expect(STRIP).toContain("opens sensors page");
  });

  it("does not introduce writes, AI calls, alerts, action queue, or device control", () => {
    expect(STRIP).not.toMatch(/raw_payload/i);
    expect(STRIP).not.toMatch(/\.insert\(/);
    expect(STRIP).not.toMatch(/\.update\(/);
    expect(STRIP).not.toMatch(/\.delete\(/);
    expect(STRIP).not.toMatch(/\.upsert\(/);
    for (const token of FORBIDDEN_SIDE_EFFECT_TOKENS) {
      expect(STRIP).not.toContain(token);
    }
  });
});
