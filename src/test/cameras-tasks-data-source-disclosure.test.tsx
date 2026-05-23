/**
 * Tests for Tasks data-source disclosure wiring.
 *
 * Cameras has been removed from the current Verdant build (out of V0
 * scope); its disclosure tests were removed alongside the page.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import type { GrowDataSourceMeta } from "@/hooks/useGrowData";

const ROOT = resolve(__dirname, "../..");
const TASKS = readFileSync(resolve(ROOT, "src/pages/Tasks.tsx"), "utf8");

const meta = (
  dataSource: GrowDataSourceMeta["dataSource"],
): GrowDataSourceMeta => ({
  isDemoData: dataSource === "mock" || dataSource === "mixed",
  dataSource,
  sourceReason: "test",
});

describe("Tasks disclosure behavior", () => {
  it("renders Demo badge for mock-backed tasks", () => {
    render(
      <GrowDataSourceDisclosure
        resource="tasks"
        hasAnyData
        metas={[meta("mock")]}
        testId="tasks-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("tasks-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).toBe("Demo");
  });

  it("never renders Live for mock-backed tasks", () => {
    render(
      <GrowDataSourceDisclosure
        resource="tasks"
        hasAnyData
        metas={[meta("mock")]}
        testId="tasks-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("tasks-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).not.toBe("Live");
  });

  it("renders safe empty/unavailable state when no tasks exist", () => {
    render(
      <GrowDataSourceDisclosure
        resource="tasks"
        hasAnyData={false}
        metas={[meta("unavailable")]}
        testId="tasks-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("tasks-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).toBe("Unavailable");
  });
});

describe("Tasks page wiring", () => {
  it("imports and renders GrowDataSourceDisclosure", () => {
    expect(TASKS).toMatch(
      /from\s+["']@\/components\/GrowDataSourceDisclosure["']/,
    );
    expect(TASKS).toMatch(/<GrowDataSourceDisclosure/);
  });

  it("declares explicit mock metadata so demo tasks cannot look live", () => {
    expect(TASKS).toMatch(/dataSource:\s*["']mock["']/);
  });

  it("does not introduce writes, service_role, or device control", () => {
    expect(TASKS).not.toMatch(/service_role/);
    expect(TASKS).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook/i,
    );
  });
});
