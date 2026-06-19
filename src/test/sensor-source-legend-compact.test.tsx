import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import SensorSourceLegendCompact from "@/components/SensorSourceLegendCompact";
import {
  SENSOR_SOURCE_LEGEND,
  getSensorSourceLegend,
} from "@/lib/sensorSourceLegendViewModel";

describe("sensorSourceLegendViewModel", () => {
  it("exposes all 8 entries in stable order", () => {
    expect(SENSOR_SOURCE_LEGEND.map((e) => e.kind)).toEqual([
      "live",
      "manual",
      "csv",
      "demo",
      "derived",
      "stale",
      "invalid",
      "not_connected",
    ]);
    expect(getSensorSourceLegend()).toBe(SENSOR_SOURCE_LEGEND);
  });

  it("only stale and invalid carry caution tone", () => {
    for (const entry of SENSOR_SOURCE_LEGEND) {
      if (entry.kind === "stale" || entry.kind === "invalid") {
        expect(entry.tone).toBe("caution");
      } else {
        expect(entry.tone).toBe("calm");
      }
    }
  });

  it("Not connected copy is calm and non-alarming", () => {
    const e = SENSOR_SOURCE_LEGEND.find((x) => x.kind === "not_connected")!;
    expect(e.description).toBe("optional source not set up");
    expect(e.tone).toBe("calm");
  });

  it("legend copy contains no FUD words", () => {
    const all = SENSOR_SOURCE_LEGEND.map(
      (e) => `${e.label} ${e.description}`,
    ).join(" ");
    expect(all).not.toMatch(/blindspot/i);
    expect(all).not.toMatch(/failure/i);
    expect(all).not.toMatch(/broken/i);
    expect(all).not.toMatch(/diagnostics limited/i);
    expect(all).not.toMatch(/unavailable/i);
  });
});

describe("SensorSourceLegendCompact", () => {
  it("renders all 8 labels and descriptions", () => {
    render(<SensorSourceLegendCompact />);
    const root = screen.getByTestId("sensor-source-legend-compact");
    for (const entry of SENSOR_SOURCE_LEGEND) {
      const row = within(root).getByTestId(
        `sensor-source-legend-entry-${entry.kind}`,
      );
      expect(row).toHaveTextContent(entry.label);
      expect(row).toHaveTextContent(entry.description);
      expect(row.getAttribute("data-tone")).toBe(entry.tone);
    }
  });
});

describe("legend static safety", () => {
  const ROOT = resolve(__dirname, "../..");
  const VM = readFileSync(
    resolve(ROOT, "src/lib/sensorSourceLegendViewModel.ts"),
    "utf8",
  );
  const COMP = readFileSync(
    resolve(ROOT, "src/components/SensorSourceLegendCompact.tsx"),
    "utf8",
  );

  it("view model is import-free and side-effect-free", () => {
    expect(VM).not.toMatch(/^import\s+/m);
    expect(VM).not.toMatch(/@\/integrations\/supabase/);
    expect(VM).not.toMatch(/service_role/);
    expect(VM).not.toMatch(/action[_-]?queue/i);
    expect(VM).not.toMatch(/alert/i);
    expect(VM).not.toMatch(/ai[_-]?doctor/i);
    expect(VM).not.toMatch(/automation/i);
    expect(VM).not.toMatch(/device[_-]?control/i);
  });

  it("component contains no writes / supabase / ai / device imports", () => {
    expect(COMP).not.toMatch(/@\/integrations\/supabase/);
    expect(COMP).not.toMatch(/service_role/);
    expect(COMP).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    expect(COMP).not.toMatch(/action[_-]?queue/i);
    expect(COMP).not.toMatch(/ai[_-]?doctor/i);
    expect(COMP).not.toMatch(/mqtt|home[\s_-]?assistant|relay|actuator/i);
  });
});
