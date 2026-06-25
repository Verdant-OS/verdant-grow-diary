/**
 * EnvironmentCheckTimelineBadge UI tests.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EnvironmentCheckTimelineBadge from "@/components/EnvironmentCheckTimelineBadge";
import { buildEnvironmentCheckDiaryViewModel } from "@/lib/environmentCheckViewModel";

// Guard: rendering the badge must not invoke any write helpers.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error("Supabase client must not be touched by presenter UI");
      },
    },
  ),
}));

const baseEntry = {
  entryId: "entry-1",
  occurredAt: "2026-06-11T12:00:00Z",
  kind: "environment",
};

describe("EnvironmentCheckTimelineBadge", () => {
  it("renders valid status with success tone", () => {
    const vm = buildEnvironmentCheckDiaryViewModel({
      ...baseEntry,
      snapshot: {
        source: "live",
        tempC: 24,
        rhPercent: 60,
        vpdBand: { minKpa: 0.8, maxKpa: 1.5 },
      },
    });
    render(<EnvironmentCheckTimelineBadge viewModel={vm} />);
    const badge = screen.getByTestId("environment-check-timeline-badge");
    expect(badge.getAttribute("data-status")).toBe("valid");
    expect(badge.getAttribute("data-tone")).toBe("success");
    expect(screen.getByTestId("environment-check-status-valid")).toBeTruthy();
    expect(screen.queryByTestId("environment-check-review-prompt")).toBeNull();
  });

  it("renders clear review prompt for invalid checks", () => {
    const vm = buildEnvironmentCheckDiaryViewModel({
      ...baseEntry,
      snapshot: { source: "bogus", tempC: 24, rhPercent: 60 },
    });
    render(<EnvironmentCheckTimelineBadge viewModel={vm} />);
    expect(screen.getByTestId("environment-check-status-invalid")).toBeTruthy();
    const prompt = screen.getByTestId("environment-check-review-prompt");
    expect(prompt.textContent).toMatch(/invalid/i);
  });

  it("renders clear review prompt for DST-ambiguous checks (not styled as success)", () => {
    const vm = buildEnvironmentCheckDiaryViewModel({
      ...baseEntry,
      snapshot: {
        source: "live",
        ppfdSamples: [
          { ts: "2026-03-08T09:00:00Z", ppfd: 200, source: "live" },
          { ts: "2026-03-09T00:00:00Z", ppfd: 200, source: "live" },
        ],
        tzIana: "America/Los_Angeles",
      },
    });
    render(<EnvironmentCheckTimelineBadge viewModel={vm} />);
    const badge = screen.getByTestId("environment-check-timeline-badge");
    expect(badge.getAttribute("data-status")).toBe("dst_ambiguous");
    expect(badge.getAttribute("data-tone")).not.toBe("success");
    expect(screen.getByTestId("environment-check-review-prompt").textContent).toMatch(/DST/);
  });
});
