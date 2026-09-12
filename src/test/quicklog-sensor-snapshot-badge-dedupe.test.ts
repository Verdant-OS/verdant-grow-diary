import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { STRIP_NON_ATTACHABLE_DESCRIPTION } from "@/components/QuickLogSensorSnapshotStrip";

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const STRIP = readSource("src/components/QuickLogSensorSnapshotStrip.tsx");

/**
 * Source text with comments removed.
 *
 * A presence-scan over raw source cannot tell a live expression from a
 * sentence describing one, so an assertion satisfied only by a comment
 * stays green after the code it claims to guard is deleted. Codex raised
 * exactly that on #1170: this block asserted two phrases that existed
 * nowhere but the strip's own comments. Copilot then pointed out on #1199
 * that converting only that block left the claim overstated -- every other
 * positive presence check still scanned raw source and could equally be
 * satisfied by a comment.
 *
 * The split is therefore by assertion polarity, not by block: every
 * POSITIVE check -- anything asserting that code is present and must
 * execute -- scans `STRIP_CODE`; raw `STRIP` is used only for the NEGATIVE
 * forbidden-token checks, where a mention inside a comment is still worth
 * failing on.
 */
const STRIP_CODE = STRIP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

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
    expect(STRIP_CODE).toMatch(/function shouldRenderTrustBadge/);
    expect(STRIP_CODE).toMatch(/trustLabel\.trim\(\)\.toLowerCase\(\)/);
    expect(STRIP_CODE).toMatch(/PILL_LABEL\[status\]\.toLowerCase\(\)/);
    expect(STRIP_CODE).toMatch(/showTrustBadge && <SnapshotTrustBadge/);
  });

  it("keeps the canonical strip status pill visible", () => {
    expect(STRIP_CODE).toContain('data-testid="quicklog-sensor-snapshot-pill"');
    expect(STRIP_CODE).toMatch(/PILL_LABEL\[view\.status\]/);
    expect(STRIP_CODE).toMatch(/PILL_ARIA\[view\.status\]/);
  });

  it("keeps provider/source rendering separate from trust status", () => {
    expect(STRIP_CODE).toContain('data-testid="quicklog-sensor-snapshot-source"');
    expect(STRIP_CODE).toMatch(/Sensor source: \$\{view\.providerLabel\}/);
    expect(STRIP_CODE).toMatch(/source: \{view\.providerLabel\}/);
  });

  it("does not weaken sensor snapshot safety copy or navigation-only action", () => {
    // Resolved value, not source text: the pinned non-attachable copy is
    // imported and asserted, so relocating or rewording it fails here.
    expect(STRIP_NON_ATTACHABLE_DESCRIPTION).toBe(
      "This snapshot is view-only and won't be included in this log.",
    );
    // Rendered output, asserted against comment-stripped code so deleting
    // the attribute cannot be masked by the prose that describes it. The
    // behaviour this attribute reports is proven end-to-end in
    // quicklog-attachable-save-gate.test.tsx, which renders the real
    // QuickLog and asserts both this attribute and the copy above.
    expect(STRIP_CODE).toContain("data-attachable=");
    expect(STRIP_CODE).toContain("view.trustBadge.attachable");
    expect(STRIP_CODE).toContain('role="note"');
    expect(STRIP_CODE).toContain("opens sensors page");
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
