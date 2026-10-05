import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  DEPLOY_WAIT_ORIGIN,
  readDeployedCommit,
  waitForDeployedSha,
} from "../../scripts/wait-for-deployed-sha.mjs";

const ROOT = resolve(__dirname, "../..");
const SHA = "a".repeat(40);
const OLD = "b".repeat(40);

type Step = { name?: string; run?: string; if?: string };
type Job = { steps: Step[]; "timeout-minutes": number };
function jobSteps(workflow: string, job: string): Job {
  const doc = load(readFileSync(resolve(ROOT, ".github/workflows", workflow), "utf8")) as {
    jobs: Record<string, Job>;
  };
  return doc.jobs[job];
}
function stepIndex(steps: Step[], name: string) {
  return steps.findIndex((step) => step.name === name);
}

function response(body: unknown, status = 200, type: ResponseType = "basic") {
  return {
    status,
    type,
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
  } as unknown as Response;
}

function fakeClock() {
  let now = 0;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    sleeps,
  };
}

describe("readDeployedCommit", () => {
  it("accepts only a clean 40-hex commit from a 200 response", async () => {
    expect(await readDeployedCommit(response({ commit: SHA, dirty: false }))).toBe(SHA);
    expect(await readDeployedCommit(response({ commit: SHA, dirty: true }))).toBeNull();
    expect(await readDeployedCommit(response({ commit: SHA }))).toBeNull();
    expect(await readDeployedCommit(response({ commit: "abc", dirty: false }))).toBeNull();
    expect(await readDeployedCommit(response({ commit: SHA, dirty: false }, 302))).toBeNull();
    expect(
      await readDeployedCommit(response({ commit: SHA, dirty: false }, 200, "opaqueredirect")),
    ).toBeNull();
    expect(await readDeployedCommit(response(new Error("bad json")))).toBeNull();
    expect(await readDeployedCommit(response(null))).toBeNull();
  });
});

describe("waitForDeployedSha", () => {
  it("passes at once when the pinned SHA is already live", async () => {
    const clock = fakeClock();
    const urls: string[] = [];
    const result = await waitForDeployedSha({
      expectedSha: SHA,
      fetchImpl: async (url) => {
        urls.push(String(url));
        return response({ commit: SHA, dirty: false });
      },
      ...clock,
    });
    expect(result).toEqual({ status: "PASS", observedCommit: SHA, attempts: 1 });
    expect(urls).toEqual([`${DEPLOY_WAIT_ORIGIN}/version.json`]);
    expect(clock.sleeps).toEqual([]);
  });

  it("waits for publishing to replace the previous SHA", async () => {
    const clock = fakeClock();
    const served = [OLD, OLD, SHA];
    const result = await waitForDeployedSha({
      expectedSha: SHA,
      intervalMs: 30_000,
      fetchImpl: async () => response({ commit: served.shift(), dirty: false }),
      ...clock,
    });
    expect(result).toEqual({ status: "PASS", observedCommit: SHA, attempts: 3 });
    expect(clock.sleeps).toEqual([30_000, 30_000]);
  });

  it("reports BLOCKED, never PASS, when the SHA is not live within the bound", async () => {
    const clock = fakeClock();
    const result = await waitForDeployedSha({
      expectedSha: SHA,
      timeoutMs: 120_000,
      intervalMs: 30_000,
      fetchImpl: async () => response({ commit: OLD, dirty: false }),
      ...clock,
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.observedCommit).toBe(OLD);
    expect(result.attempts).toBe(5);
    expect(clock.now()).toBe(120_000);
  });

  it("treats network errors and dirty builds as not deployed", async () => {
    const clock = fakeClock();
    const result = await waitForDeployedSha({
      expectedSha: SHA,
      timeoutMs: 60_000,
      intervalMs: 30_000,
      fetchImpl: async (_url, init) => {
        expect(init).toMatchObject({ redirect: "manual", cache: "no-store" });
        if (clock.now() === 0) throw new Error("offline");
        return response({ commit: SHA, dirty: true });
      },
      ...clock,
    });
    expect(result).toEqual({ status: "BLOCKED", observedCommit: null, attempts: 3 });
  });

  it("rejects a malformed expected SHA without any request", async () => {
    let called = false;
    const result = await waitForDeployedSha({
      expectedSha: "main",
      fetchImpl: async () => {
        called = true;
        return response({ commit: SHA, dirty: false });
      },
      ...fakeClock(),
    });
    expect(result).toEqual({ status: "BLOCKED", observedCommit: null, attempts: 0 });
    expect(called).toBe(false);
  });
});

describe("production probes wait for the pinned SHA to be live", () => {
  it("waits in the signed-in read-only job before installing or measuring", () => {
    const job = jobSteps("signed-in-readonly-performance.yml", "signed-in-readonly-performance");
    const wait = stepIndex(job.steps, "Wait for the pinned SHA to be live");
    expect(wait).toBeGreaterThan(stepIndex(job.steps, "Pin current deploy SHA"));
    expect(wait).toBeLessThan(stepIndex(job.steps, "Measure three signed-in read-only routes"));
    expect(job.steps[wait].run).toContain("node scripts/wait-for-deployed-sha.mjs");
    expect(job["timeout-minutes"]).toBeGreaterThanOrEqual(40);
  });

  it("waits in the Quick Log smoke job before fixture verification and saves", () => {
    const job = jobSteps("quicklog-smoke.yml", "quicklog-smoke");
    const wait = stepIndex(job.steps, "Wait for the pinned SHA to be live");
    expect(wait).toBeGreaterThan(stepIndex(job.steps, "Verify required configuration"));
    expect(wait).toBeLessThan(stepIndex(job.steps, "Verify disposable E2E fixture"));
    expect(wait).toBeLessThan(stepIndex(job.steps, "Run Quick Log Playwright smoke"));
    expect(job.steps[wait].if).toBe("steps.e2e_config.outputs.should_run == 'true'");
    expect(job.steps[wait].run).toContain("node scripts/wait-for-deployed-sha.mjs");
    expect(job["timeout-minutes"]).toBeGreaterThanOrEqual(45);
  });
});

describe("signed-in read-only measurement triggers", () => {
  it("measures after deploy-branch pushes that change the measured application", () => {
    const doc = load(
      readFileSync(resolve(ROOT, ".github/workflows/signed-in-readonly-performance.yml"), "utf8"),
    ) as { on: { push: { branches: string[]; paths?: string[] } } };
    const push = doc.on.push;
    expect(push.branches).toEqual(["verdant-grow-diary"]);
    // Dashboard, Timeline and Sensors are built from src/ (the root route owns the HTML) and build inputs.
    for (const surface of ["src/**", "public/**", "vite.config.ts", "package.json", "bun.lock"])
      expect(push.paths).toContain(surface);
    expect(push.paths).toContain("e2e/signed-in-performance.spec.ts");
  });
});
