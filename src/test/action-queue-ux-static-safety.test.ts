/**
 * Static safety scan for the Action Queue UX + traceability slice.
 *
 * Reads the new files and asserts none of them contain forbidden
 * patterns: service-role keys, bridge tokens, raw-payload dumps,
 * device-control APIs, or auto-approval behavior.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/actionQueueTimelineTraceRules.ts",
  "src/lib/actionQueueViewModel.ts",
  "src/components/ActionQueueDetailDrawer.tsx",
];

const FORBIDDEN_LITERAL = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "service_role",
  "BRIDGE_TOKEN",
  "raw_payload",
  "device_command",
  "executeDeviceCommand",
  "sendDeviceCommand",
  "autoApprove",
  "auto_approve",
  "auto-approve",
  "navigator.sendBeacon",
];

// Regex patterns for behaviors that should not exist in this slice.
const FORBIDDEN_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "fetch(", re: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", re: /XMLHttpRequest/ },
  { name: "WebSocket", re: /\bnew\s+WebSocket\s*\(/ },
  { name: "supabase.functions.invoke", re: /supabase\.functions\.invoke/ },
];

describe("Action Queue UX + traceability — static safety", () => {
  for (const rel of FILES) {
    const abs = resolve(rel);
    const src = readFileSync(abs, "utf8");
    describe(rel, () => {
      for (const needle of FORBIDDEN_LITERAL) {
        it(`does NOT contain forbidden literal: ${needle}`, () => {
          expect(src.includes(needle)).toBe(false);
        });
      }
      for (const { name, re } of FORBIDDEN_PATTERNS) {
        it(`does NOT match forbidden pattern: ${name}`, () => {
          expect(re.test(src)).toBe(false);
        });
      }
    });
  }
});
