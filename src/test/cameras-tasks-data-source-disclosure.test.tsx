/**
 * Tests for Cameras + Tasks data-source disclosure wiring.
 *
 * Static contract tests verify imports and presenter wiring. Pure render
 * tests reuse the shared GrowDataSourceDisclosure presenter (which is what
 * both pages render at the top of their layout).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import type { GrowDataSourceMeta } from "@/hooks/useGrowData";

const ROOT = resolve(__dirname, "../..");
const CAMERAS = readFileSync(resolve(ROOT, "src/pages/Cameras.tsx"), "utf8");
const TASKS = readFileSync(resolve(ROOT, "src/pages/Tasks.tsx"), "utf8");

const meta = (
  dataSource: GrowDataSourceMeta["dataSource"],
): GrowDataSourceMeta => ({
  isDemoData: dataSource === "mock" || dataSource === "mixed",
  dataSource,
  sourceReason: "test",
});

describe("Cameras disclosure behavior", () => {
  it("renders Demo badge for mock-backed cameras", () => {
    render(
      <GrowDataSourceDisclosure
        resource="cameras"
        hasAnyData
        metas={[meta("mock")]}
        testId="cameras-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("cameras-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).toBe("Demo");
  });

  it("never renders Live for mock-backed cameras", () => {
    render(
      <GrowDataSourceDisclosure
        resource="cameras"
        hasAnyData
        metas={[meta("mock")]}
        testId="cameras-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("cameras-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).not.toBe("Live");
  });

  it("renders safe empty/unavailable state when no cameras exist", () => {
    render(
      <GrowDataSourceDisclosure
        resource="cameras"
        hasAnyData={false}
        metas={[meta("unavailable")]}
        testId="cameras-data-source-disclosure"
      />,
    );
    expect(
      screen
        .getByTestId("cameras-data-source-disclosure-badge")
        .getAttribute("data-label"),
    ).toBe("Unavailable");
  });
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

describe("Cameras page wiring", () => {
  it("imports and renders GrowDataSourceDisclosure", () => {
    expect(CAMERAS).toMatch(
      /from\s+["']@\/components\/GrowDataSourceDisclosure["']/,
    );
    expect(CAMERAS).toMatch(/<GrowDataSourceDisclosure/);
  });

  it("declares explicit mock metadata so demo cameras cannot look live", () => {
    expect(CAMERAS).toMatch(/dataSource:\s*["']mock["']/);
  });

  it("does not introduce writes, service_role, or device control", () => {
    expect(CAMERAS).not.toMatch(/service_role/);
    expect(CAMERAS).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook/i,
    );
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
