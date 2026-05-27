/**
 * Tests for TentSensorSourceHealthCard component + TentDetail wiring.
 *
 * - Render tests for empty state and active/stale badges.
 * - Static safety: no inserts/updates/deletes, no alerts, no action_queue,
 *   no device-control strings, no service_role in client code.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import TentSensorSourceHealthCard from "@/components/TentSensorSourceHealthCard";

const ROOT = resolve(__dirname, "../..");
const NOW = Date.now();
const RECENT = new Date(NOW - 5 * 60_000).toISOString();
const STALE_TS = new Date(NOW - 45 * 60_000).toISOString();

describe("TentSensorSourceHealthCard", () => {
  it("renders empty state when no readings exist", () => {
    render(<TentSensorSourceHealthCard readings={[]} />);
    expect(screen.getByTestId("tent-sensor-source-health-empty")).toHaveTextContent(
      "No sensor readings received for this tent yet.",
    );
  });

  it("renders active and stale source badges correctly", () => {
    const readings = [
      { source: "manual", ts: RECENT, metric: "temperature_c" },
      { source: "esp32_dht22", ts: STALE_TS, metric: "humidity_pct" },
    ];
    render(<TentSensorSourceHealthCard readings={readings} />);

    const rows = screen.getAllByTestId("sensor-source-row");
    expect(rows).toHaveLength(2);

    const badges = screen.getAllByTestId("sensor-source-status-badge");

    const activeIdx = rows.findIndex((r) => r.getAttribute("data-source") === "manual");
    const staleIdx = rows.findIndex((r) => r.getAttribute("data-source") === "esp32_dht22");

    expect(badges[activeIdx].getAttribute("data-status")).toBe("active");
    expect(badges[activeIdx]).toHaveTextContent("Active");
    expect(badges[staleIdx].getAttribute("data-status")).toBe("stale");
    expect(badges[staleIdx]).toHaveTextContent("Stale");
  });

  it("renders the card heading", () => {
    render(<TentSensorSourceHealthCard readings={[]} />);
    expect(screen.getByTestId("tent-sensor-source-health-card")).toHaveTextContent(
      "Sensor Source Health",
    );
  });
});

describe("Static safety – sensorSourceHealthRules", () => {
  const RULES_SRC = readFileSync(resolve(ROOT, "src/lib/sensorSourceHealthRules.ts"), "utf8");
  const CARD_SRC = readFileSync(
    resolve(ROOT, "src/components/TentSensorSourceHealthCard.tsx"),
    "utf8",
  );
  const combined = RULES_SRC + CARD_SRC;

  it("no insert/update/delete statements", () => {
    expect(combined).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/i);
  });

  it("no alerts table writes", () => {
    expect(combined).not.toMatch(/\.from\(\s*["']alerts["']\s*\)/i);
  });

  it("no action_queue writes", () => {
    expect(combined).not.toMatch(/\.from\(\s*["']action_queue["']\s*\)/i);
  });

  it("no device-control function calls", () => {
    expect(combined).not.toMatch(/deviceControl\s*\(/i);
  });

  it("no service_role in client code", () => {
    expect(combined).not.toMatch(/service_role/i);
  });
});
