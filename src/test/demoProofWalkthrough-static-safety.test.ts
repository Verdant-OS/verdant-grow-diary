/**
 * Static-safety scan for the Demo Proof Walkthrough slice.
 *
 * Verifies the view model and presenter contain no Supabase, AI, Action
 * Queue, automation, or device-control surfaces, and do not leak raw
 * payloads, tokens, MACs, service role keys, or private identifiers.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/demoProofWalkthroughViewModel.ts",
  "src/pages/DemoProofWalkthrough.tsx",
];

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Demo Proof Walkthrough — static safety", () => {
  it("contains no Supabase write surfaces", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/supabase\.rpc\(/);
    }
  });

  it("contains no AI / model / provider call surfaces", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src).not.toMatch(/openai|anthropic|gemini|claude|gpt-/i);
      expect(src).not.toMatch(/ai-coach|ai-doctor-review/);
    }
  });

  it("contains no Action Queue / automation / device-control writes", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src).not.toMatch(/createActionQueueItem|insertActionQueue/);
      expect(src).not.toMatch(/device[_-]?control|relay[_-]?on|relay[_-]?off/i);
      expect(src).not.toMatch(/automation/i);
    }
  });

  it("does not reference raw payloads, service role keys, bridge tokens, or env secrets", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src).not.toMatch(/raw_payload/);
      expect(src).not.toMatch(/service_role|SERVICE_ROLE/);
      expect(src).not.toMatch(/bridge_token|BRIDGE_TOKEN/);
      expect(src).not.toMatch(/process\.env|import\.meta\.env/);
    }
  });

  it("view model is dependency-light (no React, no Supabase)", () => {
    const vm = read("src/lib/demoProofWalkthroughViewModel.ts");
    expect(vm).not.toMatch(/from\s+["']react["']/);
    expect(vm).not.toMatch(/from\s+["']@\/integrations\/supabase/);
  });
});
