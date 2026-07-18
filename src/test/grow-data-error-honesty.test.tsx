import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import GrowDataLoadError, { GrowDataLoadingState } from "@/components/GrowDataLoadError";

const ROOT = resolve(__dirname, "../..");

function readSource(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("private grow-data error honesty", () => {
  it("renders an explicit retryable error instead of empty-grow copy", () => {
    const onRetry = vi.fn();
    render(<GrowDataLoadError resource="Tent data" testId="grow-data-error" onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Tent data unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("This is not an empty grow");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders a non-empty loading boundary and supports a failure without a fake retry", () => {
    const { rerender } = render(
      <GrowDataLoadingState resource="Sensor data" testId="sensor-data-loading" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading sensor data");

    rerender(
      <GrowDataLoadError
        resource="Environment snapshots"
        testId="environment-snapshot-error"
        message="The read failed, so absence is not established."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("absence is not established");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it.each([
    ["src/pages/Tents.tsx", "tents-grow-data-error", "No tents yet"],
    ["src/pages/Plants.tsx", "plants-grow-data-error", "filtered.length === 0"],
    ["src/pages/Dashboard.tsx", "dashboard-grow-data-error", "<KpiCard"],
    ["src/pages/Sensors.tsx", "sensors-grow-data-error", "sensors-first-tent-setup"],
  ])("puts a retryable failure branch before empty or zero UI in %s", (path, testId, emptyCue) => {
    const source = readSource(path);
    const errorIndex = source.indexOf(testId);
    const emptyIndex = source.indexOf(emptyCue);

    expect(source).toContain("GrowDataLoadError");
    expect(source).toContain(".isError");
    expect(source).toContain(".refetch()");
    expect(errorIndex).toBeGreaterThan(-1);
    expect(emptyIndex).toBeGreaterThan(errorIndex);
  });

  it("keeps the Sensors grow read tent-scoped and null-disabled", () => {
    const source = readSource("src/pages/Sensors.tsx");
    expect(source).toMatch(/useGrowSensorReadings\(tentId\)/);
    expect(source).not.toMatch(/useGrowSensorReadings\(\s*\)/);
  });
});

describe("private grow React Query boundary", () => {
  const source = readSource("src/hooks/useGrowData.ts");

  it("keys private rows by authenticated cache owner without sending owner authority", () => {
    expect(source).toMatch(/useAuth\(\)\.user\?\.id/);
    expect(source).toContain("buildPrivateGrowQueryKey");
    expect(source).not.toMatch(/\.eq\(["']user_id["']/);
  });

  it("disables retries explicitly on every private grow query", () => {
    expect(source.match(/retry:\s*false/g)).toHaveLength(5);
  });
});
