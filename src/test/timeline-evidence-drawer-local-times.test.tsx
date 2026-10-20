/**
 * QA 2026-10-20 bug 5: the Timeline evidence drawer printed raw ISO
 * timestamps ("2026-10-15T15:54:26.221Z") for the entry time and the sensor
 * capture time. Both now render as the viewer's local date and time; the
 * stored ISO value on the view model is unchanged.
 *
 * TZ is pinned the same way as quick-log-grouped-review-panel.test.tsx. The
 * first assertion proves the pin took effect.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TimelineEvidenceDetailDrawer from "@/components/TimelineEvidenceDetailDrawer";
import { buildTimelineEvidenceDetailViewModel } from "@/lib/timelineEvidenceDetailViewModel";

const ENTRY_AT = "2026-10-15T15:54:26.221Z";
const CAPTURED_AT = "2026-10-15T15:50:00.000Z";
const ORIGINAL_TZ = process.env.TZ;

beforeEach(() => {
  process.env.TZ = "UTC";
});

afterEach(() => {
  cleanup();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

function renderDrawer() {
  const vm = buildTimelineEvidenceDetailViewModel({
    id: "e1",
    note: "Checked the canopy.",
    photo_url: null,
    stage: "flower",
    entry_at: ENTRY_AT,
    plant_id: "p",
    tent_id: "t",
    details: {
      event_type: "measurement",
      sensor_snapshot: { source: "manual", ts: CAPTURED_AT, temp: 24 },
    },
  });
  render(<TimelineEvidenceDetailDrawer open viewModel={vm} onClose={() => {}} />);
  return vm;
}

describe("Timeline evidence drawer local times (QA 2026-10-20 bug 5)", () => {
  it("proves TZ=UTC, then shows the entry time as a local date and time", () => {
    expect(new Date(2026, 9, 15, 15, 54, 0, 0).toISOString()).toBe("2026-10-15T15:54:00.000Z");
    const vm = renderDrawer();
    expect(vm?.occurredAt).toBe(ENTRY_AT);
    const drawer = screen.getByTestId("timeline-evidence-drawer");
    expect(drawer.textContent).toContain("Oct 15, 2026, 3:54 PM");
  });

  it("shows the sensor capture time as a local date and time", () => {
    renderDrawer();
    const drawer = screen.getByTestId("timeline-evidence-drawer");
    expect(drawer.textContent).toContain("Captured Oct 15, 2026, 3:50 PM");
  });

  it("prints no raw ISO timestamp anywhere in the drawer", () => {
    renderDrawer();
    const text = screen.getByTestId("timeline-evidence-drawer").textContent ?? "";
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});
