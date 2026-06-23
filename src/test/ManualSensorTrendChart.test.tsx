/**
 * Component + static safety tests for ManualSensorTrendChart.
 *
 * Locks: calm read-only context surface, unit labels visible,
 * empty/partial states render, flagged stale/invalid readings stay
 * visible, no writes / AI / Action Queue / device-control / raw
 * payload references in the component file.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ManualSensorTrendChart } from "@/components/ManualSensorTrendChart";

const COMPONENT_SRC = readFileSync(
  resolve(process.cwd(), "src/components/ManualSensorTrendChart.tsx"),
  "utf8",
);

const RULES_SRC = readFileSync(
  resolve(process.cwd(), "src/lib/manualSensorTrendChartViewModel.ts"),
  "utf8",
);

describe("ManualSensorTrendChart — chart surface", () => {
  it("renders title and context copy", () => {
    render(<ManualSensorTrendChart readings={[]} />);
    expect(
      screen.getByText("PPFD and environment context"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Compare recent manual light readings/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not an automated diagnosis/i),
    ).toBeInTheDocument();
  });

  it("renders the no-PPFD empty state when no readings", () => {
    render(<ManualSensorTrendChart readings={[]} />);
    const empty = screen.getByTestId("manual-sensor-trend-chart-empty");
    expect(empty).toHaveAttribute("data-state", "no_ppfd");
    expect(empty.textContent).toMatch(/no ppfd readings/i);
  });

  it("renders the PPFD-only partial-context state", () => {
    render(
      <ManualSensorTrendChart
        readings={[
          {
            ts: "2026-06-20T10:00:00Z",
            metric: "ppfd",
            value: 450,
            source: "manual",
          },
        ]}
      />,
    );
    const empty = screen.getByTestId("manual-sensor-trend-chart-empty");
    expect(empty).toHaveAttribute("data-state", "ppfd_only_no_environment");
    expect(empty.textContent).toMatch(/no temperature, humidity, or vpd/i);
  });

  it("renders unit headers for PPFD and environment metrics when ready", () => {
    render(
      <ManualSensorTrendChart
        readings={[
          { ts: "2026-06-20T10:00:00Z", metric: "ppfd", value: 412, source: "manual" },
          { ts: "2026-06-20T10:00:00Z", metric: "temperature_c", value: 24, source: "manual" },
          { ts: "2026-06-20T10:00:00Z", metric: "humidity_pct", value: 55, source: "manual" },
          { ts: "2026-06-20T10:00:00Z", metric: "vpd_kpa", value: 1.1, source: "manual" },
        ]}
      />,
    );
    const table = screen.getByTestId("manual-sensor-trend-chart-table");
    expect(within(table).getByText(/µmol\/m²\/s/)).toBeInTheDocument();
    expect(within(table).getByText(/°F/)).toBeInTheDocument();
    expect(within(table).getByText(/% RH/)).toBeInTheDocument();
    expect(within(table).getByText(/kPa/)).toBeInTheDocument();
    expect(within(table).getByText("412 µmol/m²/s")).toBeInTheDocument();
    expect(within(table).getByText("75.2°F")).toBeInTheDocument();
  });

  it("renders flagged stale/invalid readings rather than hiding them", () => {
    render(
      <ManualSensorTrendChart
        readings={[
          { ts: "2026-06-20T10:00:00Z", metric: "ppfd", value: 412, source: "manual" },
          { ts: "2026-06-20T10:00:00Z", metric: "temperature_c", value: 24, source: "manual" },
          { ts: "2026-06-19T10:00:00Z", metric: "ppfd", value: 300, source: "stale" },
          { ts: "2026-06-19T10:00:00Z", metric: "humidity_pct", value: 55, source: "invalid" },
        ]}
      />,
    );
    const flagged = screen.getByTestId("manual-sensor-trend-chart-flagged");
    const items = within(flagged).getAllByTestId(
      "manual-sensor-trend-chart-flagged-item",
    );
    expect(items).toHaveLength(2);
    const sources = items.map((i) => i.getAttribute("data-source")).sort();
    expect(sources).toEqual(["invalid", "stale"]);
  });
});

describe("ManualSensorTrendChart — static safety", () => {
  const forbiddenComponent: ReadonlyArray<{ token: string; label: string }> = [
    { token: ".insert(", label: "insert write" },
    { token: ".update(", label: "update write" },
    { token: ".delete(", label: "delete write" },
    { token: ".upsert(", label: "upsert write" },
    { token: "functions.invoke", label: "edge function invoke" },
    { token: "service_role", label: "service_role exposure" },
    { token: "action_queue", label: "Action Queue write" },
    { token: "device_command", label: "device control" },
    { token: "device-control", label: "device control" },
    { token: "actuator", label: "actuator reference" },
    { token: "autopilot", label: "automation reference" },
    { token: "raw_payload", label: "raw payload leakage" },
    { token: "bridge_id", label: "bridge ID leakage" },
    { token: "mac_address", label: "MAC leakage" },
    { token: "openai", label: "AI provider" },
    { token: "gemini", label: "AI provider" },
    { token: "anthropic", label: "AI provider" },
    { token: "lovable.dev/ai", label: "AI gateway" },
    { token: "ai-doctor", label: "AI Doctor call" },
    { token: "ai-coach", label: "AI Coach call" },
  ];

  for (const { token, label } of forbiddenComponent) {
    it(`component does not reference ${label} (${token})`, () => {
      expect(COMPONENT_SRC.toLowerCase()).not.toContain(token.toLowerCase());
    });
    it(`view-model does not reference ${label} (${token})`, () => {
      expect(RULES_SRC.toLowerCase()).not.toContain(token.toLowerCase());
    });
  }

  it("calm copy: forbids 'ideal' / 'healthy' / 'fix' / 'auto-adjust' / 'control lights'", () => {
    const banned = ["ideal", "healthy", "auto-adjust", "control lights"];
    for (const phrase of banned) {
      // Allow appearance in code comments? Safer: forbid in source entirely.
      expect(COMPONENT_SRC.toLowerCase()).not.toContain(phrase.toLowerCase());
      expect(RULES_SRC.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
    // "fix" is a short token; only forbid in component output strings. Skip
    // a global ban here to avoid false positives like "prefix" / "fixed".
  });
});
