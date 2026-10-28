import { describe, expect, it, vi } from "vitest";
import { CriticalReadDeadlineError } from "@/lib/boundedReadRules";
import { manualReportTags, scrubEvent } from "@/lib/errorReportingRules";
import {
  classifyGrowReadFailure,
  readWithGrowRetry,
  type GrowReadFailure,
} from "@/lib/growsReadRetryRules";

const network: GrowReadFailure = { kind: "network", code: "network" };
const timeout: GrowReadFailure = { kind: "timeout", code: "critical_read_deadline" };

describe("grows read retry", () => {
  it("returns the list after a transient failure", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const read = vi
      .fn<() => Promise<{ ok: true; value: string[] } | { ok: false; failure: GrowReadFailure }>>()
      .mockResolvedValueOnce({ ok: false, failure: network })
      .mockResolvedValueOnce({ ok: true, value: ["grow-1"] });

    const outcome = await readWithGrowRetry(read, sleep, [10, 20]);

    expect(outcome).toEqual({ ok: true, value: ["grow-1"] });
    expect(read).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("returns the last failure when every attempt fails", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const read = vi.fn(async () => ({ ok: false as const, failure: network }));

    const outcome = await readWithGrowRetry(read, sleep, [5, 15]);

    expect(outcome).toEqual({ ok: false, failure: network });
    expect(read).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([5, 15]);
  });

  it("classifies the deadline as a timeout and surfaces it after the retries", async () => {
    expect(classifyGrowReadFailure(new CriticalReadDeadlineError())).toEqual(timeout);
    expect(
      classifyGrowReadFailure({ code: "PGRST301", message: "jwt expired for user@example.com" }),
    ).toEqual({
      kind: "db",
      code: "PGRST301",
    });
    expect(
      classifyGrowReadFailure(new TypeError("Failed to fetch https://secret.example")),
    ).toEqual(network);

    const sleep = vi.fn(async (_ms: number) => {});
    const read = vi.fn(async () => ({
      ok: false as const,
      failure: classifyGrowReadFailure(new CriticalReadDeadlineError()),
    }));

    const outcome = await readWithGrowRetry(read, sleep, [1]);

    expect(outcome).toEqual({ ok: false, failure: timeout });
    expect(read).toHaveBeenCalledTimes(2);

    const tags = manualReportTags({
      source: "grows_provider",
      handled: true,
      failureKind: "timeout",
      failureCode: "critical_read_deadline",
    });
    expect(scrubEvent({ tags, message: "bearer token secret" }).tags).toEqual(tags);
    expect(
      scrubEvent({ tags: { failure_kind: "db", failure_code: "email@example.com" } }).tags,
    ).toEqual({
      failure_kind: "db",
    });
  });
});
