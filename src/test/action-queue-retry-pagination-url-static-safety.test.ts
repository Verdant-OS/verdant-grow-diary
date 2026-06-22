/**
 * Static safety: new retry / pagination / URL state / timeline highlight
 * helpers must remain pure presenter logic. They MUST NOT import Supabase,
 * AI gateways, edge functions, device-control modules, or leak
 * service-role / bridge tokens / payload bytes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILES = [
  "src/lib/actionQueueRetryTraceViewModel.ts",
  "src/lib/actionQueuePaginationRules.ts",
  "src/lib/actionQueueUrlStateRules.ts",
  "src/lib/timelineHighlightRules.ts",
];

const FORBIDDEN_IMPORTS = [
  "@/integrations/supabase",
  "supabase.functions.invoke",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "device_command",
  "deviceCommand",
];

const FORBIDDEN_TOKENS = [
  "service_role",
  "SERVICE_ROLE",
  "bridge_token",
  "BRIDGE_TOKEN",
  "raw_payload",
  "autopilot",
  "auto-approve",
  "auto_approve",
  "autoApprove",
];

describe("action-queue retry/pagination/url + timeline-highlight — static safety", () => {
  for (const rel of FILES) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    it(`${rel} has no forbidden imports / side effects`, () => {
      for (const banned of FORBIDDEN_IMPORTS) {
        expect(src.includes(banned)).toBe(false);
      }
    });
    it(`${rel} has no forbidden tokens`, () => {
      for (const banned of FORBIDDEN_TOKENS) {
        expect(src.includes(banned)).toBe(false);
      }
    });
  }
});
