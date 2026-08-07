/**
 * Build-summary validator wiring — reporting-integrity contract.
 *
 * Regression cover for a false-green artifact. The `Generate build summary`
 * step runs `if: always()`, so it also executes on FAILED jobs. Its
 * BUILD_SUMMARY_VALIDATORS payload hardcoded `"result":"pass"` for seven of
 * nine stages, so the artifact recorded a red run as green: on a real CI run
 * `bun run test:static-safety` exited 1 and the summary still reported
 * `static-safety-scans: pass` and `overall: pass`.
 *
 * Two independent holes are covered here:
 *
 *   1. Literal results in the workflow. Every validator row must be wired to
 *      a real `steps.<id>.outcome`, and every referenced id must exist.
 *   2. `unknown` falling through to green. A step after a failure never runs,
 *      so its outcome is an empty string. That is not evidence of success, so
 *      the generator must downgrade the verdict rather than report `pass`.
 *
 * Pure + hermetic: reads the committed workflows and runs the generator in a
 * throwaway temp dir. No network, no Supabase, no repo mutation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const GENERATOR = resolve(ROOT, "scripts/generate-build-summary.mjs");

const WORKFLOWS = [".github/workflows/ci.yml", ".github/workflows/deployment-preview.yml"] as const;

/**
 * Stages that may legitimately carry a literal `pass`, keyed by validator
 * name. `edge-shared-preflight` is a SEPARATE job reached through `needs:`,
 * so the job holding this step cannot run at all unless it succeeded. Any
 * entry here must justify itself in its own `detail` field.
 *
 * Keep this list tiny. A literal result is a claim made without evidence.
 */
const LITERAL_PASS_ALLOW_LIST = new Set(["edge-shared-preflight"]);

function readWorkflow(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

/** Extract each `BUILD_SUMMARY_VALIDATORS: >- [ ... ]` block in a workflow. */
function validatorBlocks(src: string): string[] {
  const blocks: string[] = [];
  const marker = "BUILD_SUMMARY_VALIDATORS:";
  let from = 0;
  for (;;) {
    const start = src.indexOf(marker, from);
    if (start === -1) break;
    const open = src.indexOf("[", start);
    const close = src.indexOf("]", open);
    expect(open, `${marker} must be followed by a JSON array`).toBeGreaterThan(-1);
    expect(close, `${marker} array must be closed`).toBeGreaterThan(open);
    blocks.push(src.slice(open, close + 1));
    from = close + 1;
  }
  return blocks;
}

/**
 * Every `{"name":"x","result":"y",...}` row inside a block.
 *
 * Rows are anchored on the name/result pair rather than split on `{`...`}`:
 * a wired result is `${{ steps.<id>.outcome }}`, whose own braces would
 * otherwise be mistaken for row delimiters. `row` spans from each name to the
 * start of the next one, so per-row fields like `detail` stay attached.
 */
function validatorRows(block: string): Array<{ name: string; result: string; row: string }> {
  const pairs = [...block.matchAll(/"name"\s*:\s*"([^"]*)"\s*,\s*"result"\s*:\s*"([^"]*)"/g)];
  return pairs.map((m, i) => ({
    name: m[1],
    result: m[2],
    row: block.slice(m.index!, pairs[i + 1]?.index ?? block.length),
  }));
}

describe("BUILD_SUMMARY_VALIDATORS is wired to real step outcomes", () => {
  it.each(WORKFLOWS)("%s declares at least one validator block", (wf) => {
    expect(validatorBlocks(readWorkflow(wf)).length).toBeGreaterThan(0);
  });

  it.each(WORKFLOWS)("%s never hardcodes a validator result", (wf) => {
    for (const block of validatorBlocks(readWorkflow(wf))) {
      for (const { name, result, row } of validatorRows(block)) {
        expect(name, `every validator row needs a name: ${row}`).not.toBe("");
        if (LITERAL_PASS_ALLOW_LIST.has(name)) {
          // Allowed, but it must say WHY it is safe to assert without a step.
          expect(row, `${name} must justify its literal result in \`detail\``).toMatch(
            /"detail"\s*:\s*"[^"]*needs[^"]*"/,
          );
          continue;
        }
        expect(
          result,
          `${wf}: validator "${name}" hardcodes "${result}" instead of a steps.<id>.outcome ` +
            `reference. The summary step is \`if: always()\` and also runs on failed jobs, so a ` +
            `literal here reports green for a red run.`,
        ).toMatch(/^\$\{\{\s*steps\.[A-Za-z0-9_-]+\.outcome\s*\}\}$/);
      }
    }
  });

  it.each(WORKFLOWS)("%s: every referenced step id actually exists", (wf) => {
    const src = readWorkflow(wf);
    const declaredIds = new Set(
      [...src.matchAll(/^\s+id:\s*([A-Za-z0-9_-]+)\s*$/gm)].map((m) => m[1]),
    );
    for (const block of validatorBlocks(src)) {
      for (const { name, result } of validatorRows(block)) {
        const referenced = /steps\.([A-Za-z0-9_-]+)\.outcome/.exec(result)?.[1];
        if (!referenced) continue;
        expect(
          declaredIds.has(referenced),
          `${wf}: validator "${name}" references steps.${referenced}.outcome, but no step ` +
            `declares \`id: ${referenced}\`. An unresolved reference expands to an empty ` +
            `string, which silently becomes "unknown".`,
        ).toBe(true);
      }
    }
  });

  it("ci.yml wires the stage that actually regressed", () => {
    // static-safety-scans is the specific row that reported `pass` while
    // `bun run test:static-safety` had exited 1. Pin it by name so a future
    // refactor cannot quietly drop it back to a literal.
    const src = readWorkflow(".github/workflows/ci.yml");
    const rows = validatorBlocks(src).flatMap(validatorRows);
    const staticSafety = rows.find((r) => r.name === "static-safety-scans");
    expect(staticSafety, "ci.yml must still report a static-safety-scans stage").toBeDefined();
    expect(staticSafety!.result).toMatch(/^\$\{\{\s*steps\.[A-Za-z0-9_-]+\.outcome\s*\}\}$/);
  });
});

describe("generate-build-summary verdict precedence", () => {
  /**
   * Run the generator against a synthetic validator set.
   *
   * Returns the edge-shared status alongside the verdict on purpose. The
   * generator re-runs `verify-edge-shared-in-sync.mjs` on every invocation and
   * folds drift into `overall`, so a bare `toBe("pass")` here would silently
   * depend on the working tree's mirror state and fail for a reason that has
   * nothing to do with validator precedence. Assertions below either hold
   * under both states, or branch on `edgeShared` explicitly.
   */
  function runGenerator(validators: Array<Record<string, string>>): {
    overall: string;
    edgeShared: string;
  } {
    const out = mkdtempSync(join(tmpdir(), "verdant-build-summary-"));
    try {
      execFileSync("node", [GENERATOR], {
        env: {
          ...process.env,
          OUT_DIR: out,
          BUILD_SUMMARY_VALIDATORS: JSON.stringify(validators),
        },
        stdio: "pipe",
      });
      const summary = JSON.parse(readFileSync(join(out, "build-summary.json"), "utf8"));
      return { overall: summary.overall, edgeShared: summary.edgeShared?.status ?? "unknown" };
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }

  const overallFor = (v: Array<Record<string, string>>) => runGenerator(v).overall;

  it("all stages successful → pass (drift is the only other legal answer)", () => {
    const { overall, edgeShared } = runGenerator([
      { name: "a", result: "success" },
      { name: "b", result: "success" },
    ]);
    // Edge-shared drift legitimately fails the summary on its own. Branch
    // rather than assume, so this test reports the real reason if it ever
    // does fail instead of looking like a precedence regression.
    expect(overall, `edgeShared=${edgeShared}`).toBe(edgeShared === "in-sync" ? "pass" : "fail");
  });

  it("any stage failed → fail", () => {
    // Holds under both edge-shared states.
    expect(
      overallFor([
        { name: "a", result: "success" },
        { name: "b", result: "failure" },
      ]),
    ).toBe("fail");
  });

  it("an unresolved outcome never reports pass — this is the false-green case", () => {
    // A step after a failure never runs, so `steps.<id>.outcome` expands to
    // "". Reporting that as green is exactly the defect being fixed.
    //
    // "never pass" is the invariant that matters and it holds regardless of
    // edge-shared state (in-sync → incomplete, drift → fail). Assert that
    // first so the guarantee is unconditional, then pin the exact value in
    // the normal case.
    const { overall, edgeShared } = runGenerator([
      { name: "a", result: "success" },
      { name: "b", result: "" },
    ]);
    expect(overall, `edgeShared=${edgeShared}`).not.toBe("pass");
    expect(overall).toBe(edgeShared === "in-sync" ? "incomplete" : "fail");
  });

  it("a real failure still outranks an unresolved outcome", () => {
    expect(
      overallFor([
        { name: "a", result: "failure" },
        { name: "b", result: "" },
      ]),
    ).toBe("fail");
  });

  it("cancelled counts as a failure, not a pass", () => {
    expect(overallFor([{ name: "a", result: "cancelled" }])).toBe("fail");
  });

  it("an intentionally skipped stage does not poison the verdict", () => {
    // `skipped` is a deliberate, recorded non-run (e.g. a conditional step),
    // distinct from an unresolved reference. It must NOT downgrade to
    // `incomplete` — same edge-shared branching as the all-success case.
    const { overall, edgeShared } = runGenerator([
      { name: "a", result: "success" },
      { name: "b", result: "skipped" },
    ]);
    expect(overall, `edgeShared=${edgeShared}`).toBe(edgeShared === "in-sync" ? "pass" : "fail");
    expect(overall).not.toBe("incomplete");
  });
});
