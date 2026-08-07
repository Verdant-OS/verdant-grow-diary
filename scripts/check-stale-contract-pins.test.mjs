import assert from "node:assert/strict";
import test from "node:test";

import {
  extractReferencedSourceFiles,
  buildContractPinIndex,
  findAffectedContractTests,
} from "./check-stale-contract-pins.mjs";

test("extractReferencedSourceFiles finds a direct readFileSync(resolve(...)) literal", () => {
  const content = `
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const COACH = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");
`;
  assert.deepEqual(extractReferencedSourceFiles(content, "src/test/x.test.ts"), [
    "src/pages/Coach.tsx",
  ]);
});

test("extractReferencedSourceFiles finds literals passed through a local read() helper", () => {
  const content = `
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");
const quickLog = read("src/components/QuickLog.tsx");
`;
  assert.deepEqual(extractReferencedSourceFiles(content, "src/test/x.test.ts"), [
    "src/components/QuickLog.tsx",
  ]);
});

test("extractReferencedSourceFiles finds a non-src root (supabase/ migrations)", () => {
  const content = `
import { readFileSync } from "node:fs";
const MIGRATION = "supabase/migrations/20260807100000_pheno_hunts_parent_hunt.sql";
const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");
`;
  assert.deepEqual(extractReferencedSourceFiles(content, "src/test/x.test.ts"), [
    "supabase/migrations/20260807100000_pheno_hunts_parent_hunt.sql",
  ]);
});

test("extractReferencedSourceFiles returns [] for a file that never imports readFileSync", () => {
  const content = `
import { describe, it, expect } from "vitest";
import { buildFoo } from "@/lib/fooRules";
describe("foo", () => {
  it("does the thing", () => {
    expect(buildFoo("src/pages/Coach.tsx")).toBe("whatever");
  });
});
`;
  // Even though a src/ path literal is present, this file never reads raw
  // file text, so it is not a contract-pin reader — excluding it is the
  // point, not a miss.
  assert.deepEqual(extractReferencedSourceFiles(content, "src/test/x.test.ts"), []);
});

test("extractReferencedSourceFiles excludes the test file's own path and dedupes repeats", () => {
  const content = `
import { readFileSync } from "node:fs";
// self-reference, e.g. a meta test asserting something about this very file
const self = readFileSync(resolve(ROOT, "src/test/self.test.ts"), "utf8");
const a1 = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");
const a2 = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");
`;
  assert.deepEqual(extractReferencedSourceFiles(content, "src/test/self.test.ts"), [
    "src/pages/Coach.tsx",
  ]);
});

test("buildContractPinIndex aggregates multiple test files reading the same source", () => {
  const testFiles = [
    {
      path: "src/test/a.test.ts",
      content: `import { readFileSync } from "node:fs";\nreadFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");`,
    },
    {
      path: "src/test/b.test.ts",
      content: `import { readFileSync } from "node:fs";\nreadFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");\nreadFileSync(resolve(ROOT, "src/components/QuickLog.tsx"), "utf8");`,
    },
    {
      path: "src/test/c.test.ts",
      content: `import { describe } from "vitest";\n// no fs read at all`,
    },
  ];
  const index = buildContractPinIndex(testFiles);
  assert.deepEqual(index, {
    "src/pages/Coach.tsx": ["src/test/a.test.ts", "src/test/b.test.ts"],
    "src/components/QuickLog.tsx": ["src/test/b.test.ts"],
  });
});

test("findAffectedContractTests scopes to only the changed files that have a reader", () => {
  const index = {
    "src/pages/Coach.tsx": ["src/test/a.test.ts", "src/test/b.test.ts"],
    "src/components/QuickLog.tsx": ["src/test/b.test.ts"],
    "src/lib/untouched.ts": ["src/test/z.test.ts"],
  };
  const result = findAffectedContractTests(
    ["src/pages/Coach.tsx", "src/components/QuickLog.tsx", "src/lib/no-readers.ts"],
    index,
  );
  assert.deepEqual(result.affectedTests, ["src/test/a.test.ts", "src/test/b.test.ts"]);
  assert.deepEqual(result.bySource, {
    "src/pages/Coach.tsx": ["src/test/a.test.ts", "src/test/b.test.ts"],
    "src/components/QuickLog.tsx": ["src/test/b.test.ts"],
  });
  // src/lib/untouched.ts must not leak in just because it exists in the index.
  assert.equal("src/lib/untouched.ts" in result.bySource, false);
});

test("findAffectedContractTests returns empty when no changed file has a reader", () => {
  const index = { "src/pages/Coach.tsx": ["src/test/a.test.ts"] };
  const result = findAffectedContractTests(["src/lib/unrelated.ts"], index);
  assert.deepEqual(result.affectedTests, []);
  assert.deepEqual(result.bySource, {});
});
