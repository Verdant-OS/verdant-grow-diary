import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: (...args: unknown[]) => mocks.track(...args),
}));

import PublicOneTentTour from "@/components/PublicOneTentTour";

const COMPONENT = readFileSync(resolve(__dirname, "../components/PublicOneTentTour.tsx"), "utf8");

beforeEach(() => {
  mocks.track.mockReset();
});

function renderTour(hasAccount = false) {
  return render(
    <MemoryRouter>
      <PublicOneTentTour hasAccount={hasAccount} />
    </MemoryRouter>,
  );
}

describe("public One-Tent tour", () => {
  it("labels every example as illustrative and never live", () => {
    renderTour();
    const label = screen.getByTestId("public-one-tent-tour-demo-label");
    expect(label).toHaveTextContent(/illustrative product walkthrough/i);
    expect(label).toHaveTextContent(/nothing shown here is live telemetry or a diagnosis/i);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Give every observation a home.");
  });

  it("exposes all five grouped steps as accessible tabs", () => {
    renderTour();
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getByTestId("public-one-tent-tour-tab-home")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("supports arrow, Home, and End keyboard navigation", async () => {
    const user = userEvent.setup();
    renderTour();

    const first = screen.getByTestId("public-one-tent-tour-tab-home");
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("public-one-tent-tour-tab-quick_log")).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent(
      "Capture the grow-room moment in seconds.",
    );

    await user.keyboard("{End}");
    expect(screen.getByTestId("public-one-tent-tour-tab-action_queue")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(first).toHaveFocus();
  });

  it("moves through the tour and emits a PII-free engagement event", async () => {
    const user = userEvent.setup();
    renderTour();

    await user.click(screen.getByTestId("public-one-tent-tour-tab-memory"));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("See plant memory beside sensor truth.");
    expect(screen.getByTestId("public-one-tent-tour-safety-note")).toHaveTextContent(
      /not live telemetry/i,
    );
    expect(mocks.track).toHaveBeenCalledWith("landing_loop_step_viewed", {
      item: "memory",
      source: "one_tent_tour",
    });
    expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(/email|user_id|token/i);
  });

  it("continues in order and stops with an explicit loop-complete state", async () => {
    const user = userEvent.setup();
    renderTour();

    for (const expected of [
      "Capture the grow-room moment in seconds.",
      "See plant memory beside sensor truth.",
      "Get a cautious read that shows its work.",
      "Turn advice into a grower-approved next step.",
    ]) {
      await user.click(screen.getByTestId("public-one-tent-tour-next"));
      expect(screen.getByRole("tabpanel")).toHaveTextContent(expected);
    }
    expect(screen.queryByTestId("public-one-tent-tour-next")).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/loop complete/i);
  });

  it("sends signed-out visitors to attributed signup and pricing paths", async () => {
    const user = userEvent.setup();
    renderTour();

    const signup = screen.getByTestId("public-one-tent-tour-signup-cta");
    expect(signup).toHaveAttribute(
      "href",
      "/auth?mode=signup&utm_source=landing_page&utm_medium=owned&utm_campaign=paid_launch",
    );
    await user.click(signup);
    expect(mocks.track).toHaveBeenCalledWith("landing_loop_signup_clicked", {
      source: "one_tent_tour",
      item: "landing_page",
    });

    const pricing = screen.getByTestId("public-one-tent-tour-pricing-cta");
    expect(pricing).toHaveAttribute(
      "href",
      "/pricing?utm_source=landing_page&utm_medium=owned&utm_campaign=paid_launch",
    );
    await user.click(pricing);
    expect(mocks.track).toHaveBeenCalledWith("landing_loop_pricing_clicked", {
      source: "one_tent_tour",
      item: "landing_page",
    });
  });

  it("preserves grower-invite attribution after the product tour", () => {
    render(
      <MemoryRouter>
        <PublicOneTentTour hasAccount={false} acquisitionSource="grower_invite" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("public-one-tent-tour-signup-cta")).toHaveAttribute(
      "href",
      "/auth?mode=signup&utm_source=grower_invite&utm_medium=referral&utm_campaign=grower_invite",
    );
    expect(screen.getByTestId("public-one-tent-tour-pricing-cta")).toHaveAttribute(
      "href",
      "/pricing?utm_source=grower_invite&utm_medium=referral&utm_campaign=grower_invite",
    );
  });

  it("sends signed-in growers back to their dashboard", () => {
    renderTour(true);
    expect(screen.getByTestId("public-one-tent-tour-dashboard-cta")).toHaveAttribute("href", "/");
    expect(screen.queryByTestId("public-one-tent-tour-signup-cta")).not.toBeInTheDocument();
  });

  it("contains no account query, mutation, model, or device-control integration", () => {
    expect(COMPONENT).not.toMatch(/supabase|useQuery|useMutation|fetch\s*\(|XMLHttpRequest/i);
    expect(COMPONENT).not.toMatch(/device_command|executeAction|approveAction|createAlert/i);
    expect(COMPONENT).not.toMatch(/@\/store|@\/hooks/);
  });
});
