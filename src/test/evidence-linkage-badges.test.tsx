/**
 * EvidenceLinkageBadges — presenter tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import EvidenceLinkageBadges from "@/components/EvidenceLinkageBadges";
import {
  ACTION_QUEUE_AI_DOCTOR_DERIVED_EVIDENCE_NOT_LINKED_COPY,
  ACTION_QUEUE_ALERT_DERIVED_EVIDENCE_NOT_LINKED_COPY,
  ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY,
  normalizeOriginatingTimelineEvents,
  type OriginatingTimelineEventRef,
} from "@/lib/originatingTimelineEventRules";

const FORBIDDEN = [
  "executed",
  "automatically applied",
  "device command",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
  "guaranteed",
  "definitely",
  "certain diagnosis",
];

function expectNoForbiddenCopy(container: HTMLElement) {
  const text = (container.textContent ?? "").toLowerCase();
  for (const p of FORBIDDEN) {
    expect(text.includes(p), `forbidden phrase "${p}" rendered`).toBe(false);
  }
}

describe("EvidenceLinkageBadges presenter", () => {
  it("renders fallback copy when no events linked", () => {
    const { container } = render(<EvidenceLinkageBadges events={[]} />);
    expect(screen.getByTestId("evidence-linkage-badges-empty")).toHaveTextContent(
      /Timeline evidence not linked yet\./i,
    );
    expectNoForbiddenCopy(container);
  });

  it("renders a source badge per linked event with id + source labels", () => {
    const events: OriginatingTimelineEventRef[] = [
      { id: "diary-001", type: "diary_note", occurred_at: "2026-06-27T11:30:00.000Z", source: "manual" },
      { id: "reading-stale-001", type: "sensor_reading", occurred_at: "2026-06-27T11:55:00.000Z", source: "stale" },
    ];
    const { container } = render(<EvidenceLinkageBadges events={events} />);
    const items = screen.getAllByTestId("evidence-linkage-badges-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute("data-source", "manual");
    expect(items[0]).toHaveAttribute("data-trusted", "true");
    expect(items[1]).toHaveAttribute("data-source", "stale");
    expect(items[1]).toHaveAttribute("data-trusted", "false");
    expect(within(items[0]).getByText("diary-001")).toBeInTheDocument();
    expect(within(items[0]).getByTestId("evidence-linkage-badges-source")).toHaveTextContent(/Manual/i);
    expect(within(items[1]).getByTestId("evidence-linkage-badges-source")).toHaveTextContent(/Stale/i);
    expectNoForbiddenCopy(container);
  });

  it("untrusted sources show a caution note and approval-required copy", () => {
    const events: OriginatingTimelineEventRef[] = [
      { id: "x", source: "invalid" },
      { id: "y", source: "unknown" },
      { id: "z", source: "imported" },
    ];
    const { container } = render(<EvidenceLinkageBadges events={events} />);
    const cautions = screen.getAllByTestId("evidence-linkage-badges-caution");
    expect(cautions.length).toBe(3);
    for (const c of cautions) {
      expect(c.textContent ?? "").toMatch(/approval required/i);
    }
    expectNoForbiddenCopy(container);
  });

  it("supports action-queue-suggestion surface tag", () => {
    render(
      <EvidenceLinkageBadges
        events={[{ id: "a", source: "manual" }]}
        surface="action-queue-suggestion"
      />,
    );
    expect(screen.getByTestId("evidence-linkage-badges")).toHaveAttribute(
      "data-surface",
      "action-queue-suggestion",
    );
  });

  it("renders 'Linked timeline event' label and pluralizes correctly", () => {
    const { rerender } = render(
      <EvidenceLinkageBadges events={[{ id: "a", source: "manual" }]} />,
    );
    expect(screen.getByText(/Linked timeline event$/i)).toBeInTheDocument();
    rerender(
      <EvidenceLinkageBadges
        events={[
          { id: "a", source: "manual" },
          { id: "b", source: "manual" },
        ]}
      />,
    );
    expect(screen.getByText(/Linked timeline events/i)).toBeInTheDocument();
  });

  it("renders the provenance-aware fallback copy for each mount surface", () => {
    const cases: Array<{ copy: string; surface: "alert-review" | "action-queue-suggestion" }> = [
      { copy: ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY, surface: "alert-review" },
      { copy: ACTION_QUEUE_ALERT_DERIVED_EVIDENCE_NOT_LINKED_COPY, surface: "action-queue-suggestion" },
      { copy: ACTION_QUEUE_AI_DOCTOR_DERIVED_EVIDENCE_NOT_LINKED_COPY, surface: "action-queue-suggestion" },
    ];
    for (const { copy, surface } of cases) {
      const { container, unmount } = render(
        <EvidenceLinkageBadges events={[]} surface={surface} fallbackCopy={copy} />,
      );
      const empty = screen.getByTestId("evidence-linkage-badges-empty");
      expect(empty).toHaveTextContent(copy);
      expect(empty).toHaveAttribute("data-surface", surface);
      // No certainty/automation phrasing leaks into fallback copy.
      expect(copy.toLowerCase()).not.toMatch(/healthy|guaranteed|definitely|automatically/);
      expectNoForbiddenCopy(container);
      unmount();
    }
  });

  it("renders sorted+deduped refs across all supported sources", () => {
    const normalized = normalizeOriginatingTimelineEvents([
      { id: "dup", source: "manual", occurred_at: "2026-06-27T10:00:00Z" },
      { id: "dup", source: "live", occurred_at: "2026-06-27T09:00:00Z" },
      { id: "live-1", source: "live", occurred_at: "2026-06-27T08:00:00Z" },
      { id: "csv-1", source: "csv", occurred_at: "2026-06-27T08:30:00Z" },
      { id: "demo-1", source: "demo", occurred_at: "2026-06-27T11:00:00Z" },
      { id: "stale-1", source: "stale", occurred_at: "2026-06-27T11:05:00Z" },
      { id: "invalid-1", source: "invalid", occurred_at: "2026-06-27T11:10:00Z" },
      { id: "imported-1", source: "imported", occurred_at: "2026-06-27T11:15:00Z" },
      // unknown raw source normalizes to "unknown"
      { id: "wat-1", source: "no-such-source", occurred_at: "2026-06-27T11:20:00Z" },
    ] as OriginatingTimelineEventRef[]);
    const { container } = render(<EvidenceLinkageBadges events={normalized} />);
    const items = screen.getAllByTestId("evidence-linkage-badges-item");
    // 8 unique ids after dedupe; first-seen "dup" kept (manual).
    expect(items).toHaveLength(8);
    expect(items.map((el) => el.getAttribute("data-event-id"))).toEqual([
      "live-1",
      "csv-1",
      "dup",
      "demo-1",
      "stale-1",
      "invalid-1",
      "imported-1",
      "wat-1",
    ]);
    // Unknown source is rendered as untrusted, never live.
    const unknown = items[items.length - 1];
    expect(unknown).toHaveAttribute("data-source", "unknown");
    expect(unknown).toHaveAttribute("data-trusted", "false");
    expect(within(unknown).getByTestId("evidence-linkage-badges-source")).toHaveTextContent(
      /Unknown source/i,
    );
    // demo/stale/invalid/imported/unknown all show caution copy.
    expect(screen.getAllByTestId("evidence-linkage-badges-caution").length).toBe(5);
    expectNoForbiddenCopy(container);
  });

  it("renders deterministically across repeated renders", () => {
    const events = normalizeOriginatingTimelineEvents([
      { id: "b", source: "manual", occurred_at: "2026-06-27T10:00:00Z" },
      { id: "a", source: "live", occurred_at: "2026-06-27T10:00:00Z" },
    ]);
    const first = render(<EvidenceLinkageBadges events={events} />);
    const order1 = screen
      .getAllByTestId("evidence-linkage-badges-item")
      .map((el) => el.getAttribute("data-event-id"));
    first.unmount();
    render(<EvidenceLinkageBadges events={events} />);
    const order2 = screen
      .getAllByTestId("evidence-linkage-badges-item")
      .map((el) => el.getAttribute("data-event-id"));
    expect(order2).toEqual(order1);
  });
});
