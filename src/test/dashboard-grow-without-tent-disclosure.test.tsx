/**
 * Grow-only dashboard disclosure: a saved grow with no tent or plant must
 * not claim the account has no grow, and must not paint a failed read.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import DashboardDataSourceDisclosure from "@/components/DashboardDataSourceDisclosure";
import type { GrowDataSourceMeta } from "@/hooks/useGrowData";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");

const unavailable = (): GrowDataSourceMeta => ({
  isDemoData: false,
  dataSource: "unavailable",
  sourceReason: "test",
});

const GROW_SET_UP_COPY = "Your grow is set up. Add a tent to start tracking.";

describe("Dashboard disclosure when a grow exists and no tent or plant does", () => {
  it("does not show the no-grow welcome or a destructive Unavailable badge", () => {
    render(<DashboardDataSourceDisclosure hasAnyData={false} hasGrow metas={[unavailable()]} />);
    const disclosure = screen.getByTestId("dashboard-data-source-disclosure");
    expect(disclosure).toHaveTextContent(GROW_SET_UP_COPY);
    expect(disclosure).not.toHaveTextContent(/No real grow/i);
    expect(disclosure).not.toHaveTextContent(/Create your first grow/i);
    expect(disclosure).not.toHaveTextContent(/Welcome to Verdant/i);
    expect(disclosure.getAttribute("data-source")).toBe("unavailable");
    expect(screen.queryByTestId("dashboard-data-source-badge")).toBeNull();
    expect(disclosure.getAttribute("data-label")).not.toBe("Live");
  });

  it("still shows the no-grow welcome when there is no grow", () => {
    render(
      <DashboardDataSourceDisclosure hasAnyData={false} hasGrow={false} metas={[unavailable()]} />,
    );
    expect(screen.getByTestId("dashboard-data-source-disclosure")).toHaveTextContent(
      /No real grow, tent, plant, or sensor data yet/,
    );
    expect(screen.getByTestId("dashboard-data-source-badge").getAttribute("data-label")).toBe(
      "Unavailable",
    );
  });

  it("Dashboard passes the grow count into the disclosure", () => {
    expect(DASHBOARD).toMatch(
      /<DashboardDataSourceDisclosure[\s\S]*?hasGrow=\{grows\.length > 0\}/,
    );
  });
});
