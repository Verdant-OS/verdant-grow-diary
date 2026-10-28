/**
 * Extends QA 2026-10-20 bug 5 coverage: reminder and maturity observedAt rows
 * in the evidence drawer must use formatSnapshotCapturedAt, not raw ISO.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TimelineEvidenceDetailDrawer from "@/components/TimelineEvidenceDetailDrawer";
import { buildTimelineEvidenceDetailViewModel } from "@/lib/timelineEvidenceDetailViewModel";

const ENTRY_AT = "2026-10-15T15:54:26.221Z";
const REMIND_AT = "2026-10-16T13:00:00.000Z";
const MATURITY_OBSERVED_AT = "2026-10-15T16:00:00.000Z";
const ORIGINAL_TZ = process.env.TZ;

beforeEach(() => {
  process.env.TZ = "UTC";
});

afterEach(() => {
  cleanup();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("Timeline evidence drawer — reminder and maturity local times", () => {
  it("shows the reminder row as a local date and time", () => {
    const vm = buildTimelineEvidenceDetailViewModel({
      id: "e1",
      note: "Follow up tomorrow.",
      photo_url: null,
      stage: "flower",
      entry_at: ENTRY_AT,
      plant_id: "p",
      tent_id: "t",
      details: {
        event_type: "note",
        remind_at: REMIND_AT,
      },
    });
    render(<TimelineEvidenceDetailDrawer open viewModel={vm} onClose={() => {}} />);
    const drawer = screen.getByTestId("timeline-evidence-drawer");
    expect(vm?.remindAt).toBe(REMIND_AT);
    expect(drawer.textContent).toContain("Reminder");
    expect(drawer.textContent).toContain("Oct 16, 2026, 1:00 PM");
    expect(drawer.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it("shows maturity evidence observedAt as a local date and time", () => {
    const vm = buildTimelineEvidenceDetailViewModel({
      id: "e1",
      note: "Maturity check.",
      photo_url: null,
      stage: "flower",
      entry_at: ENTRY_AT,
      plant_id: "p",
      tent_id: "t",
      details: {
        event_type: "note",
        maturity_evidence: {
          evidence_type: "quick_log_maturity_evidence",
          observed_at: MATURITY_OBSERVED_AT,
          cloudy_pct: 70,
        },
      },
    });
    render(<TimelineEvidenceDetailDrawer open viewModel={vm} onClose={() => {}} />);
    expect(vm?.maturityEvidence?.observedAt).toBe(MATURITY_OBSERVED_AT);
    const drawer = screen.getByTestId("timeline-evidence-drawer");
    expect(drawer.textContent).toContain("Observed Oct 15, 2026, 4:00 PM");
    expect(drawer.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});
