import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TimelineMemorySection from "@/components/TimelineMemorySection";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";

const timelineMemoryMock = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock("@/hooks/useTimelineMemory", () => ({
  useTimelineMemory: () => timelineMemoryMock.current,
}));

const companionEvidence: TimelineMemoryItem = {
  kind: "manual_sensor_snapshot",
  key: "diary-companion-1",
  occurredAt: "2026-07-19T12:00:00.000Z",
  card: {
    id: "diary-companion-1",
    title: "Manual sensor snapshot",
    capturedAt: "2026-07-19T12:00:00.000Z",
    sourceLabel: "Manual",
    source: "manual",
    tentId: "tent-1",
    plantId: "plant-1",
    isTentLevel: false,
    notes: null,
    readings: [{ field: "air_temp_c", value: 24, unit: "°C", derived: false }],
    severity: "ok",
    warnings: [],
    errors: [],
  },
};

describe("TimelineMemorySection Quick Log companion dedupe", () => {
  it("uses displayItems for visible memory while complete items remain available to readiness", () => {
    timelineMemoryMock.current = {
      items: [companionEvidence],
      displayItems: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };

    render(<TimelineMemorySection scope="plant" plantId="plant-1" tentId="tent-1" />);

    expect(screen.getByTestId("timeline-memory-linked-evidence-only")).toBeInTheDocument();
    expect(screen.queryByText("No plant history yet.")).not.toBeInTheDocument();
    expect(screen.queryByTestId("manual-snapshot-timeline-card")).not.toBeInTheDocument();
    expect((timelineMemoryMock.current as { items: TimelineMemoryItem[] }).items).toContain(
      companionEvidence,
    );
  });

  it("renders the companion card when grouped memory does not own it", () => {
    timelineMemoryMock.current = {
      items: [companionEvidence],
      displayItems: [companionEvidence],
      companionItems: [companionEvidence],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };

    render(<TimelineMemorySection scope="plant" plantId="plant-1" tentId="tent-1" />);

    expect(screen.getByTestId("manual-snapshot-timeline-card")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-memory-linked-evidence-only")).not.toBeInTheDocument();
  });

  it("shows unavailable evidence instead of claiming there is no history", () => {
    timelineMemoryMock.current = {
      items: [],
      displayItems: [],
      companionItems: [],
      companionEvidenceUnavailable: true,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };

    render(<TimelineMemorySection scope="plant" plantId="plant-1" tentId="tent-1" />);

    expect(screen.getByTestId("timeline-memory-linked-evidence-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-memory-empty")).not.toBeInTheDocument();
    expect(screen.queryByText("No plant history yet.")).not.toBeInTheDocument();
  });
});
