import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const NEW_FILES = [
  "src/lib/actionQueueTraceLinkCopyRules.ts",
  "src/lib/actionQueueKeyboardNavigationRules.ts",
  "src/components/CopyTraceLinkButton.tsx",
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

describe("trace-link copy + keyboard nav static safety", () => {
  for (const rel of NEW_FILES) {
    it(`${rel} contains no forbidden language or non-clipboard I/O`, () => {
      const body = readFileSync(resolve(ROOT, rel), "utf8");
      for (const pat of FORBIDDEN) {
        expect(body, `${rel} matched ${pat}`).not.toMatch(pat);
      }
    });
  }
});
