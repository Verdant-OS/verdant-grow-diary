/**
 * #2199 review follow-ups: diary photo membership after an edit, and bounded
 * recovery of a failed grow_targets read for fail-closed alert persistence.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTimelineDiaryPhotoEdit } from "@/lib/timelineChipCountRules";
import { growTargetsRetryDelayMs } from "@/lib/growTargetsRetryRules";

const targetsRead = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => targetsRead() }),
      }),
    }),
  },
}));

const authState = vi.hoisted(() => ({ user: { id: "owner-1" } }));
vi.mock("@/store/auth", () => ({
  useAuth: () => authState,
}));

import { useGrowTargets } from "@/hooks/useGrowTargets";

describe("applyTimelineDiaryPhotoEdit", () => {
  const URL = "https://cdn.example/leaf.jpg";

  it("drops a card from Photos when the edit removes its only photo reference (CodeRabbit at 67fef7ac)", () => {
    const before = { id: "e1", photo_url: null, details: { photo_url: URL } };
    const after = { id: "e1", photo_url: null, details: { event_type: "note" } };
    const next = applyTimelineDiaryPhotoEdit(new Set(["e1", "e2"]), before, after, "owner-1");
    expect([...next]).toEqual(["e2"]);
  });

  it("adds a card when the edit adds a photo reference", () => {
    const before = { id: "e1", photo_url: null, details: {} };
    const after = { id: "e1", photo_url: null, details: { photo_url: URL } };
    expect(applyTimelineDiaryPhotoEdit(new Set(), before, after, "owner-1").has("e1")).toBe(true);
  });

  it("keeps membership held outside the edited fields (no delta -> same set)", () => {
    const current = new Set(["e1"]);
    const before = { id: "e1", photo_url: null, details: { event_type: "note" } };
    const after = { id: "e1", photo_url: null, details: { event_type: "observation" } };
    expect(applyTimelineDiaryPhotoEdit(current, before, after, "owner-1")).toBe(current);
    expect(applyTimelineDiaryPhotoEdit(current, null, after, "owner-1")).toBe(current);
  });
});

describe("growTargetsRetryDelayMs", () => {
  it("backs off and then stops", () => {
    expect(growTargetsRetryDelayMs(0)).toBe(5_000);
    expect(growTargetsRetryDelayMs(1)).toBe(15_000);
    expect(growTargetsRetryDelayMs(5)).toBe(120_000);
    expect(growTargetsRetryDelayMs(6)).toBeNull();
    expect(growTargetsRetryDelayMs(-1)).toBeNull();
    expect(growTargetsRetryDelayMs(1.5)).toBeNull();
  });
});

describe("useGrowTargets retryOnUnavailable (CodeRabbit at 67fef7ac)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    targetsRead.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("recovers from a transient read error without a remount", async () => {
    targetsRead
      .mockResolvedValueOnce({ data: null, error: { message: "network" } })
      .mockResolvedValueOnce({ data: { grow_id: "g1", rh_min: 50, rh_max: 70 }, error: null });
    const { result } = renderHook(() => useGrowTargets("g1", { retryOnUnavailable: true }));
    await flush();
    expect(result.current.status).toBe("unavailable");
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await flush();
    expect(result.current.status).toBe("ok");
    expect(result.current.targets).toEqual({ rh: { min: 50, max: 70 } });
  });

  it("does not retry unless the caller opts in", async () => {
    targetsRead.mockResolvedValue({ data: null, error: { message: "network" } });
    const { result } = renderHook(() => useGrowTargets("g1"));
    await flush();
    expect(result.current.status).toBe("unavailable");
    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    await flush();
    expect(targetsRead).toHaveBeenCalledTimes(1);
  });
});
