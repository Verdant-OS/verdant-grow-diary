import { describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import {
  buildPerformanceReceipt,
  PERFORMANCE_ORIGIN,
  performanceContextIssue,
  readPublicDeploymentIdentity,
  type PerformanceContext,
  type PerformanceSample,
} from "../../e2e/lib/signedInPerformanceRules";
import {
  measureSignedInPerformance,
  readLivePerformanceIdentity,
} from "../../e2e/lib/signedInPerformanceProbe";

const sha = "a".repeat(40);
const identity = { origin: PERFORMANCE_ORIGIN, commit: sha, dirty: false as const };
const context: PerformanceContext = {
  operation: "dashboard-ready",
  origin: PERFORMANCE_ORIGIN,
  expectedSha: sha,
  fixtureVerified: true,
};
const sample: PerformanceSample = {
  ...context,
  before: identity,
  after: identity,
  startedMs: 10,
  finishedMs: 35,
  confirmed: true,
};
describe("signed-in performance receipts", () => {
  it.each(["dashboard-ready", "timeline-ready", "sensors-ready"] as const)(
    "accepts positive read-only account proof for %s without claiming an active plant",
    (operation) => {
      expect(
        buildPerformanceReceipt({
          ...sample,
          operation,
          fixtureVerified: false,
          accountVerified: true,
        }),
      ).toMatchObject({ status: "PASS", elapsedMs: 25, verification: "fixture-account-read-only" });
    },
  );
  it("does not let account-only proof authorize a Quick Log save", () => {
    expect(
      buildPerformanceReceipt({
        ...sample,
        operation: "quicklog-save-confirmed",
        fixtureVerified: false,
        accountVerified: true,
      }),
    ).toMatchObject({
      status: "BLOCKED",
      elapsedMs: null,
      reason: "owned_active_fixture_required",
    });
  });
  it("withholds timing when the operation invalidates its safety proof", async () => {
    const result = await measureSignedInPerformance(context, {
      readIdentity: async () => identity,
      run: async () => {},
      assertComplete: async () => {
        throw new Error("read_only_write_attempted");
      },
    } as Parameters<typeof measureSignedInPerformance>[1]);
    expect(result.receipt).toMatchObject({
      status: "BLOCKED",
      reason: "operation_postcondition_failed",
      elapsedMs: null,
    });
  });
  it("records confirmed readiness against one exact deployment without inventing a speed budget", () => {
    expect(buildPerformanceReceipt(sample)).toMatchObject({
      status: "PASS",
      elapsedMs: 25,
      observedSha: sha,
      metric: "navigation-to-control-ready",
      performanceBudgetVerdict: "NOT_MEASURED",
    });
  });
  it("uses save-confirmation semantics for Quick Log and accepts zero-resolution elapsed time", () => {
    expect(
      buildPerformanceReceipt({ ...sample, operation: "quicklog-save-confirmed", finishedMs: 10 }),
    ).toMatchObject({ status: "PASS", elapsedMs: 0, metric: "save-click-to-confirmation" });
  });
  it.each([null, undefined, {}, { operation: "injected" }])(
    "handles absent/invalid sample %j without throwing",
    (value) => {
      expect(buildPerformanceReceipt(value)).toMatchObject({ status: "BLOCKED", elapsedMs: null });
    },
  );
  it.each([false, undefined, "true"])("requires positive fixture proof %j", (fixtureVerified) => {
    expect(buildPerformanceReceipt({ ...sample, fixtureVerified })).toMatchObject({
      status: "BLOCKED",
      reason: "owned_active_fixture_required",
      elapsedMs: null,
    });
  });
  it.each([
    "http://localhost:8080",
    "https://evil.example",
    "https://verdantgrowdiary.com.evil.example",
  ])("refuses another host %s", (origin) => {
    expect(buildPerformanceReceipt({ ...sample, origin })).toMatchObject({
      status: "BLOCKED",
      origin: null,
    });
  });
  it.each(["", "A".repeat(40), "token", null])(
    "refuses unpinned expected SHA %j",
    (expectedSha) => {
      expect(buildPerformanceReceipt({ ...sample, expectedSha })).toMatchObject({
        status: "BLOCKED",
        expectedSha: null,
      });
    },
  );
  it.each([null, { ...identity, dirty: true }, { ...identity, commit: "invalid" }])(
    "refuses missing/dirty/invalid deployment evidence %j",
    (after) => {
      expect(buildPerformanceReceipt({ ...sample, after })).toMatchObject({
        status: "BLOCKED",
        elapsedMs: null,
      });
    },
  );
  it("refuses either an initial mismatch or a deployment change during the operation", () => {
    for (const field of ["before", "after"] as const)
      expect(
        buildPerformanceReceipt({ ...sample, [field]: { ...identity, commit: "b".repeat(40) } }),
      ).toMatchObject({
        status: "BLOCKED",
        reason: "deployment_changed_or_mismatched",
        elapsedMs: null,
      });
  });
  it.each([
    [null, 35],
    [undefined, 35],
    [NaN, 35],
    [Infinity, 35],
    [-1, 35],
    [10, null],
    [10, NaN],
    [10, Infinity],
    [35, 10],
  ])("never passes an invalid monotonic clock (%j, %j)", (startedMs, finishedMs) => {
    expect(buildPerformanceReceipt({ ...sample, startedMs, finishedMs })).toMatchObject({
      status: "NOT_MEASURED",
      reason: "invalid_monotonic_clock",
      elapsedMs: null,
    });
  });
  it("keeps failed and unexecuted operations separate from recorded measurement", () => {
    expect(buildPerformanceReceipt({ ...sample, confirmed: false })).toMatchObject({
      status: "FAIL",
      elapsedMs: null,
    });
    expect(buildPerformanceReceipt({ ...sample, confirmed: null })).toMatchObject({
      status: "NOT_MEASURED",
      elapsedMs: null,
    });
  });
  it("is deterministic and does not mutate the injected evidence", () => {
    const original = JSON.stringify(sample);
    expect(buildPerformanceReceipt(sample)).toEqual(buildPerformanceReceipt(sample));
    expect(JSON.stringify(sample)).toBe(original);
  });
  it("reads only a clean canonical public commit property at HTTP 200", () => {
    const url = PERFORMANCE_ORIGIN + "/version.json";
    expect(readPublicDeploymentIdentity({ commit: sha, dirty: false }, url, 200)).toEqual(identity);
    for (const body of [null, {}, { sha, dirty: false }, { commit: sha, dirty: true }])
      expect(readPublicDeploymentIdentity(body, url, 200)).toBeNull();
    expect(readPublicDeploymentIdentity({ commit: sha, dirty: false }, url, 404)).toBeNull();
    expect(
      readPublicDeploymentIdentity(
        { commit: sha, dirty: false },
        "https://evil.example/version.json",
        200,
      ),
    ).toBeNull();
    expect(performanceContextIssue(null)).toBe("operation_missing");
  });
});
describe("signed-in performance execution fence", () => {
  const deps = () => ({
    readIdentity: vi.fn(async () => identity),
    run: vi.fn(async () => undefined),
    clock: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(35),
  });
  it("executes once and brackets confirmation with exact deployment observations", async () => {
    const d = deps();
    const result = await measureSignedInPerformance(context, d);
    expect(result.receipt).toMatchObject({ status: "PASS", elapsedMs: 25 });
    expect(d.run).toHaveBeenCalledTimes(1);
    expect(d.readIdentity).toHaveBeenCalledTimes(2);
  });
  it("does not request metadata or execute without owned fixture proof", async () => {
    const d = deps();
    const result = await measureSignedInPerformance({ ...context, fixtureVerified: false }, d);
    expect(result.receipt.status).toBe("BLOCKED");
    expect(d.run).not.toHaveBeenCalled();
    expect(d.readIdentity).not.toHaveBeenCalled();
  });
  it.each([null, { ...identity, commit: "b".repeat(40) }, { ...identity, dirty: true }])(
    "does not execute with missing/mismatched/dirty identity %j",
    async (value) => {
      const d = deps();
      d.readIdentity.mockResolvedValue(value as typeof identity);
      expect((await measureSignedInPerformance(context, d)).receipt.status).toBe("BLOCKED");
      expect(d.run).not.toHaveBeenCalled();
    },
  );
  it("never executes with a throwing clock and does not manufacture elapsed time", async () => {
    const d = deps();
    d.clock.mockReset().mockImplementation(() => {
      throw new Error("clock");
    });
    expect((await measureSignedInPerformance(context, d)).receipt).toMatchObject({
      status: "NOT_MEASURED",
      elapsedMs: null,
    });
    expect(d.run).not.toHaveBeenCalled();
  });
  it("rechecks action preconditions after metadata and before starting the clock", async () => {
    const d = deps();
    const order: string[] = [];
    d.readIdentity.mockImplementation(async () => {
      order.push("identity");
      return identity;
    });
    d.clock.mockReset().mockImplementation(() => {
      order.push("clock");
      return order.length;
    });
    d.run.mockImplementation(async () => {
      order.push("run");
    });
    const assertReady = vi.fn(async () => {
      order.push("guard");
    });
    expect((await measureSignedInPerformance(context, { ...d, assertReady })).receipt.status).toBe(
      "PASS",
    );
    expect(order).toEqual(["identity", "guard", "clock", "run", "clock", "identity"]);
  });
  it("never executes or times a save when its fresh target guard fails", async () => {
    const d = deps();
    const error = new Error("target changed");
    const assertReady = vi.fn(async () => {
      throw error;
    });
    const result = await measureSignedInPerformance(context, { ...d, assertReady });
    expect(result.receipt).toMatchObject({
      status: "BLOCKED",
      reason: "operation_precondition_failed",
      elapsedMs: null,
    });
    expect(result.error).toBe(error);
    expect(d.clock).not.toHaveBeenCalled();
    expect(d.run).not.toHaveBeenCalled();
  });
  it("preserves action failure and exposes no exception text in receipt", async () => {
    const d = deps();
    const error = new Error("private-action-detail");
    d.run.mockRejectedValue(error);
    const result = await measureSignedInPerformance(context, d);
    expect(result.error).toBe(error);
    expect(result.receipt.status).toBe("FAIL");
    expect(JSON.stringify(result.receipt)).not.toContain(error.message);
  });
  it("invalidates confirmation when the deployed SHA changes afterward", async () => {
    const d = deps();
    d.readIdentity
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce({ ...identity, commit: "b".repeat(40) });
    expect((await measureSignedInPerformance(context, d)).receipt.status).toBe("BLOCKED");
    expect(d.run).toHaveBeenCalledTimes(1);
  });
  it("bounds public metadata reads without redirects and records no headers", async () => {
    const get = vi.fn(async () => ({
      status: () => 200,
      url: () => PERFORMANCE_ORIGIN + "/version.json",
      json: async () => ({ commit: sha, dirty: false, private: "not-exported" }),
    }));
    expect(
      await readLivePerformanceIdentity({ request: { get } } as unknown as Pick<Page, "request">),
    ).toEqual(identity);
    expect(get).toHaveBeenCalledWith(PERFORMANCE_ORIGIN + "/version.json", {
      timeout: 10_000,
      maxRedirects: 0,
    });
  });
  it("refuses metadata failures without inspecting credentials or retrying", async () => {
    const get = vi.fn(async () => {
      throw new Error("transport");
    });
    expect(
      await readLivePerformanceIdentity({ request: { get } } as unknown as Pick<Page, "request">),
    ).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });
});
