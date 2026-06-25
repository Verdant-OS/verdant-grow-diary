import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const NEW_FILES = [
  "src/lib/actionQueueTraceStatusA11yRules.ts",
  "src/components/ActionQueueTraceStatusAnnouncer.tsx",
  "src/lib/actionQueueTimelineLinkRules.ts", // includes new view-in-actions helper
  "src/lib/useTimelineHighlightAutoScroll.ts",
];

const FORBIDDEN = [
  /service_role/i,
  /bridge[_-]?token/i,
  /raw_payload/i,
  /device_command/i,
  /auto[-_ ]?approve/i,
  /auto[-_ ]?automation/i,
  /unattended[_ -]?control/i,
  /supabase\.functions\.invoke/i,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
];

describe("Action Queue trace a11y / view-in-actions static safety", () => {
  for (const rel of NEW_FILES) {
    it(`${rel} contains no forbidden language or I/O`, () => {
      const body = readFileSync(resolve(ROOT, rel), "utf8");
      for (const pat of FORBIDDEN) {
        expect(body, `${rel} matched ${pat}`).not.toMatch(pat);
      }
    });
  }
});
