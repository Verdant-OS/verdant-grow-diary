/**
 * QuickLogSensorSnapshotStrip — "Correct manual reading" action gating.
 *
 * The affordance must:
 *  - Be hidden when no manualReadingIds are supplied (default).
 *  - Be hidden when the supplied IDs contain no real UUIDs.
 *  - Be shown ONLY when the strip renders a manual snapshot AND the
 *    caller supplied a real original reading UUID + captured_at.
 *  - Link to /sensors#manual-reading?... with the correction context.
 *
 * We drive the strip via the same hook it consumes internally by
 * mocking `useLatestTentSensorSnapshot` so the presenter renders a
 * deterministic manual snapshot without any network.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: "fresh_live",
    snapshot: {
      source: "manual",
      captured_at: "2026-07-01T12:00:00.000Z",
      metrics: {
        temperature_c: { value: 24 },
        humidity_pct: { value: 58 },
      },
    },
  }),
}));

import QuickLogSensorSnapshotStrip from "@/components/QuickLogSensorSnapshotStrip";

const TENT = "11111111-1111-4111-8111-111111111111";
const R_TEMP = "22222222-2222-4222-8222-222222222222";

describe("QuickLogSensorSnapshotStrip — Correct manual reading action", () => {
  it("hides the correction action by default (no IDs supplied)", () => {
    const { queryByTestId } = render(
      <QuickLogSensorSnapshotStrip tentId={TENT} attached />,
    );
    expect(queryByTestId("quicklog-sensor-snapshot-correct-action")).toBeNull();
  });

  it("hides the correction action when manualReadingIds contain no real UUIDs", () => {
    const { queryByTestId } = render(
      <QuickLogSensorSnapshotStrip
        tentId={TENT}
        attached
        manualReadingIds={{ temperature_c: "not-a-uuid" }}
        manualCapturedAt="2026-07-01T12:00:00.000Z"
      />,
    );
    expect(queryByTestId("quicklog-sensor-snapshot-correct-action")).toBeNull();
  });

  it("hides the correction action when tentId is missing", () => {
    const { queryByTestId } = render(
      <QuickLogSensorSnapshotStrip
        tentId={null}
        attached
        manualReadingIds={{ temperature_c: R_TEMP }}
        manualCapturedAt="2026-07-01T12:00:00.000Z"
      />,
    );
    expect(queryByTestId("quicklog-sensor-snapshot-correct-action")).toBeNull();
  });

  it("renders the correction link when a real original UUID + capturedAt are supplied for a manual snapshot", () => {
    const { getByTestId } = render(
      <QuickLogSensorSnapshotStrip
        tentId={TENT}
        attached
        manualReadingIds={{ temperature_c: R_TEMP }}
        manualCapturedAt="2026-07-01T12:00:00.000Z"
        manualValues={{ temperature_c: 24 }}
      />,
    );
    const link = getByTestId("quicklog-sensor-snapshot-correct-action") as HTMLAnchorElement;
    const href = link.getAttribute("href") ?? "";
    expect(href).toMatch(/^\/sensors#manual-reading\?/);
    expect(href).toContain(`tent_id=${TENT}`);
    expect(href).toContain(`r_temperature_c=${R_TEMP}`);
  });
});
