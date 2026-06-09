/**
 * Static safety scan — One-Tent Loop Proof page + view model.
 *
 * Asserts neither file imports or calls:
 *   - Supabase client
 *   - Edge Functions (functions.invoke)
 *   - fetch
 *   - DB write helpers (insert, update, upsert, delete, rpc)
 *   - alert / action_queue write paths
 *   - service_role / bridge token / device control names
 *   - AI/model SDKs
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE_PATH = "src/pages/OneTentLoopProof.tsx";
const VM_PATH = "src/lib/oneTentLoopProofViewModel.ts";

function read(p: string): string {
  return readFileSync(resolve(ROOT, p), "utf8");
}

const pageSrc = read(PAGE_PATH);
const vmSrc = read(VM_PATH);
const targets: Array<[string, string]> = [
  ["page", pageSrc],
  ["view-model", vmSrc],
];

describe("one-tent-loop-proof — static safety (page + view model)", () => {
  it.each(targets)("[%s] does not import supabase client", (_, src) => {
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/from\s+["']@supabase/);
  });

  it.each(targets)("[%s] does not call functions.invoke or fetch", (_, src) => {
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/fetch\s*\(/);
  });

  it.each(targets)("[%s] does not reference DB write helpers", (_, src) => {
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it.each(targets)(
    "[%s] does not reference action_queue or alerts write paths",
    (_, src) => {
      expect(src).not.toMatch(/from\(["']action_queue["']\)/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
    },
  );

  it.each(targets)(
    "[%s] does not reference service_role or bridge token",
    (_, src) => {
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/bridge token/);
    },
  );

  it.each(targets)(
    "[%s] does not contain executable device-control names",
    (_, src) => {
      expect(src).not.toMatch(/controlDevice/i);
      expect(src).not.toMatch(/sendCommand/i);
      expect(src).not.toMatch(/turnOn/i);
      expect(src).not.toMatch(/turnOff/i);
      expect(src).not.toMatch(/setFan/i);
      expect(src).not.toMatch(/setLight/i);
    },
  );

  it.each(targets)("[%s] does not import model/API clients", (_, src) => {
    expect(src).not.toMatch(/openai/i);
    expect(src).not.toMatch(/anthropic/i);
    expect(src).not.toMatch(/gemini/i);
    expect(src).not.toMatch(/gpt-/i);
  });

  it.each(targets)("[%s] does not import AI Doctor engine/compiler/adapter", (_, src) => {
    expect(src).not.toMatch(/aiDoctorEngine/);
    expect(src).not.toMatch(/aiDoctorContextCompiler/);
    expect(src).not.toMatch(/aiDoctorConfidenceAdapter/);
  });

  it("page only imports React and the view-model module", () => {
    const importLines = pageSrc.match(/^import .+ from .+$/gm) ?? [];
    for (const line of importLines) {
      const ok =
        /from\s+["']react["']/.test(line) ||
        /from\s+["']@\/lib\/oneTentLoopProofViewModel["']/.test(line);
      expect(ok, `unexpected import in page: ${line}`).toBe(true);
    }
  });

  it("view-model file has no relative or alias imports (pure module)", () => {
    const importLines = vmSrc.match(/^import .+ from .+$/gm) ?? [];
    expect(importLines).toEqual([]);
  });
});
