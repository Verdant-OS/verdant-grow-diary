import { describe, expect, it } from "vitest";
import {
  buildTimelineDeferredPhotoAriaLabel,
  selectTimelineEagerPhotoIds,
  TIMELINE_DEFERRED_PHOTO_COPY,
  TIMELINE_EAGER_PHOTO_LIMIT,
} from "@/lib/timelinePhotoDeferralRules";

const row = (id: string, photo: boolean) => ({
  id,
  photo_url: photo ? `https://x/${id}.jpg` : null,
});

describe("selectTimelineEagerPhotoIds", () => {
  it("keeps the first `limit` photo rows in the order given", () => {
    const rows = ["a", "b", "c", "d"].map((id) => row(id, true));
    expect([...selectTimelineEagerPhotoIds(rows, new Set(), 2)]).toEqual(["a", "b"]);
  });

  it("does not count rows without a photo", () => {
    const rows = [
      row("t1", false),
      row("a", true),
      row("t2", false),
      row("b", true),
      row("c", true),
    ];
    expect([...selectTimelineEagerPhotoIds(rows, new Set(), 2)]).toEqual(["a", "b"]);
  });

  it("always includes revealed ids, even past the limit", () => {
    const rows = ["a", "b", "c"].map((id) => row(id, true));
    const eager = selectTimelineEagerPhotoIds(rows, new Set(["c"]), 1);
    expect(eager.has("a")).toBe(true);
    expect(eager.has("b")).toBe(false);
    expect(eager.has("c")).toBe(true);
  });

  it("handles empty input and a zero limit", () => {
    expect(selectTimelineEagerPhotoIds([], new Set()).size).toBe(0);
    expect(selectTimelineEagerPhotoIds([row("a", true)], new Set(), 0).size).toBe(0);
  });

  it("is deterministic and does not mutate the revealed set", () => {
    const revealed = new Set(["z"]);
    const rows = Array.from({ length: 30 }, (_, i) => row(`p${i}`, true));
    const first = [...selectTimelineEagerPhotoIds(rows, revealed)];
    expect([...selectTimelineEagerPhotoIds(rows, revealed)]).toEqual(first);
    expect([...revealed]).toEqual(["z"]);
    expect(first).toHaveLength(TIMELINE_EAGER_PHOTO_LIMIT + 1);
  });
});

describe("buildTimelineDeferredPhotoAriaLabel", () => {
  it("names the entry time", () => {
    expect(buildTimelineDeferredPhotoAriaLabel("Nov 3, 09:15")).toBe(
      "Show photo from Nov 3, 09:15",
    );
  });

  it("falls back to the visible text when there is no time label", () => {
    for (const label of [null, undefined, "", "   "]) {
      expect(buildTimelineDeferredPhotoAriaLabel(label)).toBe(TIMELINE_DEFERRED_PHOTO_COPY.button);
    }
  });
});
