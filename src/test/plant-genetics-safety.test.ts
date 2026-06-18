/**
 * Static safety guards for plant genetics presenter slice.
 *
 * GeneticsBadge + plantGeneticsViewModel must remain presenter-only and
 * pure — no Supabase / client / write helpers / AI / Action Queue imports.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const VM = read("src/lib/plantGeneticsViewModel.ts");
const BADGE = read("src/components/GeneticsBadge.tsx");

const FORBIDDEN_IMPORTS = [
  "@/integrations/supabase",
  "supabase-js",
  "@/integrations/supabase/client",
  "ai-doctor",
  "aiDoctor",
  "ActionQueue",
  "action-queue",
  "alerts/",
  "deviceControl",
  "device-control",
  "ggsRealPayloadCommit",
  "pi_ingest_commit_batch",
];

describe("plant genetics — static safety", () => {
  it("view model has no forbidden imports or I/O", () => {
    for (const needle of FORBIDDEN_IMPORTS) {
      expect(VM, `VM contains forbidden ${needle}`).not.toContain(needle);
    }
    expect(VM).not.toMatch(/\bfetch\s*\(/);
    expect(VM).not.toMatch(/\.from\(\s*["']/);
  });

  it("badge has no forbidden imports or write helpers", () => {
    for (const needle of FORBIDDEN_IMPORTS) {
      expect(BADGE, `Badge contains forbidden ${needle}`).not.toContain(needle);
    }
    expect(BADGE).not.toMatch(/\bfetch\s*\(/);
    expect(BADGE).not.toMatch(/\.from\(\s*["']/);
    expect(BADGE).not.toMatch(/useMutation/);
  });

  it("view model never throws — try/catch guards top-level builder", () => {
    expect(VM).toMatch(/try\s*\{/);
    expect(VM).toMatch(/catch\s*[({]/);
  });
});
