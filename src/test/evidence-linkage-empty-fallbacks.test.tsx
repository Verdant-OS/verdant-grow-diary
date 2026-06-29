/**
 * EvidenceLinkageBadges — empty/null/malformed fallback regression coverage.
 *
 * Pairs the adapter's safe-by-default behavior with the presenter's fallback
 * rendering so AlertDetail and ActionDetail can never silently lose their
 * provenance-aware fallback copy when `originating_timeline_events` is
 * null, missing, an empty array, or malformed.
 *
 * No I/O. No Supabase. No automation. No device-control copy.
 */
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import EvidenceLinkageBadges from "@/components/EvidenceLinkageBadges";
import {
  adaptOriginatingTimelineEventsColumn,
  adaptOriginatingTimelineEventsFromRow,
} from "@/lib/originatingTimelineEventAdapter";
import {
  ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY,
  ACTION_QUEUE_ALERT_DERIVED_EVIDENCE_NOT_LINKED_COPY,
  ACTION_QUEUE_AI_DOCTOR_DERIVED_EVIDENCE_NOT_LINKED_COPY,
} from "@/lib/originatingTimelineEventRules";

const EMPTY_INPUTS: Array<[string, unknown]> = [
  ["null", null],
  ["undefined", undefined],
  ["empty array", []],
  ["non-array string", "evt-1"],
  ["non-array number", 7],
  ["non-array object", { id: "evt-1", source: "manual" }],
  ["array of primitives", [1, "x", null, true]],
  ["array of malformed entries", [{ noId: true }, { id: "" }, { id: 42 }]],
];

describe("originating timeline event adapter — empty/null/malformed safety", () => {
  for (const [label, input] of EMPTY_INPUTS) {
    it(`returns [] for ${label}`, () => {
      expect(adaptOriginatingTimelineEventsColumn(input)).toEqual([]);
    });
  }

  it("returns [] when the row field is missing entirely", () => {
    expect(adaptOriginatingTimelineEventsFromRow({})).toEqual([]);
  });

  it("returns [] when the row field is null", () => {
    expect(
      adaptOriginatingTimelineEventsFromRow({ originating_timeline_events: null }),
    ).toEqual([]);
  });

  it("returns [] when the row field is an empty array", () => {
    expect(
      adaptOriginatingTimelineEventsFromRow({ originating_timeline_events: [] }),
    ).toEqual([]);
  });

  it("returns [] when the row field is malformed (not an array)", () => {
    expect(
      adaptOriginatingTimelineEventsFromRow({
        originating_timeline_events: "definitely-not-an-array",
      }),
    ).toEqual([]);
  });
});

describe("EvidenceLinkageBadges — provenance-aware fallback rendering", () => {
  const cases: Array<{
    name: string;
    surface: "alert-review" | "action-queue-suggestion";
    fallback: string;
    events: unknown;
  }> = [
    {
      name: "AlertDetail fallback (empty array)",
      surface: "alert-review",
      fallback: ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY,
      events: adaptOriginatingTimelineEventsColumn([]),
    },
    {
      name: "AlertDetail fallback (null column)",
      surface: "alert-review",
      fallback: ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY,
      events: adaptOriginatingTimelineEventsColumn(null),
    },
    {
      name: "ActionDetail alert-derived fallback (empty array)",
      surface: "action-queue-suggestion",
      fallback: ACTION_QUEUE_ALERT_DERIVED_EVIDENCE_NOT_LINKED_COPY,
      events: adaptOriginatingTimelineEventsColumn([]),
    },
    {
      name: "ActionDetail alert-derived fallback (null column)",
      surface: "action-queue-suggestion",
      fallback: ACTION_QUEUE_ALERT_DERIVED_EVIDENCE_NOT_LINKED_COPY,
      events: adaptOriginatingTimelineEventsColumn(null),
    },
    {
      name: "ActionDetail AI-Doctor-derived fallback (empty array)",
      surface: "action-queue-suggestion",
      fallback: ACTION_QUEUE_AI_DOCTOR_DERIVED_EVIDENCE_NOT_LINKED_COPY,
      events: adaptOriginatingTimelineEventsColumn([]),
    },
    {
      name: "ActionDetail AI-Doctor-derived fallback (malformed column)",
      surface: "action-queue-suggestion",
      fallback: ACTION_QUEUE_AI_DOCTOR_DERIVED_EVIDENCE_NOT_LINKED_COPY,
      events: adaptOriginatingTimelineEventsColumn("not-an-array"),
    },
  ];

  for (const c of cases) {
    it(`${c.name} → renders fallback copy and no badge items`, () => {
      cleanup();
      render(
        <EvidenceLinkageBadges
          events={c.events as never}
          surface={c.surface}
          fallbackCopy={c.fallback}
          testId="evidence-linkage-badges"
        />,
      );

      // Fallback element exists with the correct copy.
      const empty = screen.getByTestId("evidence-linkage-badges-empty");
      expect(empty).toBeTruthy();
      expect(empty.textContent ?? "").toContain(c.fallback);
      expect(empty.getAttribute("data-surface")).toBe(c.surface);

      // No badge items / sources / caution chips render in the fallback state.
      expect(screen.queryAllByTestId("evidence-linkage-badges-item")).toHaveLength(0);
      expect(screen.queryAllByTestId("evidence-linkage-badges-source")).toHaveLength(0);
      expect(screen.queryAllByTestId("evidence-linkage-badges-caution")).toHaveLength(0);
    });
  }

  it("never leaks raw payload / secret-like text in the fallback render", () => {
    cleanup();
    render(
      <EvidenceLinkageBadges
        events={[] as never}
        surface="alert-review"
        fallbackCopy={ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY}
      />,
    );
    const text = (screen.getByTestId("evidence-linkage-badges-empty").textContent ?? "").toLowerCase();
    for (const banned of [
      "raw_payload",
      "rawpayload",
      "service_role",
      "bridge_token",
      "bridge_secret",
      "api_key",
      "api_token",
      "access_token",
      "refresh_token",
      "jwt",
      "secret",
      "prompt",
      "completion",
    ]) {
      expect(text.includes(banned), `unexpected "${banned}" in fallback`).toBe(false);
    }
  });
});
