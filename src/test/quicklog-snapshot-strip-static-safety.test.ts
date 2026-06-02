/**
 * Static safety: the Quick Log strip component is presenter-only.
 *  - No inline classification rules
 *  - No stale-window math
 *  - No writes
 *  - No device-control / automation language
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../../src/components/QuickLogSensorSnapshotStrip.tsx"),
  "utf8",
);

describe("QuickLogSensorSnapshotStrip static safety", () => {
  it("delegates classification to the adapter — no inline rules", () => {
    expect(SRC).toContain('from "@/lib/quickLogSnapshotStripAdapter"');
    expect(SRC).not.toMatch(/rowsReceived|rowsAccepted|rows_received|rows_accepted/);
    expect(SRC).not.toMatch(/STALE_WINDOW|stale_window|24 \* 60 \* 60/);
    // No direct status math (no string-equals against "fresh_accepted" / "outside_stale_window")
    expect(SRC).not.toMatch(/fresh_accepted|outside_stale_window|none_inserted/);
  });

  it("introduces no writes against backend tables or RPCs", () => {
    for (const pattern of [
      /\.insert\s*\(/,
      /\.upsert\s*\(/,
      /\.update\s*\(/,
      /\.delete\s*\(/,
      /\.rpc\s*\(/,
      /functions\.invoke\s*\(/,
    ]) {
      expect(SRC, `unexpected write-shape: ${pattern}`).not.toMatch(pattern);
    }
  });

  it("contains no device-control / automation language", () => {
    for (const word of [
      /\bturn\s*on\b/i,
      /\bturn\s*off\b/i,
      /\bautomate\b/i,
      /\bautopilot\b/i,
      /\bactuate\b/i,
      /\baction_queue\b/i,
      /\bai_doctor_sessions\b/i,
    ]) {
      expect(SRC, `forbidden language: ${word}`).not.toMatch(word);
    }
  });

  it("uses navigation-only action (href, not handler)", () => {
    expect(SRC).toMatch(/<a\s+href=/);
    expect(SRC).not.toMatch(/onClick=\{[^}]*action/i);
  });
});
