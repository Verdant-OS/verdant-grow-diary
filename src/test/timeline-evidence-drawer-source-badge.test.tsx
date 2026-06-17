/**
 * timeline-evidence-drawer-source-badge — verify the evidence detail
 * drawer renders the canonical source badge and never falls back to
 * "live" for unknown sources.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TimelineEvidenceDetailDrawer from "@/components/TimelineEvidenceDetailDrawer";
import { buildTimelineEvidenceDetailViewModel } from "@/lib/timelineEvidenceDetailViewModel";

function vmFromDetails(details: Record<string, unknown>) {
  return buildTimelineEvidenceDetailViewModel({
    id: "e1",
    note: "n",
    photo_url: null,
    stage: "veg",
    entry_at: "2025-06-01T12:00:00Z",
    plant_id: "p",
    tent_id: "t",
    details,
  });
}

describe("TimelineEvidenceDetailDrawer source badge", () => {
  for (const [src, expectedKind] of [
    ["manual", "manual"],
    ["live", "live"],
    ["csv", "csv"],
    ["demo", "demo"],
    ["invalid", "invalid"],
  ] as const) {
    it(`renders ${expectedKind} badge for source=${src}`, () => {
      const vm = vmFromDetails({
        event_type: "measurement",
        sensor_snapshot: { source: src, ts: "2025-06-01T12:00:00Z", temp: 22 },
      });
      render(<TimelineEvidenceDetailDrawer open viewModel={vm} onClose={() => {}} />);
      expect(
        screen.getByTestId(`timeline-sensor-source-badge-${expectedKind}`),
      ).toBeInTheDocument();
    });
  }

  it("renders invalid (never live) when source is unknown", () => {
    const vm = vmFromDetails({
      event_type: "measurement",
      sensor_snapshot: { temp: 22, ts: "2025-06-01T12:00:00Z" },
    });
    render(<TimelineEvidenceDetailDrawer open viewModel={vm} onClose={() => {}} />);
    expect(screen.getByTestId("timeline-sensor-source-badge-invalid")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-sensor-source-badge-live")).toBeNull();
  });

  it("exposes the legend tooltip near the sensor section", () => {
    const vm = vmFromDetails({
      event_type: "measurement",
      sensor_snapshot: { source: "manual" },
    });
    render(<TimelineEvidenceDetailDrawer open viewModel={vm} onClose={() => {}} />);
    expect(screen.getByTestId("sensor-source-legend-drawer")).toBeInTheDocument();
  });

  it("close button still works (drawer behavior intact)", () => {
    const vm = vmFromDetails({
      event_type: "measurement",
      sensor_snapshot: { source: "live" },
    });
    let closed = false;
    render(
      <TimelineEvidenceDetailDrawer
        open
        viewModel={vm}
        onClose={() => {
          closed = true;
        }}
      />,
    );
    screen.getByTestId("timeline-evidence-drawer-close").click();
    expect(closed).toBe(true);
  });
});
