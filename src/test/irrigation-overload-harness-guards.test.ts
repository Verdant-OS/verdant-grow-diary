import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const PGTAP_WORKFLOW = ".github/workflows/irrigation-pgtap-rls-gate.yml";
const HARNESS_TSCONFIG = "tsconfig.irrigation-harness.json";
const ACL_PGTAP_FILES = [
  "supabase/tests/create_watering_event.sql",
  "supabase/tests/create_feeding_event.sql",
] as const;
const EXPECTED_HARNESSES = [
  "scripts/run-irrigation-evidence-rls-harness.ts",
  "scripts/run-create-feeding-event-rls-harness.ts",
  "scripts/run-quicklog-save-event-rls-harness.ts",
  "scripts/run-quicklog-save-manual-rls-harness.ts",
  "scripts/run-quicklog-rpc-rls-harnesses.ts",
  "scripts/run-quicklog-typed-payloads-harness.ts",
] as const;

const readRepoFile = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("legacy irrigation RPC overload ACL parity", () => {
  for (const path of ACL_PGTAP_FILES) {
    it(`${path} requires every overload to match the role contract`, () => {
      const sql = readRepoFile(path);

      expect(sql).toMatch(/overload_count\s+BIGINT/);
      expect(sql).toMatch(/granted_count\s+BIGINT/);
      expect(sql).toMatch(/count\(\*\)\s+FILTER\s*\(\s*WHERE\s+has_function_privilege/i);
      expect(sql).toMatch(/ASSERT\s+overload_count\s*>\s*0/i);
      expect(sql).toMatch(/granted_count\s*=\s*overload_count/i);
      expect(sql).toMatch(/granted_count\s*=\s*0/i);
      expect(sql).not.toMatch(/bool_or\s*\(\s*has_function_privilege/i);
    });
  }
});

describe("irrigation harness compiler coverage", () => {
  const workflow = readRepoFile(PGTAP_WORKFLOW);
  const tsconfig = JSON.parse(readRepoFile(HARNESS_TSCONFIG)) as {
    include?: string[];
    compilerOptions?: { types?: string[]; noEmit?: boolean };
  };
  const pkg = JSON.parse(readRepoFile("package.json")) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  it("uses a dedicated package command instead of the src-only app project", () => {
    expect(pkg.scripts?.["typecheck:irrigation-harnesses"]).toBe(
      "tsc -p tsconfig.irrigation-harness.json --noEmit",
    );
    expect(workflow).toContain("run: bun run typecheck:irrigation-harnesses");
    expect(workflow).not.toMatch(/Typecheck irrigation harnesses[\s\S]{0,300}\btsgo\b/);
  });

  it("provides Bun and Node types for every irrigation TypeScript harness", () => {
    expect(pkg.devDependencies?.["@types/bun"]).toBeDefined();
    expect(tsconfig.compilerOptions?.types).toEqual(expect.arrayContaining(["bun", "node"]));
    expect(tsconfig.compilerOptions?.noEmit).toBe(true);
    expect(tsconfig.include).toEqual([...EXPECTED_HARNESSES]);
  });

  it("keeps the TypeScript project in parity with the workflow harness allowlist", () => {
    const workflowHarnesses = [
      ...new Set(
        [...workflow.matchAll(/-\s+"(scripts\/run-[^"]+\.ts)"/g)].map((match) => match[1]),
      ),
    ].sort();

    expect([...(tsconfig.include ?? [])].sort()).toEqual(workflowHarnesses);
  });

  it("reruns the gate whenever compiler coverage or a covered harness changes", () => {
    for (const path of [...EXPECTED_HARNESSES, HARNESS_TSCONFIG, "package.json", "bun.lock"]) {
      expect(workflow).toContain(`- "${path}"`);
    }
  });
});
