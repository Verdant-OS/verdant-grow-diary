import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  LOCAL_LANE_FLAG,
  LOCAL_LANE_HARNESSES,
  isLoopbackHost,
  planLocalLaneRun,
} from "../../scripts/security/run-local-lane-harness.mjs";

const ROOT = resolve(__dirname, "../..");
const SCRIPTS = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).scripts as Record<
  string,
  string
>;

type Step = { name?: string; id?: string; if?: string; run?: string; with?: { path?: string } };
const WORKFLOW = load(
  readFileSync(resolve(ROOT, ".github/workflows/security-db-local.yml"), "utf8"),
) as { jobs: Record<string, { steps: Step[] }> };
const STEPS = WORKFLOW.jobs["test-security-db-local"].steps;

const GRANT_PATH_LANE = [
  { name: "billing", script: "test:billing-rls:local-lane", stepId: "billing-rls" },
  { name: "ai-credits", script: "test:ai-credits-rls:local-lane", stepId: "ai-credits-rls" },
  { name: "action-queue", script: "test:action-queue-rls:local-lane", stepId: "action-queue-rls" },
  { name: "staff-role", script: "test:staff-role-rls:local-lane", stepId: "staff-role-rls" },
  {
    name: "staff-grant-trigger",
    script: "test:staff-grant-trigger:local-lane",
    stepId: "staff-grant-trigger",
  },
] as const;

const LOCAL_ENV = { SUPABASE_URL: "http://127.0.0.1:54321" };

describe("local-lane harness launcher refuses anything but the disposable loopback database", () => {
  it("launches a named harness against a loopback API", () => {
    expect(planLocalLaneRun(["billing", LOCAL_LANE_FLAG], LOCAL_ENV)).toEqual({
      ok: true,
      name: "billing",
      harness: "scripts/run-billing-rls-harness.ts",
    });
    for (const url of ["http://localhost:54321", "http://[::1]:54321", "http://LOCALHOST.:54321"]) {
      expect(planLocalLaneRun(["staff-role", LOCAL_LANE_FLAG], { SUPABASE_URL: url }).ok).toBe(
        true,
      );
    }
    expect(isLoopbackHost("127.0.0.2")).toBe(false);
  });

  it("refuses the hosted Verdant project and every other remote host", () => {
    for (const url of [
      "https://knkwiiywfkbqznbxwqfh.supabase.co",
      "https://example.supabase.co",
      "http://127.0.0.1.attacker.example:54321",
      "http://10.0.0.5:54321",
    ]) {
      expect(planLocalLaneRun(["ai-credits", LOCAL_LANE_FLAG], { SUPABASE_URL: url })).toEqual({
        ok: false,
        exitCode: 2,
        message: "local security lane requires a loopback database",
      });
    }
  });

  it("refuses without the lane flag, without a URL, or with an invalid URL", () => {
    expect(planLocalLaneRun(["billing"], LOCAL_ENV)).toMatchObject({ ok: false, exitCode: 2 });
    expect(planLocalLaneRun(["billing", LOCAL_LANE_FLAG], {})).toEqual({
      ok: false,
      exitCode: 2,
      message: "missing SUPABASE_URL",
    });
    expect(
      planLocalLaneRun(["billing", LOCAL_LANE_FLAG], { SUPABASE_URL: "not a url" }),
    ).toMatchObject({ ok: false, exitCode: 2, message: "database API URL is invalid" });
  });

  it("only launches allow-listed harnesses, one at a time", () => {
    for (const args of [
      ["../../etc/passwd", LOCAL_LANE_FLAG],
      ["scripts/run-billing-rls-harness.ts", LOCAL_LANE_FLAG],
      ["toString", LOCAL_LANE_FLAG],
      ["billing", "staff-role", LOCAL_LANE_FLAG],
      [LOCAL_LANE_FLAG],
    ]) {
      expect(planLocalLaneRun(args, LOCAL_ENV)).toMatchObject({ ok: false, exitCode: 2 });
    }
  });

  it("points every allow-listed name at a harness file that exists", () => {
    expect(Object.keys(LOCAL_LANE_HARNESSES).sort()).toEqual(
      GRANT_PATH_LANE.map((entry) => entry.name).sort(),
    );
    for (const harness of Object.values(LOCAL_LANE_HARNESSES) as string[]) {
      expect(existsSync(resolve(ROOT, harness)), harness).toBe(true);
    }
  });
});

describe("security-db-local runs the grant-path harnesses", () => {
  it.each(GRANT_PATH_LANE)("$script launches $name through the loopback launcher", (entry) => {
    expect(SCRIPTS[entry.script]).toBe(
      `node scripts/security/run-local-lane-harness.mjs ${entry.name} ${LOCAL_LANE_FLAG}`,
    );
  });

  it.each(GRANT_PATH_LANE)("step $stepId runs $script when the lane is enabled", (entry) => {
    const step = STEPS.find((candidate) => candidate.id === entry.stepId);
    expect(step, entry.stepId).toBeDefined();
    expect(step?.if).toBe("env.ENABLED == 'true'");
    expect(step?.run).toContain("set -o pipefail");
    expect(step?.run).toContain(`bun run ${entry.script} 2>&1 | tee ${entry.stepId}.log`);
  });

  it("runs the grant-path steps after migrations are applied and before the aggregate", () => {
    const index = (predicate: (step: Step) => boolean) => STEPS.findIndex(predicate);
    const reset = index((step) => step.run?.includes("supabase db reset") ?? false);
    const aggregate = index((step) => step.id === "aggregate");
    expect(reset).toBeGreaterThan(-1);
    for (const entry of GRANT_PATH_LANE) {
      const position = index((step) => step.id === entry.stepId);
      expect(position).toBeGreaterThan(reset);
      expect(position).toBeLessThan(aggregate);
    }
  });

  it("uploads each grant-path log on failure", () => {
    const upload = STEPS.find((step) => step.id === "upload-artifacts");
    for (const entry of GRANT_PATH_LANE) {
      expect(upload?.with?.path).toContain(`${entry.stepId}.log`);
    }
  });
});
