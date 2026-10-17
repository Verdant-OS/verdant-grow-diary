/**
 * Edge functions must bundle in isolation.
 *
 * The Lovable deploy tool packages one function folder plus
 * `supabase/functions/_shared/`. A relative import that leaves both (for
 * example `_shared/paddle.ts` importing `../paddle-webhook/...`) fails with
 * "Module not found" at bundle time. On 2026-10-16 that failure blocked the
 * deploy of payments-webhook, delete-account and paddle-portal-session, and
 * it also reached get-paddle-price.
 *
 * This walks each function's transitive relative-import graph from its
 * non-test entry files and requires every resolved file to stay inside the
 * function's own folder or `_shared/`. It proves a forbidden construct is
 * absent; it does not assert configuration.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const FUNCTIONS_ROOT = resolve(__dirname, "..", "..", "supabase", "functions");
const SHARED_ROOT = join(FUNCTIONS_ROOT, "_shared") + sep;
const RELATIVE_IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;

function isTestOrHarness(file: string): boolean {
  return /\.test\.ts$|_test\.ts$|[Tt]estHarness\.ts$/.test(file);
}

function functionNames(): string[] {
  return readdirSync(FUNCTIONS_ROOT)
    .filter((name) => !name.startsWith("_"))
    .filter((name) => statSync(join(FUNCTIONS_ROOT, name)).isDirectory())
    .sort();
}

/** Every relative import, transitively, that resolves outside the bundle. */
function outOfBundleImports(fn: string): string[] {
  const ownRoot = join(FUNCTIONS_ROOT, fn) + sep;
  const entries = readdirSync(join(FUNCTIONS_ROOT, fn))
    .filter((file) => file.endsWith(".ts") && !isTestOrHarness(file))
    .map((file) => join(FUNCTIONS_ROOT, fn, file));
  const seen = new Set<string>();
  const stack = [...entries];
  const escapes = new Set<string>();
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(RELATIVE_IMPORT)) {
      const target = resolve(dirname(file), match[1]!);
      if (!target.startsWith(ownRoot) && !target.startsWith(SHARED_ROOT)) {
        escapes.add(
          `${relative(FUNCTIONS_ROOT, file)} -> ${relative(FUNCTIONS_ROOT, target)}`.replace(
            /\\/g,
            "/",
          ),
        );
      }
      stack.push(target);
    }
  }
  return [...escapes].sort();
}

describe("edge function isolated packaging", () => {
  it("finds the edge functions to check", () => {
    expect(functionNames().length).toBeGreaterThan(20);
    expect(functionNames()).toContain("payments-webhook");
  });

  it.each(functionNames())("%s imports only its own folder and _shared/", (fn) => {
    expect(outOfBundleImports(fn)).toEqual([]);
  });

  it("keeps the Paddle verifier in _shared with a compatibility re-export", () => {
    const shared = join(FUNCTIONS_ROOT, "_shared", "verifyPaddleSignature.ts");
    const compat = join(FUNCTIONS_ROOT, "paddle-webhook", "verifyPaddleSignature.ts");
    expect(existsSync(shared)).toBe(true);
    expect(readFileSync(shared, "utf8")).toContain(
      "export async function verifyPaddleWebhookSignature",
    );
    // The old path stays importable and holds no second implementation.
    expect(readFileSync(compat, "utf8")).toMatch(
      /^\s*export \* from "\.\.\/_shared\/verifyPaddleSignature\.ts";\s*$/m,
    );
    expect(readFileSync(compat, "utf8")).not.toMatch(/function\s+\w+\s*\(/);
  });
});
