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
});
