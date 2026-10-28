import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatRestorationDiagnostics,
  observeRestorationFailures,
  restoreCensusField,
  type CensusFieldTarget,
  type RestorationContext,
  type RestorationFailure,
} from "../../e2e/lib/censusRestoration";

afterEach(() => vi.useRealTimers());

function fixture() {
  const field = document.createElement("textarea");
  field.id = "whats_friction";
  field.name = "whats_friction";
  field.value = "Verdant browser census";
  document.body.appendChild(field);
  const fill = vi.fn(async (value: string) => {
    field.value = value;
  });
  const evaluate = vi.fn(async (fn, arg) => fn(field, arg));
  const target = { fill, evaluate } as unknown as CensusFieldTarget;
  const failures: RestorationFailure[] = [];
  return { field, fill, evaluate, target, failures };
}

async function finish<T>(result: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return result;
}

describe("census restoration diagnostics preserve strict outcomes", () => {
  it("restores once and succeeds only after the existing persistence interval", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const poll = vi.fn(async () => expect(f.field.value).toBe(""));
    let completed = false;
    const result = restoreCensusField(f.target, "", poll, f.failures, "pinned").then((value) => {
      completed = true;
      return value;
    });
    await vi.advanceTimersByTimeAsync(249);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe(true);
    expect(f.fill).toHaveBeenCalledExactlyOnceWith("", { timeout: 5_000 });
    expect(poll).toHaveBeenCalledOnce();
    expect(f.failures).toEqual([]);
    expect(f.evaluate).toHaveBeenCalledOnce(); // no diagnostic observation on success
  });

  it("identifies fill failure and keeps its error without polling or retrying", async () => {
    const f = fixture();
    const error = new Error("field is not editable");
    error.name = "TimeoutError";
    f.fill.mockRejectedValue(error);
    const poll = vi.fn();
    expect(await restoreCensusField(f.target, "", poll, f.failures, "replacement")).toBe(false);
    expect(f.evaluate).not.toHaveBeenCalled(); // Observations cannot delay fallback decisions.
    await observeRestorationFailures(f.failures, { pinned: f.target, replacement: f.target });
    expect(poll).not.toHaveBeenCalled();
    expect(f.fill).toHaveBeenCalledOnce();
    expect(f.failures).toMatchObject([
      {
        phase: "fill",
        target: "replacement",
        expected: "",
        error: { name: "TimeoutError", message: "field is not editable" },
        observed: { connected: true, value: "Verdant browser census", name: "whats_friction" },
      },
    ]);
  });

  it("distinguishes a poll mismatch from fill failure", async () => {
    const f = fixture();
    const poll = vi.fn(async () => {
      f.field.value = "Verdant browser census";
      throw new Error("value never matched");
    });
    expect(await restoreCensusField(f.target, "", poll, f.failures, "pinned")).toBe(false);
    await observeRestorationFailures(f.failures, { pinned: f.target, replacement: f.target });
    expect(f.failures[0]).toMatchObject({
      phase: "match",
      observed: { connected: true, value: "Verdant browser census" },
      error: { message: "value never matched" },
    });
    expect(f.fill).toHaveBeenCalledOnce();
    expect(poll).toHaveBeenCalledOnce();
  });

  it("still fails a connected field that accepts empty and later reverts", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.field.focus();
    const result = restoreCensusField(
      f.target,
      "",
      async () => {
        expect(f.field.value).toBe("");
        setTimeout(() => {
          f.field.value = "Verdant browser census";
          f.field.setSelectionRange(4, 8);
        }, 100);
      },
      f.failures,
      "pinned",
    );
    expect(await finish(result)).toBe(false);
    await observeRestorationFailures(f.failures, { pinned: f.target, replacement: f.target });
    expect(f.failures[0]).toMatchObject({
      phase: "settle",
      expected: "",
      observed: {
        connected: true,
        value: "Verdant browser census",
        focused: true,
        selectionStart: 4,
        selectionEnd: 8,
      },
    });
    expect(f.fill).toHaveBeenCalledOnce();
  });

  it("does not turn detachment into success", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const result = restoreCensusField(
      f.target,
      "",
      async () => {
        f.field.remove();
      },
      f.failures,
      "pinned",
    );
    expect(await finish(result)).toBe(false);
    await observeRestorationFailures(f.failures, { pinned: f.target, replacement: f.target });
    expect(f.failures[0]).toMatchObject({ phase: "settle", observed: { connected: false } });
  });

  it("keeps assertion and observation errors separate when a handle is unreadable", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.evaluate.mockRejectedValue(new Error("execution context destroyed"));
    expect(
      await finish(restoreCensusField(f.target, "", async () => {}, f.failures, "pinned")),
    ).toBe(false);
    await observeRestorationFailures(f.failures, { pinned: f.target, replacement: f.target });
    expect(f.failures[0]).toMatchObject({
      phase: "settle",
      observed: null,
      error: { message: "execution context destroyed" },
      observationError: { message: "execution context destroyed" },
    });
  });
});

describe("failure-only diagnostic output", () => {
  function context(): RestorationContext {
    return {
      route: "/feedback",
      field: 'Feedback "field"\nnext line',
      type: "textarea",
      original: { known: false, error: { name: "Error", message: "original read failed" } },
      live: null,
      liveMatchesPinned: false,
      liveHoldsPlaceholder: true,
    };
  }

  it("records an unknown original honestly and retains ordered pinned/replacement attempts", () => {
    const c = context();
    const attempts: RestorationFailure[] = ["pinned", "replacement"].map((target) => ({
      phase: "fill",
      target: target as RestorationFailure["target"],
      expected: "",
      observed: null,
    }));
    const output = formatRestorationDiagnostics(c, attempts);
    const parsed = JSON.parse(output);
    expect(parsed.context.original).toEqual(c.original);
    expect(parsed.context.original).not.toHaveProperty("value");
    expect(parsed.attempts.map((attempt) => attempt.target)).toEqual(["pinned", "replacement"]);
    expect(parsed.context.field).toBe(c.field);
    expect(output).not.toContain("\n");
  });

  it("bounds strings and redacts sensitive values and error messages", () => {
    const c = context();
    c.type = "password";
    c.original = { known: true, value: "do-not-print" };
    const failure: RestorationFailure = {
      phase: "fill",
      target: "pinned",
      expected: "do-not-print",
      observed: null,
      error: { name: "Error", message: "fill do-not-print" },
    };
    const output = formatRestorationDiagnostics(c, [failure]);
    expect(output).not.toContain("do-not-print");
    expect(JSON.parse(output).context.original.value).toBe("[redacted]");
    expect(JSON.parse(output).attempts[0].expected).toBe("[redacted]");
    c.type = "textarea";
    c.field = "x".repeat(2_000);
    expect(JSON.parse(formatRestorationDiagnostics(c, [])).context.field).toHaveLength(513);
  });
});
