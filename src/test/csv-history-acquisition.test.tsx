import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/components/LeadCaptureForm", () => ({
  default: () => <div data-testid="hardware-partner-form" />,
}));
vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: (...args: unknown[]) => mocks.track(...args),
}));

import HardwareIntegrations from "@/pages/HardwareIntegrations";

const EXPECTED_SIGNUP_PATH =
  "/auth?mode=signup&utm_source=csv_history&utm_medium=owned&utm_campaign=csv_history";

beforeEach(() => {
  mocks.track.mockReset();
});

describe("CSV-history public acquisition path", () => {
  it("offers an honest grower-first signup handoff and measures the page without PII", () => {
    render(
      <MemoryRouter>
        <HardwareIntegrations />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("csv-history-signup-cta-hero")).toHaveAttribute(
      "href",
      EXPECTED_SIGNUP_PATH,
    );
    expect(screen.getByTestId("csv-history-signup-cta-section")).toHaveAttribute(
      "href",
      EXPECTED_SIGNUP_PATH,
    );
    expect(screen.getByText(/CSV import and basic logging are free/i)).toBeInTheDocument();
    expect(screen.getByText(/never live telemetry/i)).toBeInTheDocument();
    expect(screen.getByText(/read-only background context/i)).toBeInTheDocument();
    expect(screen.getByText(/never creates an action automatically/i)).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith("csv_history_page_view", {
      source: "csv_history",
    });
    expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(
      /email|token|plant_?id|grow_?id|tent_?id|note/i,
    );
  });

  it("measures both grower signup CTAs with fixed location labels", () => {
    render(
      <MemoryRouter>
        <HardwareIntegrations />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("csv-history-signup-cta-hero"));
    fireEvent.click(screen.getByTestId("csv-history-signup-cta-section"));

    expect(mocks.track).toHaveBeenCalledWith("csv_history_signup_clicked", {
      source: "csv_history",
      item: "hero",
    });
    expect(mocks.track).toHaveBeenCalledWith("csv_history_signup_clicked", {
      source: "csv_history",
      item: "csv_history_section",
    });
  });
});
