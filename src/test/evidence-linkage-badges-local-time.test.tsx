/**
 * Follow-up to #2270: the Action detail "Linked timeline event" row showed the
 * raw ISO occurred_at ("2026-10-15T15:54:26.221+00:00"). It must render in the
 * viewer's local zone via the shared alert timestamp helper.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import EvidenceLinkageBadges from "@/components/EvidenceLinkageBadges";
import {
  defaultAlertTimestampFormatter,
  formatSnapshotCapturedAt,
} from "@/lib/alertReasonDisplayRules";

const ISO = "2026-10-15T15:54:26.221+00:00";
const originalTz = process.env.TZ;

beforeEach(() => {
  process.env.TZ = "America/Chicago";
});
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

function renderOne(occurred_at: string | null) {
  render(
    <EvidenceLinkageBadges
      events={[{ id: "2a6510b1-0000", type: "sensor_snapshot", source: "manual", occurred_at }]}
    />,
  );
  return screen.getByTestId("evidence-linkage-badges-item");
}

describe("EvidenceLinkageBadges occurred_at local time", () => {
  it("pins the test zone (America/Chicago is UTC-5 in October)", () => {
    expect(new Date(ISO).getTimezoneOffset()).toBe(300);
  });

  it("renders the helper's local rendering, never the raw ISO", () => {
    const item = renderOne(ISO);
    const local = defaultAlertTimestampFormatter(new Date(ISO));
    expect(local).toBe("Oct 15, 2026, 10:54 AM");
    expect(item.textContent).toContain(local);
    expect(item.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(item.textContent).not.toContain("+00:00");
    expect(item.textContent).toContain("2a6510b1-0000");
  });

  it("renders no time for a null occurred_at", () => {
    const item = renderOne(null);
    expect(item.textContent).not.toContain("Oct 15");
    expect(item.textContent).not.toMatch(/\d{1,2}:\d{2}\s?[AP]M/);
  });

  it("never shows Invalid Date for unparseable input", () => {
    const item = renderOne("not-a-date");
    expect(item.textContent).not.toContain("Invalid Date");
    expect(formatSnapshotCapturedAt("not-a-date")).toBe("not-a-date");
  });
});
