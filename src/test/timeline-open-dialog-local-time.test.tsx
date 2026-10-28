/**
 * QA 2026-10-22 (production ebaf1b6a, 2/2): the Timeline entry "Open" dialog
 * showed "2026-10-21T15:51:54.957+00:00". The Open control renders
 * TimelineEvidenceDetailPreview, which wraps the evidence drawer; its times
 * now go through the shared formatSnapshotCapturedAt helper (#2270, #2313,
 * #2315). Uses the stored Postgres shape (+00:00), not only "Z".
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import TimelineEvidenceDetailPreview from "@/components/TimelineEvidenceDetailPreview";
import { formatSnapshotCapturedAt } from "@/lib/alertReasonDisplayRules";

const ENTRY_AT = "2026-10-21T15:51:54.957+00:00";
const CAPTURED_AT = "2026-10-21T15:50:00.000+00:00";
const REMIND_AT = "2026-10-22T13:00:00.000+00:00";
const RAW_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ORIGINAL_TZ = process.env.TZ;

beforeEach(() => {
  process.env.TZ = "America/Chicago";
});

afterEach(() => {
  cleanup();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

function openDialog() {
  render(
    <TimelineEvidenceDetailPreview
      open
      onClose={() => {}}
      entry={{
        id: "e1",
        note: "Checked the canopy.",
        photo_url: null,
        stage: "flower",
        entry_at: ENTRY_AT,
        plant_id: "p",
        tent_id: "t",
        details: {
          event_type: "measurement",
          remind_at: REMIND_AT,
          sensor_snapshot: { source: "manual", ts: CAPTURED_AT, temp: 24 },
        },
      }}
    />,
  );
  return screen.getByTestId("timeline-evidence-drawer").textContent ?? "";
}

describe("Timeline Open dialog local times", () => {
  it("shows the entry time in the viewer's zone (America/Chicago)", () => {
    // Proves the zone took effect: 10:51 AM CDT is the stored 15:51 UTC instant.
    expect(new Date(2026, 9, 21, 10, 51).toISOString()).toBe("2026-10-21T15:51:00.000Z");
    expect(openDialog()).toContain("Oct 21, 2026, 10:51 AM");
  });

  it("uses the shared helper's output for every time it shows", () => {
    const text = openDialog();
    for (const iso of [ENTRY_AT, CAPTURED_AT, REMIND_AT]) {
      expect(text).toContain(formatSnapshotCapturedAt(iso));
    }
  });

  it("prints no raw ISO timestamp anywhere in the dialog", () => {
    expect(openDialog()).not.toMatch(RAW_ISO);
  });
});
