import fs from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import {
  UNATTENDED_RECONSENT_BLOCKED,
  isUnattendedRun,
  reconsentAction,
} from "../../e2e/lib/unattendedRunRules";

const ROOT = path.resolve(__dirname, "../..");

type Step = { name?: string; if?: string };
type Job = { env: Record<string, string>; steps: Step[] };
const workflow = load(
  fs.readFileSync(path.join(ROOT, ".github/workflows/quicklog-smoke.yml"), "utf8"),
) as { jobs: Record<string, Job> };
const smoke = workflow.jobs["quicklog-smoke"];

// Evaluate a GitHub expression body (the shared JS equality/boolean subset).
function evaluate(expression: string, event_name: string, bootstrapVar = "true") {
  const body = expression.replace(/^\$\{\{\s*|\s*\}\}$/g, "");
  return runInNewContext(
    body,
    {
      github: { event_name },
      vars: { E2E_ALLOW_FIXTURE_BOOTSTRAP: bootstrapVar },
      steps: { e2e_config: { outputs: { should_run: "true" } } },
    },
    { timeout: 100 },
  ) as boolean;
}

describe("unattended scheduled Quick Log smoke (#1852)", () => {
  it("blocks agreement re-consent only when the gate shows on an unattended run", () => {
    expect(reconsentAction(false, false)).toBe("none");
    expect(reconsentAction(false, true)).toBe("none");
    expect(reconsentAction(true, false)).toBe("accept");
    expect(reconsentAction(true, true)).toBe("block");
    expect(UNATTENDED_RECONSENT_BLOCKED).toMatch(/^BLOCKED: /);
  });

  it("treats only the exact workflow value as unattended", () => {
    expect(isUnattendedRun({ E2E_UNATTENDED_RUN: "true" })).toBe(true);
    for (const value of [undefined, "", "false", "TRUE", "1", " true"])
      expect(isUnattendedRun({ E2E_UNATTENDED_RUN: value })).toBe(false);
  });

  it("marks exactly the scheduled run as unattended", () => {
    const value = smoke.env.E2E_UNATTENDED_RUN;
    expect(value).toBe("${{ github.event_name == 'schedule' }}");
    expect(evaluate(value, "schedule")).toBe(true);
    for (const event of ["push", "workflow_dispatch", "pull_request"])
      expect(evaluate(value, event)).toBe(false);
  });

  it("never runs the fixture bootstrap on the schedule", () => {
    const bootstrap = smoke.steps.find((s) => s.name === "Bootstrap disposable E2E fixture");
    expect(bootstrap?.if).toBeDefined();
    expect(evaluate(bootstrap!.if!, "schedule")).toBe(false);
    expect(evaluate(bootstrap!.if!, "push")).toBe(true);
    expect(evaluate(bootstrap!.if!, "push", "false")).toBe(false);
  });

  it("checks the unattended block before any re-consent click in the smoke spec", () => {
    // @source-scan-justified: the Playwright spec cannot run under Vitest; this pins call order only.
    const spec = fs.readFileSync(path.join(ROOT, "e2e/quicklog-smoke.spec.ts"), "utf8");
    const start = spec.indexOf("async function acceptReconsentGateIfShown");
    const fn = spec.slice(start, spec.indexOf("\n}\n", start));
    const block = fn.indexOf("reconsentAction(shown, isUnattendedRun(process.env))");
    expect(block).toBeGreaterThan(0);
    expect(block).toBeLessThan(fn.indexOf('locator("#reconsent-accept").click()'));
    expect(fn).toContain("throw new Error(UNATTENDED_RECONSENT_BLOCKED)");
  });
});
