/**
 * Tests for DashboardDataSourceDisclosure presenter + Dashboard wiring.
 *
 * - Pure render tests verifying Live / Demo / Mixed / Unavailable labelling.
 * - Static contract tests for src/pages/Dashboard.tsx wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import DashboardDataSourceDisclosure from "@/components/DashboardDataSourceDisclosure";
import type { GrowDataSourceMeta } from "@/hooks/useGrowData";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const DISCLOSURE = readFileSync(
  resolve(ROOT, "src/components/DashboardDataSourceDisclosure.tsx"),
  "utf8",
);

const meta = (
  dataSource: GrowDataSourceMeta["dataSource"],
  isDemoData = dataSource === "mock" || dataSource === "mixed",
): GrowDataSourceMeta => ({
  isDemoData,
  dataSource,
  sourceReason: "test",
});

describe("DashboardDataSourceDisclosure (presenter)", () => {
  it("shows Demo badge when any section is mock-backed", () => {
    render(
      <DashboardDataSourceDisclosure
        hasAnyData
        metas={[meta("mock"), meta("mock")]}
      />,
    );
    const b = screen.getByTestId("dashboard-data-source-badge");
    expect(b.getAttribute("data-label")).toBe("Demo");
    expect(b).toHaveTextContent(/demo/i);
  });

  it("shows Mixed badge when sources include real and mock", () => {
    render(
      <DashboardDataSourceDisclosure
        hasAnyData
        metas={[meta("supabase", false), meta("mock")]}
      />,
    );
    const b = screen.getByTestId("dashboard-data-source-badge");
    expect(b.getAttribute("data-label")).toBe("Mixed");
  });

  it("never shows Live for mock-backed metadata", () => {
    render(
      <DashboardDataSourceDisclosure
        hasAnyData
        metas={[meta("mock"), meta("mock")]}
      />,
    );
    const b = screen.getByTestId("dashboard-data-source-badge");
    expect(b.getAttribute("data-label")).not.toBe("Live");
  });

  it("shows Live badge when every section is supabase-backed", () => {
    render(
      <DashboardDataSourceDisclosure
        hasAnyData
        metas={[meta("supabase", false), meta("supabase", false)]}
      />,
    );
    const b = screen.getByTestId("dashboard-data-source-badge");
    expect(b.getAttribute("data-label")).toBe("Live");
  });

  it("shows Unavailable welcome state when there is no usable data", () => {
    render(
      <DashboardDataSourceDisclosure
        hasAnyData={false}
        metas={[meta("unavailable", false)]}
      />,
    );
    const b = screen.getByTestId("dashboard-data-source-badge");
    expect(b.getAttribute("data-label")).toBe("Unavailable");
    expect(
      screen.getByTestId("dashboard-data-source-disclosure"),
    ).toHaveTextContent(/welcome/i);
  });

  it("falls back to Unavailable when no metas resolved", () => {
    render(
      <DashboardDataSourceDisclosure hasAnyData={false} metas={[]} />,
    );
    expect(
      screen.getByTestId("dashboard-data-source-badge").getAttribute("data-label"),
    ).toBe("Unavailable");
  });
});

describe("Dashboard data-source disclosure wiring", () => {
  it("Dashboard imports DashboardDataSourceDisclosure", () => {
    expect(DASHBOARD).toMatch(
      /from\s+["']@\/components\/DashboardDataSourceDisclosure["']/,
    );
    expect(DASHBOARD).toMatch(/<DashboardDataSourceDisclosure/);
  });

  it("disclosure presenter delegates classification to useGrowData helpers", () => {
    expect(DISCLOSURE).toMatch(/combineGrowDataMeta/);
    expect(DISCLOSURE).toMatch(/getGrowDataMeta/);
  });

  it("disclosure does not introduce writes, service_role, or device control", () => {
    expect(DISCLOSURE).not.toMatch(/service_role/);
    expect(DISCLOSURE).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    expect(DISCLOSURE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook/i,
    );
  });
});
