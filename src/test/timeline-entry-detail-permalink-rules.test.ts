import { describe, expect, it } from "vitest";
import {
  TIMELINE_ENTRY_DETAIL_PARAM,
  normalizeTimelineEntryDetailRow,
  parseTimelineEntryDetailId,
  resolveTimelineEntryDetailView,
  timelineEntryDetailGrowId,
  timelineEntryDetailHref,
  timelineEntryDetailPhotoSrc,
  timelineEntryDetailSearch,
  timelineEntryDetailStatusCopy,
} from "@/lib/timelineEntryDetailPermalinkRules";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("timeline entry detail permalink rules", () => {
  it("keeps a diary id and a sensor receipt, and drops markup", () => {
    expect(parseTimelineEntryDetailId(`  ${UUID}  `)).toBe(UUID);
    expect(parseTimelineEntryDetailId("sensor-reading:tent-1:2026-10-15T16:05:00.000Z")).toBe(
      "sensor-reading:tent-1:2026-10-15T16:05:00.000Z",
    );
    expect(parseTimelineEntryDetailId("")).toBeNull();
    expect(parseTimelineEntryDetailId("entry id")).toBeNull();
    expect(parseTimelineEntryDetailId("id&other=1")).toBeNull();
    expect(parseTimelineEntryDetailId(null)).toBeNull();
  });

  it("writes the entry param without dropping the rest of the query", () => {
    const next = timelineEntryDetailSearch(new URLSearchParams("growId=g1&start=2026-10-01"), UUID);
    expect(next.get(TIMELINE_ENTRY_DETAIL_PARAM)).toBe(UUID);
    expect(next.get("growId")).toBe("g1");
    expect(next.get("start")).toBe("2026-10-01");
    const closed = timelineEntryDetailSearch(next, null);
    expect(closed.get(TIMELINE_ENTRY_DETAIL_PARAM)).toBeNull();
    expect(closed.get("growId")).toBe("g1");
  });

  it("builds a reloadable path and refuses a displayable photo that is not http(s)", () => {
    expect(timelineEntryDetailHref(UUID)).toBe(`/timeline?entry=${UUID}`);
    expect(timelineEntryDetailHref("not an id")).toBeNull();
    expect(timelineEntryDetailPhotoSrc(" https://example.test/leaf.jpg ")).toBe(
      "https://example.test/leaf.jpg",
    );
    expect(timelineEntryDetailPhotoSrc("diary-photos/private.jpg")).toBeNull();
    expect(timelineEntryDetailPhotoSrc("javascript:alert(1)")).toBeNull();
  });

  it("normalizes one owned row and never invents a time", () => {
    expect(
      normalizeTimelineEntryDetailRow(
        {
          id: UUID,
          note: "Watered",
          photo_url: null,
          stage: "veg",
          details: { event_type: "watering" },
          entry_at: "2026-10-15T16:05:00.000Z",
          plant_id: null,
          tent_id: null,
          grow_id: "grow-a",
        },
        UUID,
      )?.note,
    ).toBe("Watered");
    expect(normalizeTimelineEntryDetailRow({ id: UUID, note: "x" }, UUID)).toBeNull();
    expect(normalizeTimelineEntryDetailRow({ id: "other", entry_at: "t" }, UUID)).toBeNull();
    expect(timelineEntryDetailGrowId({ grow_id: " grow-b " }, "grow-a")).toBe("grow-b");
    expect(timelineEntryDetailGrowId({}, "grow-a")).toBe("grow-a");
  });

  it("prefers the visible row, then the fetched row, then an honest miss", () => {
    const visible = { id: UUID, note: "on the page" };
    const fetched = { id: UUID, note: "from the permalink" };
    expect(
      resolveTimelineEntryDetailView({
        requestedId: null,
        visibleEntries: [visible],
        fetchedEntry: fetched,
        fetchState: "ready",
        sensorListSettled: true,
      }).kind,
    ).toBe("closed");
    expect(
      resolveTimelineEntryDetailView({
        requestedId: UUID,
        visibleEntries: [visible],
        fetchedEntry: null,
        fetchState: "loading",
        sensorListSettled: false,
      }),
    ).toEqual({ kind: "ready", entry: visible });
    expect(
      resolveTimelineEntryDetailView({
        requestedId: UUID,
        visibleEntries: [],
        fetchedEntry: fetched,
        fetchState: "ready",
        sensorListSettled: true,
      }),
    ).toEqual({ kind: "ready", entry: fetched });
    expect(
      resolveTimelineEntryDetailView({
        requestedId: UUID,
        visibleEntries: [],
        fetchedEntry: null,
        fetchState: "missing",
        sensorListSettled: true,
      }).kind,
    ).toBe("not_found");
    expect(
      resolveTimelineEntryDetailView({
        requestedId: UUID,
        visibleEntries: [],
        fetchedEntry: null,
        fetchState: "error",
        sensorListSettled: true,
      }).kind,
    ).toBe("unavailable");
    expect(
      resolveTimelineEntryDetailView({
        requestedId: "sensor-reading:tent:2026-10-15T16:05:00.000Z",
        visibleEntries: [],
        fetchedEntry: null,
        fetchState: "idle",
        sensorListSettled: false,
      }).kind,
    ).toBe("loading");
    expect(
      resolveTimelineEntryDetailView({
        requestedId: "sensor-reading:tent:2026-10-15T16:05:00.000Z",
        visibleEntries: [],
        fetchedEntry: null,
        fetchState: "idle",
        sensorListSettled: true,
      }).kind,
    ).toBe("not_found");
    expect(timelineEntryDetailStatusCopy("not_found").title).toBe("Entry not found");
  });
});
