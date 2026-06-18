/**
 * customerModeGuideViewModel — public-safe timeline filter tests.
 *
 * Verifies that the view-model only renders events that explicitly
 * opt in via `isPublic: true`, use the public-safe shape, and carry
 * NO private/diary/sensor field names.
 */
import { describe, it, expect } from "vitest";
import {
  buildCustomerModeGuideViewModel,
  CUSTOMER_GUIDE_EMPTY_TIMELINE_COPY,
  CUSTOMER_GUIDE_PUBLISHED_ONLY_COPY,
  filterPublicSafeTimelineEvents,
} from "@/lib/customerModeGuideViewModel";

describe("filterPublicSafeTimelineEvents", () => {
  it("keeps explicitly public events with the safe shape", () => {
    const events = filterPublicSafeTimelineEvents([
      {
        id: "e1",
        title: "Flowering begins",
        dateLabel: "Week 4",
        category: "milestone",
        summary: "Buds forming",
        isPublic: true,
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("e1");
    expect(events[0].summary).toBe("Buds forming");
  });

  it("drops events without explicit isPublic: true", () => {
    const events = filterPublicSafeTimelineEvents([
      { id: "e1", title: "x", dateLabel: "Week 1", category: "note" },
      { id: "e2", title: "y", dateLabel: "Week 2", category: "note", isPublic: false },
    ]);
    expect(events).toEqual([]);
  });

  it("drops events carrying private/diary/sensor field names", () => {
    const cases = [
      { grow_id: "g1" },
      { growId: "g1" },
      { plant_id: "p1" },
      { plantId: "p1" },
      { tent_id: "t1" },
      { tentId: "t1" },
      { user_id: "u1" },
      { raw_payload: { foo: 1 } },
      { rawPayload: { foo: 1 } },
      { sensor_readings: [] },
      { diary_entries: [] },
      { operator_note: "secret" },
      { private_note: "secret" },
    ];
    for (const extra of cases) {
      const events = filterPublicSafeTimelineEvents([
        {
          id: "e1",
          title: "x",
          dateLabel: "Week 1",
          category: "note",
          isPublic: true,
          ...extra,
        },
      ]);
      expect(events, `should drop event with ${Object.keys(extra)[0]}`).toEqual([]);
    }
  });

  it("drops events with an unknown category", () => {
    const events = filterPublicSafeTimelineEvents([
      {
        id: "e1",
        title: "x",
        dateLabel: "Week 1",
        category: "operator_only",
        isPublic: true,
      },
    ]);
    expect(events).toEqual([]);
  });

  it("drops events missing required string fields", () => {
    const events = filterPublicSafeTimelineEvents([
      { id: "", title: "x", dateLabel: "Week 1", category: "note", isPublic: true },
      { id: "e1", title: "", dateLabel: "Week 1", category: "note", isPublic: true },
      { id: "e1", title: "x", dateLabel: "", category: "note", isPublic: true },
    ]);
    expect(events).toEqual([]);
  });

  it("returns [] for null/undefined/empty input", () => {
    expect(filterPublicSafeTimelineEvents(null)).toEqual([]);
    expect(filterPublicSafeTimelineEvents(undefined)).toEqual([]);
    expect(filterPublicSafeTimelineEvents([])).toEqual([]);
  });
});

describe("buildCustomerModeGuideViewModel — public events", () => {
  it("exposes the published-only copy", () => {
    const vm = buildCustomerModeGuideViewModel({ shareId: "abc" });
    expect(vm.timeline.publishedOnlyCopy).toBe(CUSTOMER_GUIDE_PUBLISHED_ONLY_COPY);
    expect(vm.timeline.emptyCopy).toBe(CUSTOMER_GUIDE_EMPTY_TIMELINE_COPY);
  });

  it("forwards filtered public events into the view-model", () => {
    const vm = buildCustomerModeGuideViewModel({
      shareId: "abc",
      publicEvents: [
        {
          id: "e1",
          title: "Harvest day",
          dateLabel: "Week 9",
          category: "harvest",
          isPublic: true,
        },
        {
          id: "e2",
          title: "Internal note",
          dateLabel: "Week 9",
          category: "note",
          isPublic: true,
          operator_note: "private",
        },
      ],
    });
    expect(vm.timeline.events.map((e) => e.id)).toEqual(["e1"]);
  });

  it("back-compat: still accepts a bare shareId string", () => {
    const vm = buildCustomerModeGuideViewModel("abc");
    expect(vm.brandLabel).toBe("Verdant Customer Guide");
    expect(vm.timeline.events).toEqual([]);
  });
});
