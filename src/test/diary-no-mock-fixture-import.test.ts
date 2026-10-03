/**
 * Honesty fence: `src/lib/diary.ts` must not import fixture data from
 * `src/mock`. It is imported by Timeline and Quick Log history, so a value
 * import ships fake sensor rows into grower bundles, and any caller of a
 * fixture reader would show them without a Demo label.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as diary from "@/lib/diary";

const SOURCE = readFileSync(resolve(process.cwd(), "src/lib/diary.ts"), "utf8");

// `@/mock` or any `@/mock/...` subpath, in either quote style.
const MOCK_SPECIFIER = String.raw`(['"])@/mock(?:/[^'"]*)?\1`;

/**
 * Static import/export statements that pull values from `@/mock`, including
 * side-effect imports, multi-line clauses, `export *` and `export { x } from`.
 * `import type` / `export type` are allowed. `[^;'"]` keeps a match inside one
 * statement, so an earlier import's quotes or semicolon end the clause.
 */
const STATIC_MOCK_LINK = new RegExp(
  String.raw`\b(?:import|export)\s+(?!type\b)(?:[^;'"]*?\bfrom\s*)?` + MOCK_SPECIFIER,
  "g",
);
const DYNAMIC_MOCK_IMPORT = new RegExp(
  String.raw`\bimport\s*\(\s*` + MOCK_SPECIFIER + String.raw`\s*\)`,
  "g",
);

function findMockValueLinks(source: string): string[] {
  return [...(source.match(STATIC_MOCK_LINK) ?? []), ...(source.match(DYNAMIC_MOCK_IMPORT) ?? [])];
}

describe("src/lib/diary.ts mock-fixture fence", () => {
  it("has no value import or re-export from @/mock (type-only imports are allowed)", () => {
    expect(findMockValueLinks(SOURCE)).toEqual([]);
  });

  it("no longer exports the fixture-backed snapshotForTent reader", () => {
    expect("snapshotForTent" in diary).toBe(false);
  });
});

describe("mock-fixture fence scanner", () => {
  it.each([
    ["a single-line double-quoted import", `import { tents } from "@/mock";`],
    ["a single-quoted import", `import { tents } from '@/mock';`],
    ["a multi-line import", `import {\n  tents,\n  plants,\n} from "@/mock";`],
    ["a default import", `import mock from "@/mock";`],
    ["a namespace import", `import * as mock from "@/mock";`],
    ["a mixed type and value import", `import { type Stage, tents } from "@/mock";`],
    ["a side-effect import", `import "@/mock";`],
    ["an import without a semicolon", `import { tents } from "@/mock"\nconst x = 1;`],
    ["a subpath import", `import { readings } from "@/mock/sensors";`],
    ["export * from", `export * from '@/mock';`],
    ["export * as from", `export * as mock from "@/mock";`],
    ["export { x } from", `export { tents } from "@/mock";`],
    ["a multi-line export { x } from", `export {\n  tents,\n} from '@/mock';`],
    ["a dynamic import", `const m = await import("@/mock");`],
  ])("catches %s", (_label, source) => {
    expect(findMockValueLinks(source)).toHaveLength(1);
  });

  it.each([
    ["import type", `import type { Stage } from "@/mock";`],
    ["multi-line import type", `import type {\n  Stage,\n  SensorReading,\n} from '@/mock';`],
    ["export type { x } from", `export type { Stage } from "@/mock";`],
    ["an unrelated module", `import { tents } from "@/lib/mockish";`],
    ["a module whose name only starts with mock", `import { x } from "@/mockData";`],
  ])("allows %s", (_label, source) => {
    expect(findMockValueLinks(source)).toEqual([]);
  });

  it("does not run a clause across an earlier statement", () => {
    const source = `import { a } from "lucide-react";\nimport type { Stage } from "@/mock";`;
    expect(findMockValueLinks(source)).toEqual([]);
  });
});
