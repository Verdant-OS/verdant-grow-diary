/**
 * CodeQL advanced setup must report on merge-queue entries.
 *
 * Default setup cannot trigger on merge_group. The job name template plus the
 * language matrix is what GitHub renders as Analyze (actions), Analyze (python),
 * and Analyze (javascript-typescript).
 *
 * Asserts on the parsed workflow, not on its source text.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type CodeqlWorkflow = {
  on: Record<string, { types?: string[]; paths?: string[]; branches?: string[] } | null>;
  jobs: Record<
    string,
    {
      name: string;
      if?: string;
      strategy?: { matrix?: { include?: Array<{ language?: string; "build-mode"?: string }> } };
    }
  >;
};

const workflow = load(
  readFileSync(resolve(__dirname, "../../.github/workflows/codeql.yml"), "utf8"),
) as CodeqlWorkflow;

describe("codeql merge-queue coverage", () => {
  it("runs on merge_group checks_requested, with no path filter and no job-level skip", () => {
    expect(Object.hasOwn(workflow.on, "merge_group")).toBe(true);
    const mergeGroup = workflow.on.merge_group;
    expect(mergeGroup?.types).toEqual(["checks_requested"]);
    expect(mergeGroup?.paths).toBeUndefined();
    expect(workflow.jobs.analyze.if).toBeUndefined();
  });

  it("renders the three Analyze context names from the matrix", () => {
    expect(workflow.jobs.analyze.name).toBe("Analyze (${{ matrix.language }})");
    const languages = (workflow.jobs.analyze.strategy?.matrix?.include ?? []).map(
      (row) => row.language,
    );
    expect(languages).toEqual(["actions", "python", "javascript-typescript"]);
    expect(
      (workflow.jobs.analyze.strategy?.matrix?.include ?? []).every(
        (row) => row["build-mode"] === "none",
      ),
    ).toBe(true);
  });

  it("keeps pull_request and push limited to the deploy branch", () => {
    expect(workflow.on.pull_request?.branches).toEqual(["verdant-grow-diary"]);
    expect(workflow.on.pull_request?.types).toEqual([
      "opened",
      "synchronize",
      "reopened",
      "ready_for_review",
    ]);
    expect(workflow.on.push?.branches).toEqual(["verdant-grow-diary"]);
  });
});
