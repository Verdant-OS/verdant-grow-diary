import { describe, expect, it, vi } from "vitest";
import { commitGgsRealPayloadAndRefresh } from "@/lib/ggsRealPayloadCommitOrchestration";

const ARGS = {
  tentId: "33333333-3333-4333-8333-333333333333",
  bridgeId: "55555555-5555-4555-8555-555555555555",
  deviceId: "GGS-PROBE-001",
  payloadText: "{}",
  attested: true,
};

describe("commitGgsRealPayloadAndRefresh", () => {
  it("refreshes exactly once after confirmed success", async () => {
    const commit = vi.fn(async () => ({
      ok: true as const,
      inserted: 3,
      rejected: 0,
    }));
    const onCommitSuccess = vi.fn(async () => undefined);
    await expect(
      commitGgsRealPayloadAndRefresh(ARGS, { commit, onCommitSuccess }),
    ).resolves.toEqual({ ok: true, inserted: 3, rejected: 0 });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(onCommitSuccess).toHaveBeenCalledTimes(1);
  });

  it("does not refresh after a failed commit", async () => {
    const commit = vi.fn(async () => ({
      ok: false as const,
      reason: "payload_rejected",
    }));
    const onCommitSuccess = vi.fn(async () => undefined);
    await expect(
      commitGgsRealPayloadAndRefresh(ARGS, { commit, onCommitSuccess }),
    ).resolves.toEqual({ ok: false, reason: "payload_rejected" });
    expect(onCommitSuccess).not.toHaveBeenCalled();
  });

  it("does not refresh when the server cannot confirm the complete cohort", async () => {
    const commit = vi.fn(async () => ({
      ok: false as const,
      reason: "commit_not_confirmed",
    }));
    const onCommitSuccess = vi.fn(async () => undefined);
    await expect(
      commitGgsRealPayloadAndRefresh(ARGS, { commit, onCommitSuccess }),
    ).resolves.toEqual({ ok: false, reason: "commit_not_confirmed" });
    expect(onCommitSuccess).not.toHaveBeenCalled();
  });

  it("does not rewrite a successful commit when refresh fails", async () => {
    const commit = vi.fn(async () => ({
      ok: true as const,
      inserted: 3,
      rejected: 0,
    }));
    const onCommitSuccess = vi.fn(async () => {
      throw new Error("query refresh failed");
    });
    await expect(
      commitGgsRealPayloadAndRefresh(ARGS, { commit, onCommitSuccess }),
    ).resolves.toEqual({ ok: true, inserted: 3, rejected: 0 });
    expect(onCommitSuccess).toHaveBeenCalledTimes(1);
  });
});
