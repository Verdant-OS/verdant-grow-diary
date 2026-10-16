import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CRITICAL_READ_DEADLINE_MS,
  CriticalReadDeadlineError,
  withCriticalReadDeadline,
} from "@/lib/boundedReadRules";

describe("withCriticalReadDeadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the work result when it finishes before the default deadline", async () => {
    const result = await withCriticalReadDeadline(Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("rejects with CriticalReadDeadlineError when work never settles", async () => {
    const pending = withCriticalReadDeadline(new Promise<string>(() => {}));
    const rejection = expect(pending).rejects.toBeInstanceOf(CriticalReadDeadlineError);
    await vi.advanceTimersByTimeAsync(CRITICAL_READ_DEADLINE_MS);
    await rejection;
  });

  it("uses a custom timeout when provided", async () => {
    const pending = withCriticalReadDeadline(new Promise<string>(() => {}), 1_500);
    const rejection = expect(pending).rejects.toBeInstanceOf(CriticalReadDeadlineError);
    await vi.advanceTimersByTimeAsync(1_499);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
  });

  it("clears the timer when work completes first so a later tick does not reject", async () => {
    let resolveWork!: (value: number) => void;
    const work = new Promise<number>((resolve) => {
      resolveWork = resolve;
    });
    const pending = withCriticalReadDeadline(work, 100);
    resolveWork(42);
    await expect(pending).resolves.toBe(42);
    await vi.advanceTimersByTimeAsync(CRITICAL_READ_DEADLINE_MS);
  });

  it("exposes a stable error code for callers", () => {
    expect(new CriticalReadDeadlineError().code).toBe("critical_read_deadline");
    expect(new CriticalReadDeadlineError().message).toBe("critical_read_deadline");
  });
});
