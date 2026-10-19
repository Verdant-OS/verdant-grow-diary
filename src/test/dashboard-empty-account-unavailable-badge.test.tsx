/**
 * A brand-new account's dashboard welcome card must not paint a failed-read
 * badge. A successful empty read is sourceReason "no-rows".
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardDataSourceDisclosure from "@/components/DashboardDataSourceDisclosure";
import type { GrowDataSourceMeta } from "@/hooks/useGrowData";

const noRows = (): GrowDataSourceMeta => ({
  isDemoData: false,
  dataSource: "unavailable",
  sourceReason: "no-rows",
});

const fetchError = (): GrowDataSourceMeta => ({
  isDemoData: false,
  dataSource: "unavailable",
  sourceReason: "fetch-error",
});

describe("Dashboard welcome card on a successful empty account", () => {
  it("keeps the welcome copy and hides the Unavailable badge", () => {
    render(
      <DashboardDataSourceDisclosure
        hasAnyData={false}
        hasGrow={false}
        metas={[noRows(), noRows()]}
      />,
    );
    const disclosure = screen.getByTestId("dashboard-data-source-disclosure");
    expect(disclosure).toHaveTextContent("Welcome to Verdant Grow OS");
    expect(disclosure).toHaveTextContent(
      "No real grow, tent, plant, or sensor data yet. Create your first grow to get started.",
    );
    expect(disclosure.getAttribute("data-empty-reason")).toBe("no-rows");
    expect(screen.queryByTestId("dashboard-data-source-badge")).toBeNull();
  });

  it("still shows the load error when any meta is a fetch error", () => {
    render(
      <DashboardDataSourceDisclosure
        hasAnyData={false}
        hasGrow={false}
        metas={[noRows(), fetchError()]}
      />,
    );
    expect(screen.getByTestId("dashboard-data-source-read-error")).toBeInTheDocument();
    expect(screen.queryByText("Welcome to Verdant Grow OS")).toBeNull();
  });
});
