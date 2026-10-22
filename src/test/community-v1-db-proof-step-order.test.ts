import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Parses the workflow and asserts on the resolved step list, so a commented-out or
// reordered step fails here rather than only in the hosted run (#2301).
type Step = { name?: string; run?: string; with?: { path?: string } };

const workflow = parse(
  readFileSync(resolve(__dirname, "../../.github/workflows/community-v1-db-proof.yml"), "utf8"),
) as { jobs: Record<string, { steps: Step[] }> };
const steps = Object.values(workflow.jobs)[0].steps;
const indexOf = (name: string) => steps.findIndex((s) => s.name === name);
const step = (name: string) => steps[indexOf(name)];

describe("community-v1-db-proof workflow", () => {
  it("runs the catalog proof on the db reset state, before the runtime suite", () => {
    const reset = indexOf("Apply migrations (db reset with grant-parity seed)");
    const catalog = indexOf("Community V1 catalog proof");
    const runtime = indexOf("Community V1 runtime proof");
    expect(reset).toBeGreaterThanOrEqual(0);
    expect(catalog).toBe(reset + 1);
    expect(runtime).toBeGreaterThan(catalog);
  });

  it("expects all six catalog blocks on the green path", () => {
    expect(step("Community V1 catalog proof").run).toContain(
      "\"$(grep -c '✓ T-CAT-0' community-v1-catalog.log)\" -eq 6",
    );
  });

  it("captures supabase start output to a file and never uploads it", () => {
    expect(step("Start local Supabase").run).toContain("> supabase-start.log 2>&1");
    const uploaded = (step("Upload receipts").with?.path ?? "").split("\n").filter(Boolean);
    expect(uploaded).toEqual([
      "migration-replay-compatibility.json",
      "community-v1-runtime.log",
      "community-v1-catalog.log",
    ]);
  });

  it("masks local values before writing them to the job environment", () => {
    const run = step("Export local Supabase env").run ?? "";
    const mask = run.indexOf("::add-mask::");
    expect(mask).toBeGreaterThanOrEqual(0);
    expect(mask).toBeLessThan(run.indexOf('>> "$GITHUB_ENV"'));
  });
});
