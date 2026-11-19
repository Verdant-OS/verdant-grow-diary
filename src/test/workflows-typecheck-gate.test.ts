/**
 * The full-project typecheck has one gate: the `typecheck` package script.
 * A workflow that calls `tsc -p tsconfig.json` itself skips whatever that
 * script sets (for example its heap ceiling) and can disagree with it.
 * Each workflow is parsed, and the assertions run on the resolved `run`
 * strings of its steps, not on the YAML text.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const WORKFLOWS = resolve(__dirname, "../../.github/workflows");

type Step = { name?: string; run?: string };
type Workflow = { jobs?: Record<string, { steps?: Step[] }> };

function runSteps(file: string): Array<{ job: string; name: string; run: string }> {
  const doc = load(readFileSync(resolve(WORKFLOWS, file), "utf8")) as Workflow;
  return Object.entries(doc.jobs ?? {}).flatMap(([job, def]) =>
    (def.steps ?? [])
      .filter((step): step is Step & { run: string } => typeof step.run === "string")
      .map((step) => ({ job, name: step.name ?? "(unnamed)", run: step.run })),
  );
}

const FILES = readdirSync(WORKFLOWS)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort();

/** A direct full-project compile: tsc pointed at the root tsconfig.json. */
const DIRECT_FULL_PROJECT_TSC = /\btsc\b[^\n]*(?:-p|--project)\s+(?:\.\/)?tsconfig\.json\b/;

describe("workflows use the typecheck gate", () => {
  it("finds workflow files to check", () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it("no workflow step compiles the full project with tsc directly", () => {
    const offenders = FILES.flatMap((file) =>
      runSteps(file)
        .filter((step) => DIRECT_FULL_PROJECT_TSC.test(step.run))
        .map((step) => `${file} :: ${step.job} :: ${step.name}`),
    );
    expect(offenders).toEqual([]);
  });

  it.each(["demo-proof-walkthrough-readonly.yml", "ecowitt-windows-tooling.yml"])(
    "%s still typechecks the app, through the package script",
    (file) => {
      const runs = runSteps(file).map((step) => step.run.trim());
      expect(runs).toContain("bun run typecheck");
    },
  );
});
