/**
 * EvidenceLinkageBadges — positive-path regression coverage.
 *
 * Locks in the safe positive behavior after Evidence Linkage Persistence v1:
 *  - Valid persisted refs render as badges.
 *  - Order is deterministic across the adapter + presenter.
 *  - Mixed valid/malformed arrays render only the valid refs.
 *  - Secret-like fields never appear in rendered output.
 *  - Source labels are honest; only `live` renders as "Live".
 *
 * Test-only. No I/O. No Supabase. No automation. No device-control copy.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, within } from "@testing-library/react";

import EvidenceLinkageBadges from "@/components/EvidenceLinkageBadges";
import {
  adaptOriginatingTimelineEventsColumn,
  FORBIDDEN_REF_FIELDS,
} from "@/lib/originatingTimelineEventAdapter";
import {
  ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY,
  originatingTimelineEventLabel,
  type OriginatingTimelineEventSource,
} from "@/lib/originatingTimelineEventRules";

afterEach(() => cleanup());

// Expected adapter order: occurred_at ascending (null-last), then id ascending.
const UNSORTED_VALID_REFS = [
  { id: "evt-z", kind: "diary_entry", source: "manual" }, // null occurred_at -> sorts last
  { id: "evt-b", kind: "sensor_snapshot", source: "live", occurred_at: "2026-06-02T10:00:00Z" },
  { id: "evt-a", kind: "grow_event", source: "csv", occurred_at: "2026-06-01T10:00:00Z" },
  { id: "evt-c", kind: "grow_event", source: "manual", occurred_at: "2026-06-02T10:00:00Z" },
];
const EXPECTED_ORDER = ["evt-a", "evt-b", "evt-c", "evt-z"];

describe("EvidenceLinkageBadges — deterministic ordering", () => {
  it("adapter returns badge-ready refs in stable deterministic order", () => {
    const out = adaptOriginatingTimelineEventsColumn(UNSORTED_VALID_REFS);
    expect(out.map((e) => e.id)).toEqual(EXPECTED_ORDER);
  });

  it("repeated adapter calls with the same input produce the same order", () => {
    const a = adaptOriginatingTimelineEventsColumn(UNSORTED_VALID_REFS);
    const b = adaptOriginatingTimelineEventsColumn(UNSORTED_VALID_REFS);
    const c = adaptOriginatingTimelineEventsColumn([...UNSORTED_VALID_REFS]);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
    expect(a.map((e) => e.id)).toEqual(c.map((e) => e.id));
  });

  it("presenter renders badge items in the adapter's order", () => {
    const events = adaptOriginatingTimelineEventsColumn(UNSORTED_VALID_REFS);
    const { container } = render(<EvidenceLinkageBadges events={events} />);
    const items = container.querySelectorAll(
      '[data-testid="evidence-linkage-badges-item"]',
    );
    expect(items.length).toBe(EXPECTED_ORDER.length);
    const renderedIds = Array.from(items).map((el) =>
      el.getAttribute("data-event-id"),
    );
    expect(renderedIds).toEqual(EXPECTED_ORDER);
  });

  it("rendering twice with the same input produces the same DOM order", () => {
    const events = adaptOriginatingTimelineEventsColumn(UNSORTED_VALID_REFS);
    const first = render(<EvidenceLinkageBadges events={events} />);
    const firstIds = Array.from(
      first.container.querySelectorAll('[data-event-id]'),
    ).map((el) => el.getAttribute("data-event-id"));
    cleanup();
    const second = render(<EvidenceLinkageBadges events={events} />);
    const secondIds = Array.from(
      second.container.querySelectorAll('[data-event-id]'),
    ).map((el) => el.getAttribute("data-event-id"));
    expect(secondIds).toEqual(firstIds);
  });
});

describe("EvidenceLinkageBadges — mixed valid + malformed input", () => {
  const MIXED_INPUT = [
    null,
    undefined,
    "string-entry",
    42,
    [],
    { id: "" },
    { id: 123, source: "manual" },
    { noId: true, source: "manual" },
    { id: "valid-1", kind: "grow_event", source: "manual", occurred_at: "2026-06-01T10:00:00Z" },
    { id: "valid-2", kind: "sensor_snapshot", source: "made-up-source", occurred_at: "2026-06-02T10:00:00Z" },
    { id: "valid-1", kind: "diary_entry", source: "csv", occurred_at: "2026-06-03T10:00:00Z" }, // dup id
  ];

  it("adapter keeps only valid refs, dedupes, and marks unknown source", () => {
    const out = adaptOriginatingTimelineEventsColumn(MIXED_INPUT);
    expect(out.map((e) => e.id)).toEqual(["valid-1", "valid-2"]);
    const v1 = out.find((e) => e.id === "valid-1");
    const v2 = out.find((e) => e.id === "valid-2");
    expect(v1?.source).toBe("manual"); // first occurrence wins
    expect(v2?.source).toBe("unknown");
  });

  it("presenter renders only valid refs and no fallback copy", () => {
    const events = adaptOriginatingTimelineEventsColumn(MIXED_INPUT);
    const { container, queryByText } = render(
      <EvidenceLinkageBadges
        events={events}
        fallbackCopy={ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY}
      />,
    );
    const items = container.querySelectorAll(
      '[data-testid="evidence-linkage-badges-item"]',
    );
    expect(items.length).toBe(2);
    expect(
      container.querySelector('[data-testid="evidence-linkage-badges-empty"]'),
    ).toBeNull();
    expect(queryByText(ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY)).toBeNull();
  });

  it("unknown source ref renders the 'Unknown source' label and caution copy", () => {
    const events = adaptOriginatingTimelineEventsColumn(MIXED_INPUT);
    const { container } = render(<EvidenceLinkageBadges events={events} />);
    const unknownItem = container.querySelector(
      '[data-event-id="valid-2"]',
    ) as HTMLElement | null;
    expect(unknownItem).not.toBeNull();
    expect(unknownItem?.getAttribute("data-source")).toBe("unknown");
    expect(unknownItem?.getAttribute("data-trusted")).toBe("false");
    expect(within(unknownItem!).getByText(/Unknown source/i)).toBeTruthy();
    expect(
      within(unknownItem!).getByTestId("evidence-linkage-badges-caution"),
    ).toBeTruthy();
  });
});

describe("EvidenceLinkageBadges — secret-like field rejection", () => {
  it("adapter drops entries containing any forbidden field", () => {
    for (const field of FORBIDDEN_REF_FIELDS) {
      const out = adaptOriginatingTimelineEventsColumn([
        { id: "leak", kind: "grow_event", source: "manual", [field]: "BOOM-SECRET-VALUE" },
        { id: "clean", kind: "grow_event", source: "manual" },
      ]);
      expect(out.map((e) => e.id)).toEqual(["clean"]);
    }
  });

  it("presenter output does not contain any forbidden field name or its leaked value", () => {
    const SECRET_VALUE = "VERDANT_SECRET_SENTINEL_VALUE_98765";
    const leakyInput = FORBIDDEN_REF_FIELDS.map((field, i) => ({
      id: `leaky-${i}`,
      kind: "grow_event",
      source: "manual",
      [field]: SECRET_VALUE,
    }));
    const cleanInput = [
      { id: "clean", kind: "grow_event", source: "manual", occurred_at: "2026-06-01T10:00:00Z" },
    ];
    const events = adaptOriginatingTimelineEventsColumn([
      ...leakyInput,
      ...cleanInput,
    ]);
    expect(events.map((e) => e.id)).toEqual(["clean"]);

    const { container } = render(<EvidenceLinkageBadges events={events} />);
    const html = container.innerHTML;
    expect(html).not.toContain(SECRET_VALUE);
    for (const field of FORBIDDEN_REF_FIELDS) {
      expect(html.toLowerCase()).not.toContain(field.toLowerCase());
    }
  });
});

describe("EvidenceLinkageBadges — source label honesty", () => {
  const SOURCES: OriginatingTimelineEventSource[] = [
    "live",
    "manual",
    "csv",
    "demo",
    "stale",
    "invalid",
    "unknown",
  ];

  it("each known source renders its honest label", () => {
    const input = SOURCES.map((src, i) => ({
      id: `src-${src}`,
      kind: "grow_event",
      source: src,
      occurred_at: `2026-06-0${i + 1}T10:00:00Z`,
    }));
    const events = adaptOriginatingTimelineEventsColumn(input);
    expect(events.length).toBe(SOURCES.length);
    const { container } = render(<EvidenceLinkageBadges events={events} />);
    for (const src of SOURCES) {
      const item = container.querySelector(
        `[data-event-id="src-${src}"]`,
      ) as HTMLElement | null;
      expect(item, `missing item for ${src}`).not.toBeNull();
      expect(item?.getAttribute("data-source")).toBe(src);
      const label = originatingTimelineEventLabel(src);
      expect(within(item!).getByText(label)).toBeTruthy();
    }
  });

  it("only source === 'live' renders the 'Live' badge label", () => {
    const input = SOURCES.map((src, i) => ({
      id: `src-${src}`,
      kind: "grow_event",
      source: src,
      occurred_at: `2026-06-0${i + 1}T10:00:00Z`,
    }));
    const events = adaptOriginatingTimelineEventsColumn(input);
    const { container } = render(<EvidenceLinkageBadges events={events} />);

    // The badge label span uses data-testid="evidence-linkage-badges-source".
    const liveBadges = container.querySelectorAll(
      '[data-testid="evidence-linkage-badges-source"]',
    );
    const liveLabelHits = Array.from(liveBadges).filter(
      (el) => el.textContent?.trim() === "Live",
    );
    expect(liveLabelHits.length).toBe(1);

    const liveOwner = liveLabelHits[0]?.closest("[data-event-id]");
    expect(liveOwner?.getAttribute("data-source")).toBe("live");
    expect(liveOwner?.getAttribute("data-trusted")).toBe("true");
  });

  it("non-live sources never produce a 'Live' badge label", () => {
    const NON_LIVE: OriginatingTimelineEventSource[] = [
      "manual",
      "csv",
      "demo",
      "stale",
      "invalid",
      "unknown",
    ];
    for (const src of NON_LIVE) {
      const events = adaptOriginatingTimelineEventsColumn([
        { id: `only-${src}`, kind: "grow_event", source: src },
      ]);
      const { container, unmount } = render(
        <EvidenceLinkageBadges events={events} />,
      );
      const badge = container.querySelector(
        '[data-testid="evidence-linkage-badges-source"]',
      );
      expect(badge?.textContent?.trim()).not.toBe("Live");
      unmount();
    }
  });

  it("demo/stale/invalid/unknown render with data-trusted='false'", () => {
    const UNTRUSTED: OriginatingTimelineEventSource[] = [
      "demo",
      "stale",
      "invalid",
      "unknown",
    ];
    const input = UNTRUSTED.map((src) => ({
      id: `u-${src}`,
      kind: "grow_event",
      source: src,
    }));
    const events = adaptOriginatingTimelineEventsColumn(input);
    const { container } = render(<EvidenceLinkageBadges events={events} />);
    for (const src of UNTRUSTED) {
      const item = container.querySelector(`[data-event-id="u-${src}"]`);
      expect(item?.getAttribute("data-trusted")).toBe("false");
    }
  });
});
