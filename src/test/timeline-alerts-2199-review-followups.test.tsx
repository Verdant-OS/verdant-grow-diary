/**
 * #2199 review follow-ups: diary photo membership after an edit, and bounded
 * recovery of a failed grow_targets read for fail-closed alert persistence.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTimelineDiaryPhotoEdit,
  resolveTimelineDiaryPhotoReferenceSource,
} from "@/lib/timelineChipCountRules";
import { presentTimelineDiaryEntryDetails } from "@/lib/timelineDiaryEntryDetailPresentationRules";
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
    const next = applyTimelineDiaryPhotoEdit(
      new Set(["e1", "e2"]),
      { ...before, photoReferenceSource: "details" },
      { event_type: "note" },
      "owner-1",
    );
    expect([...next.photoIds]).toEqual(["e2"]);
  });

  it("clears the projected URL when the details fallback photo is removed (Codex P2 at 222a7332)", () => {
    // The loader projected details.photo_url into the row's photo_url.
    const loaded = { id: "e1", photo_url: null, details: { photo_url: URL } };
    const source = resolveTimelineDiaryPhotoReferenceSource(loaded, "owner-1");
    expect(source).toBe("details");
    const projected = { ...loaded, photo_url: URL, photoReferenceSource: source };
    const next = applyTimelineDiaryPhotoEdit(
      new Set(["e1"]),
      projected,
      { event_type: "note" },
      "owner-1",
    );
    expect(next.photo_url).toBeNull();
    expect(next.photoReferenceSource).toBeNull();
    expect(next.photoIds.has("e1")).toBe(false);
  });

  it("keeps a top-level photo when a details edit removes an unused fallback", () => {
    const loaded = { id: "e1", photo_url: URL, details: { photo_url: URL } };
    expect(resolveTimelineDiaryPhotoReferenceSource(loaded, "owner-1")).toBe("top");
    const current = new Set(["e1"]);
    const next = applyTimelineDiaryPhotoEdit(
      current,
      { ...loaded, photoReferenceSource: "top" },
      {},
      "owner-1",
    );
    expect(next.photo_url).toBe(URL);
    expect(next.photoIds).toBe(current);
  });

  it("adds a card and projects the URL when the edit adds an external fallback photo", () => {
    const next = applyTimelineDiaryPhotoEdit(
      new Set(),
      { id: "e1", photo_url: null, details: {}, photoReferenceSource: null },
      { photo_url: URL },
      "owner-1",
    );
    expect(next.photoIds.has("e1")).toBe(true);
    expect(next.photo_url).toBe(URL);
    expect(next.photoReferenceSource).toBe("details");
  });
});

describe("presentTimelineDiaryEntryDetails string volumes (Codex P2 at 222a7332)", () => {
  it("appends ml to a bare numeric string volume", () => {
    const result = presentTimelineDiaryEntryDetails(
      { event_type: "watering", watering_amount_ml: "500" },
      "celsius",
    );
    expect(result.detailLines).toContainEqual({
      key: "watering.volume_ml",
      label: "Water Volume",
      value: "500 ml",
    });
  });

  it("keeps unit-bearing volume text verbatim", () => {
    const result = presentTimelineDiaryEntryDetails(
      { event_type: "watering", watering_amount_ml: "2 L" },
      "celsius",
    );
    const line = result.detailLines.find((l) => l.label === "Water Volume");
    expect(line?.value).toBe("2 L");
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
