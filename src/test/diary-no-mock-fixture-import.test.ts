/**
 * Honesty fence: `src/lib/diary.ts` must not import fixture data from
 * `src/mock`. It is imported by Timeline and Quick Log history, so a value
 * import ships fake sensor rows into grower bundles, and any caller of a
 * fixture reader would show them without a Demo label.
 *
 * @source-scan-justified: proves a construct is absent from a file; there is
 * no resolved configuration to import.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as diary from "@/lib/diary";

const SOURCE = readFileSync(resolve(process.cwd(), "src/lib/diary.ts"), "utf8");

describe("src/lib/diary.ts mock-fixture fence", () => {
  it("has no value import from @/mock (type-only imports are allowed)", () => {
    const valueImports = SOURCE.match(/^import\s+(?!type\b)[^;]*from\s+"@\/mock";?$/gm) ?? [];
    expect(valueImports).toEqual([]);
  });

  it("no longer exports the fixture-backed snapshotForTent reader", () => {
    expect("snapshotForTent" in diary).toBe(false);
  });
});
