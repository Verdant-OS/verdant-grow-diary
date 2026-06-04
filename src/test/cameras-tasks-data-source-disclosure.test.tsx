/**
 * Tests for Tasks page data-source disclosure + real-source safety.
 *
 * Verdant does not yet have a real `tasks` table. The Tasks page must
 * therefore avoid showing demo/mock rows as real schedule output and must
 * render a safe empty state with an "Unavailable" disclosure.
 *
 * Cameras has been removed from the current Verdant build (out of V0
 * scope); its disclosure tests were removed alongside the page.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import type { GrowDataSourceMeta } from "@/hooks/useGrowData";
import Tasks from "@/pages/Tasks";

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
  it("renders Unavailable badge when no real task source exists", () => {
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

  it("never renders Live for unavailable tasks", () => {
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
    ).not.toBe("Live");
  });
});

describe("Tasks page rendering", () => {
  it("renders safe empty state copy instead of demo task rows", () => {
    render(
      <MemoryRouter>
        <Tasks />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("tasks-empty-state")).toBeTruthy();
    expect(screen.getByText("No tasks yet.")).toBeTruthy();
    expect(
      screen.getByText(
        /Create a task from a plant, alert, or grow workflow when there's something to track\./,
      ),
    ).toBeTruthy();
  });

  it("renders Unavailable disclosure (not Demo, not Live)", () => {
    render(
      <MemoryRouter>
        <Tasks />
      </MemoryRouter>,
    );
    const label = screen
      .getByTestId("tasks-data-source-disclosure-badge")
      .getAttribute("data-label");
    expect(label).toBe("Unavailable");
  });

  it("does not render any demo/sample task headings (Today/Upcoming/Done columns)", () => {
    render(
      <MemoryRouter>
        <Tasks />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/^Today$/)).toBeNull();
    expect(screen.queryByText(/^Upcoming$/)).toBeNull();
    expect(screen.queryByText(/^Done$/)).toBeNull();
  });
});

describe("Tasks page static safety", () => {
  it("does not import demo/mock task data", () => {
    expect(TASKS).not.toMatch(/useMockData/);
    expect(TASKS).not.toMatch(/useTasks\b/);
    expect(TASKS).not.toMatch(/mockTasks|sampleTasks|demoTasks/i);
  });

  it("does not declare mock dataSource metadata", () => {
    expect(TASKS).not.toMatch(/dataSource:\s*["']mock["']/);
    expect(TASKS).not.toMatch(/dataSource:\s*["']mixed["']/);
  });

  it("imports and renders GrowDataSourceDisclosure", () => {
    expect(TASKS).toMatch(
      /from\s+["']@\/components\/GrowDataSourceDisclosure["']/,
    );
    expect(TASKS).toMatch(/<GrowDataSourceDisclosure/);
  });

  it("does not introduce writes, service_role, device control, or automation", () => {
    expect(TASKS).not.toMatch(/service_role/);
    expect(TASKS).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook/i,
    );
    expect(TASKS).not.toMatch(/_executed\b/);
    expect(TASKS).not.toMatch(/autopilot/i);
  });

  it("does not inject client-side user_id", () => {
    expect(TASKS).not.toMatch(/user_id\s*:/);
  });

  it("does not contain inline mock/demo task arrays", () => {
    expect(TASKS).not.toMatch(/const\s+(MOCK|DEMO|SAMPLE)_TASKS/);
  });
});
