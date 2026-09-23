import { expect, it } from "vitest";
import {
  buildRenderedDiaryTimelineAnchorIds,
  resolveHistoryTimelineAnchorId,
} from "@/lib/timelineEntryAnchorRules";

it("reserves visible diary identities and linked event aliases without reserving absent rows", () => {
  const reserved = buildRenderedDiaryTimelineAnchorIds([
    { id: "diary-1", details: { linked_grow_event_id: "event-1" } },
    { id: "diary-2", details: { grow_event_id: "legacy-2" } },
  ]);
  expect([...reserved]).toEqual([
    "timeline-entry-diary-1",
    "timeline-entry-event-1",
    "timeline-entry-diary-2",
    "timeline-entry-legacy-2",
  ]);
  expect(resolveHistoryTimelineAnchorId("timeline-entry-event-1", reserved)).toBeNull();
  expect(resolveHistoryTimelineAnchorId("timeline-entry-other-page", reserved)).toBe(
    "timeline-entry-other-page",
  );
});

it.each([null, undefined, []])(
  "has no reservations for missing/empty rendered diary rows: %s",
  (rows) => {
    expect([...buildRenderedDiaryTimelineAnchorIds(rows)]).toEqual([]);
  },
);

it("does not reserve an alias whose primary diary identity cannot render safely", () => {
  expect([
    ...buildRenderedDiaryTimelineAnchorIds([
      null,
      undefined,
      { id: "bad/id", details: { linked_grow_event_id: "event-1" } },
      { id: "valid", details: { linked_grow_event_id: "bad/id" } },
    ]),
  ]).toEqual(["timeline-entry-valid"]);
});

it("is deterministic and leaves input rows unchanged", () => {
  const rows = Object.freeze([
    Object.freeze({ id: "diary-1", details: Object.freeze({ linked_grow_event_id: "event-1" }) }),
  ]);
  expect([...buildRenderedDiaryTimelineAnchorIds(rows)]).toEqual([
    ...buildRenderedDiaryTimelineAnchorIds(rows),
  ]);
  expect(rows[0].details.linked_grow_event_id).toBe("event-1");
});

it("retains standalone history anchors and handles absent candidates", () => {
  expect(resolveHistoryTimelineAnchorId("timeline-entry-event-1")).toBe("timeline-entry-event-1");
  expect(resolveHistoryTimelineAnchorId(null)).toBeNull();
  expect(resolveHistoryTimelineAnchorId(undefined, new Set())).toBeNull();
  expect(resolveHistoryTimelineAnchorId("")).toBeNull();
});

it("reserves only the primary diary anchor when no linked grow event is present", () => {
  expect([
    ...buildRenderedDiaryTimelineAnchorIds([{ id: "diary-only", details: { note: "no link" } }]),
  ]).toEqual(["timeline-entry-diary-only"]);
});

it("does not treat an empty reservation set as blocking standalone history anchors", () => {
  expect(resolveHistoryTimelineAnchorId("timeline-entry-event-1", new Set())).toBe(
    "timeline-entry-event-1",
  );
});
