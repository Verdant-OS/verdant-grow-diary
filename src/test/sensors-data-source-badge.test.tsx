/**
 * Tests for GrowDataSourceBadge presenter + Sensors page wiring.
 *
 * - Pure render tests for the badge across Live/Demo/Stale/Unavailable.
 * - Static contract tests for src/pages/Sensors.tsx wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import GrowDataSourceBadge from "@/components/GrowDataSourceBadge";

const NOW = new Date("2026-05-21T12:00:00.000Z").getTime();
const recent = new Date(NOW - 60_000).toISOString();
const old = new Date(NOW - 60 * 60_000).toISOString();

const ROOT = resolve(__dirname, "../..");
const SENSORS = readFileSync(resolve(ROOT, "src/pages/Sensors.tsx"), "utf8");
const BADGE = readFileSync(
  resolve(ROOT, "src/components/GrowDataSourceBadge.tsx"),
  "utf8",
);

describe("GrowDataSourceBadge", () => {
  it("renders Live for fresh real-source reading", () => {
    render(
      <GrowDataSourceBadge
        input={{ source: "sensor", value: 24.5, timestamp: recent }}
        options={{ now: NOW }}
      />,
    );
    const el = screen.getByTestId("grow-data-source-badge");
    expect(el.getAttribute("data-label")).toBe("Live");
    expect(el).toHaveTextContent("Live");
  });

  it("renders Demo for mock-backed reading and never Live", () => {
    render(
      <GrowDataSourceBadge
        input={{ source: "demo", value: 24.5, timestamp: recent }}
        options={{ now: NOW }}
      />,
    );
    const el = screen.getByTestId("grow-data-source-badge");
    expect(el.getAttribute("data-label")).toBe("Demo");
    expect(el.getAttribute("data-label")).not.toBe("Live");
  });

  it("renders Stale for old real-source reading", () => {
    render(
      <GrowDataSourceBadge
        input={{ source: "sensor", value: 1, timestamp: old }}
        options={{ now: NOW }}
      />,
    );
    expect(screen.getByTestId("grow-data-source-badge")).toHaveTextContent(
      "Stale",
    );
  });

  it("renders Unavailable for missing reading", () => {
    render(
      <GrowDataSourceBadge
        input={{ source: null, value: null, timestamp: null }}
      />,
    );
    expect(screen.getByTestId("grow-data-source-badge")).toHaveTextContent(
      "Unavailable",
    );
  });

  it("hides badge for Live when alwaysShow=false", () => {
    const { container } = render(
      <GrowDataSourceBadge
        alwaysShow={false}
        input={{ source: "sensor", value: 1, timestamp: recent }}
        options={{ now: NOW }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("Sensors page wiring (source contract)", () => {
  it("imports the badge and the rule helper", () => {
    expect(SENSORS).toMatch(/from\s+["']@\/components\/GrowDataSourceBadge["']/);
    expect(SENSORS).toMatch(
      /from\s+["']@\/lib\/growDataSourceLabelRules["']/,
    );
  });

  it("labels current mock-backed readings as demo (not live) when the real source is missing", () => {
    // AUD-003: the page now classifies on the real reading's source when
    // present, and falls back to "demo" only when none is known. It must
    // never hard-label live/supabase/sensor when the data is mock.
    expect(SENSORS).toMatch(/["']demo["']/);
    expect(SENSORS).not.toMatch(/source:\s*["'](live|supabase|sensor)["']/);
  });

  it("renders GrowDataSourceBadge near readings", () => {
    expect(SENSORS).toMatch(/<GrowDataSourceBadge/);
  });

  it("renders an empty state instead of an empty chart when there are no readings", () => {
    // AUD-003: previously gated on classification.label === "Unavailable";
    // now gated on hasReadings so valid-but-stale readings still chart.
    expect(SENSORS).toMatch(/hasReadings/);
    expect(SENSORS).toMatch(/No reading available/i);
  });

  it("does not introduce writes, service_role, or external-control surface", () => {
    expect(SENSORS).not.toMatch(/service_role/);
    expect(SENSORS).not.toMatch(
      /\.(insert|update|delete|upsert)\s*\(/,
    );
    expect(SENSORS).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook/i,
    );
  });

  it("badge presenter delegates classification to the pure rule helper", () => {
    expect(BADGE).toMatch(/classifyGrowDataSource/);
    expect(BADGE).not.toMatch(/supabase/i);
  });
});
