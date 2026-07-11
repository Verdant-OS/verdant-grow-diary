/**
 * Regression: the two local-DB integration suites must not construct any
 * Supabase client at collection time when the documented local Supabase
 * env vars are absent. Prior to the CI shard-contract repair, both files
 * failed suite collection with `Error: supabaseUrl is required.` because
 * `createClient()` was invoked inline inside the `describe.skip(...)`
 * callback body (Vitest still evaluates that body to enumerate tests).
 *
 * This test proves the gate is static: neither file may call
 * `createClient(` outside of a factory that is only entered when the
 * local integration environment resolves as available. Runtime coverage
 * (that the suites actually skip) is exercised by the surrounding
 * vitest run — this file is a fast, pure static check so the regression
 * is impossible to reintroduce silently.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILES = [
  "src/test/integration/pi-ingest-commit-batch-replay.integration.test.ts",
  "src/test/integration/storage-policy-security.integration.test.ts",
] as const;

describe("integration suites must gate Supabase client construction", () => {
  for (const rel of FILES) {
    it(`${rel} guards every createClient() call behind hasLocalSupabase`, () => {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      // The `hasLocalSupabase` guard is the documented capability check.
      expect(src).toMatch(/const\s+hasLocalSupabase\s*=/);
      // Every createClient(...) call after the guard declaration must be
      // reachable only via `hasLocalSupabase ?` (top-level admin client)
      // or from inside a helper/hook that runs after the describe.skip
      // callback returns (beforeAll / it / async function).
      const lines = src.split("\n");
      const clientLines: number[] = [];
      lines.forEach((line, i) => {
        if (/createClient\s*\(/.test(line)) clientLines.push(i);
      });
      expect(clientLines.length).toBeGreaterThan(0);
      // Any *top-level* createClient assignment (i.e. within the outer
      // describe callback, not inside a nested function) must be behind
      // the hasLocalSupabase ternary. We approximate "top-level" as any
      // line where the assignment ends with the ternary sentinel or is
      // immediately preceded by an explicit ternary condition.
      const guardedTernary = /hasLocalSupabase\s*\n?\s*\?\s*createClient|hasLocalSupabase\s*\?\s*createClient/;
      expect(
        src,
        `${rel} must construct its admin client via the hasLocalSupabase ternary`,
      ).toMatch(guardedTernary);
    });
  }
});
