/**
 * Static safety test for the Environment Check view-model trio.
 *
 * Confirms that none of these pure presenter helpers import Supabase, AI
 * gateways, Action Queue, alerts, device control, or write helpers.
 * Pure file-text scan — no runtime imports of the production code.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/environmentCheckTimelineViewModel.ts",
  "src/lib/environmentCheckCalendarViewModel.ts",
  "src/lib/growReportEnvironmentCheckViewModel.ts",
];

const FORBIDDEN_PATTERNS: ReadonlyArray<RegExp> = [
  /@\/integrations\/supabase\/client/i,
  /service_role/i,
  /supabase\.from\(/i,
  /\.rpc\(/i,
  /from\s+["']@\/lib\/actionQueue/i,
  /alertsPersistence/i,
  /ai-doctor/i,
  /deviceControl|device_control/i,
  /raw_payload/i,
  /sensor_readings/i,
];

describe("environment check view-model trio — static safety", () => {
  for (const rel of FILES) {
    it(`${rel} has no forbidden imports or strings`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      for (const pat of FORBIDDEN_PATTERNS) {
        expect(src, `${rel} must not match ${pat}`).not.toMatch(pat);
      }
      // No raw network or React/JSX in pure helpers.
      expect(src).not.toMatch(/from\s+["']react["']/);
      expect(src).not.toMatch(/fetch\(/);
    });
  }

  it("never declares a literal `live` source/status token", () => {
    for (const rel of FILES) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/source\s*[:=]\s*["']live["']/);
      expect(src).not.toMatch(/status\s*[:=]\s*["']live["']/);
    }
  });
});
