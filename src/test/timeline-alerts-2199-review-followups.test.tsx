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
import { resolveAlertContextRefresh } from "@/lib/alertContextRefreshRules";

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

  it("labels a camelCase eventType feeding flat volume as Feed Volume (Codex P2 at 0139bb37)", () => {
    const result = presentTimelineDiaryEntryDetails(
      { eventType: "feeding", volume_ml: "750" },
      "celsius",
    );
    expect(result.detailLines).toContainEqual({
      key: "feeding.volume_ml",
      label: "Feed Volume",
      value: "750 ml",
    });
    expect(result.detailLines.find((l) => l.label === "Water Volume")).toBeUndefined();
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

describe("resolveAlertContextRefresh", () => {
  const stage = { title: "Humidity above stage range", reason: "Seedling 65%–75%." };
  const configured = { title: "Humidity above target", reason: "Configured target 50–70%." };

  it("refreshes a stage/default row to the configured-target wording in the same direction", () => {
    expect(resolveAlertContextRefresh(stage, configured)).toEqual(configured);
    expect(
      resolveAlertContextRefresh(
        { title: "VPD below default range", reason: "x" },
        { title: "VPD below target", reason: "Configured target 0.8–1.2 kPa." },
      ),
    ).toEqual({ title: "VPD below target", reason: "Configured target 0.8–1.2 kPa." });
  });

  it("never rewrites across directions, in reverse, unchanged, or from blank input", () => {
    expect(
      resolveAlertContextRefresh(stage, { title: "Humidity below target", reason: "y" }),
    ).toBeNull();
    expect(resolveAlertContextRefresh(configured, stage)).toBeNull();
    expect(resolveAlertContextRefresh(configured, configured)).toBeNull();
    expect(
      resolveAlertContextRefresh(stage, { title: "Humidity above target", reason: "" }),
    ).toBeNull();
  });
});

describe("resolveAlertContextRefresh after a configured target edit (Codex P2 at a7a61a76)", () => {
  const open = {
    title: "Humidity above target",
    reason: "Humidity is above the configured maximum. Observed 85% (configured target 50–70%).",
  };

  it("refreshes an open configured-target row when the quoted configured range changed", () => {
    const edited = {
      title: "Humidity above target",
      reason: "Humidity is above the configured maximum. Observed 85% (configured target 50–75%).",
    };
    expect(resolveAlertContextRefresh(open, edited)).toEqual(edited);
    // A legacy configured-target row with no quoted range gains the range.
    expect(
      resolveAlertContextRefresh(
        { title: open.title, reason: "Humidity is above the configured maximum." },
        edited,
      ),
    ).toEqual(edited);
  });

  it("never rewrites for a new reading against the same range, across directions, or without a range", () => {
    expect(
      resolveAlertContextRefresh(open, {
        title: "Humidity above target",
        reason:
          "Humidity is above the configured maximum. Observed 88% (configured target 50–70%).",
      }),
    ).toBeNull();
    expect(
      resolveAlertContextRefresh(open, {
        title: "Humidity below target",
        reason:
          "Humidity is below the configured minimum. Observed 40% (configured target 50–75%).",
      }),
    ).toBeNull();
    expect(
      resolveAlertContextRefresh(open, {
        title: "Humidity above target",
        reason: "Humidity is above the configured maximum.",
      }),
    ).toBeNull();
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
