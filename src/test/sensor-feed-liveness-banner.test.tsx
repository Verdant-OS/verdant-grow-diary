/**
 * The outage banner on the Sensor bridge status card.
 *
 * The card already renders a `stale` badge, which is what it showed for the
 * entire fifteen days the EcoWitt feed was dead. These tests pin the new
 * distinction: the banner appears for a dead feed and stays out of the way for
 * a merely-late one.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import SensorBridgeHealthCard from "@/components/SensorBridgeHealthCard";
import type { SensorBridgeHealthViewModel } from "@/lib/sensorBridgeHealthViewModel";

const NOW = new Date("2026-07-29T12:00:00.000Z");

function vm(over: Partial<SensorBridgeHealthViewModel> = {}): SensorBridgeHealthViewModel {
  return {
    state: "stale",
    status: "stale",
    headline: "Sensor bridge status",
    message: "Latest bridge reading is stale.",
    controlDisclosure: "No device control.",
    latestAcceptedAtIso: "2026-07-14T09:00:00.000Z",
    latestRejectedAtIso: null,
    latestReasonCode: null,
    ...over,
  } as SensorBridgeHealthViewModel;
}

function renderCard(model: SensorBridgeHealthViewModel) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SensorBridgeHealthCard viewModel={model} livenessNow={NOW} />
    </QueryClientProvider>,
  );
}

describe("dead feed", () => {
  it("shows the outage banner for a fifteen-day silence", () => {
    renderCard(vm());
    const banner = screen.getByTestId("sensor-feed-liveness-banner");
    expect(banner).toBeInTheDocument();
    expect(banner.getAttribute("data-liveness")).toBe("outage");
    expect(banner.textContent).toContain("15 days");
  });

  it("still renders the existing stale badge — the banner adds, never replaces", () => {
    renderCard(vm());
    // Regression guard: the card's own state reporting must survive.
    expect(screen.getByTestId("sensor-bridge-health-state")).toHaveAttribute("data-state", "stale");
    expect(screen.getByTestId("sensor-bridge-health-message")).toBeInTheDocument();
  });

  it("flags a bridge that has never delivered", () => {
    renderCard(vm({ latestAcceptedAtIso: null }));
    expect(screen.getByTestId("sensor-feed-liveness-banner").getAttribute("data-liveness")).toBe(
      "never_reported",
    );
  });
});

describe("healthy and merely-late feeds stay quiet", () => {
  it("no banner when the feed reported minutes ago", () => {
    renderCard(
      vm({ state: "usable", latestAcceptedAtIso: new Date(NOW.getTime() - 120_000).toISOString() }),
    );
    expect(screen.queryByTestId("sensor-feed-liveness-banner")).toBeNull();
  });

  it("no banner for a stale-but-alive feed", () => {
    // 45 minutes: the card correctly says "stale". That is not an outage, and
    // firing here is what would train growers to ignore the banner.
    renderCard(vm({ latestAcceptedAtIso: new Date(NOW.getTime() - 45 * 60_000).toISOString() }));
    expect(screen.queryByTestId("sensor-feed-liveness-banner")).toBeNull();
    expect(screen.getByTestId("sensor-bridge-health-state")).toHaveAttribute("data-state", "stale");
  });
});

describe("accounts with no bridge", () => {
  it("never shows an outage banner when state is no_data", () => {
    // Manual-only and CSV-only growers must not be alarmed on day one.
    renderCard(vm({ state: "no_data", status: "no_data", latestAcceptedAtIso: null }));
    expect(screen.queryByTestId("sensor-feed-liveness-banner")).toBeNull();
  });
});
