/**
 * CodeRabbit on #2267 at 4dcba2be: `liftEntries` copies a feeding envelope's
 * `volume_ml` into `watering_amount_ml`. That field is the shared solution
 * volume in normalized diary details, and the Recent Quick Logs lane builds
 * its summary from the row's event type, so a feeding row still reads as
 * Feeding with its volume. This guard pins that rendered result; it is not a
 * RED test for a code change.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("@/hooks/useQuickLogRevisionBadges", () => ({
  QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE: "Correction history unavailable.",
  useQuickLogRevisionBadges: () => ({ badges: new Map(), status: "ok" }),
}));
vi.mock("@/components/RetractedQuickLogPanel", () => ({ default: () => null }));

import { RecentQuickLogActivityPanel } from "@/components/QuickLogHistoryPanels";

afterEach(() => cleanup());

describe("Recent Quick Logs feeding row volume (CodeRabbit on #2267)", () => {
  it("shows a feeding row's volume under Feeding, never as a watering", () => {
    render(
      <RecentQuickLogActivityPanel
        rawEntries={[
          {
            id: "feed-1",
            entry_type: "feeding",
            created_at: "2026-10-01T10:00:00Z",
            note: "Bloom feed",
            details: { feeding: { volume_ml: 500, ec_in: 1.2 } },
          },
        ]}
      />,
    );
    const row = within(screen.getByTestId("quicklog-history-section-recent")).getByTestId(
      "quicklog-history-row",
    );
    expect(row).toHaveTextContent("Feeding");
    expect(row).toHaveTextContent("500 ml");
    expect(row.textContent ?? "").not.toMatch(/water/i);
  });
});
