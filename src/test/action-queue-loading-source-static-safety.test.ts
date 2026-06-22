/**
 * Static safety scan for the loading / source-link / history slice.
 *
 * The new helpers and components must NOT contain device-control,
 * service-role, raw-payload, auto-approve, or network-call patterns.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/actionQueueSourceLinkRules.ts",
  "src/lib/actionQueueStatusHistoryRules.ts",
  "src/components/ActionQueueLoadingSkeleton.tsx",
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
];

const FORBIDDEN_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "fetch(", re: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", re: /XMLHttpRequest/ },
  { name: "WebSocket", re: /\bnew\s+WebSocket\s*\(/ },
  { name: "supabase.functions.invoke", re: /supabase\.functions\.invoke/ },
  { name: "supabase import", re: /from\s+["']@\/integrations\/supabase\// },
];

describe("Action Queue loading / source / history — static safety", () => {
  for (const rel of FILES) {
    const src = readFileSync(resolve(rel), "utf8");
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
