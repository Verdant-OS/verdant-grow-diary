/**
 * Plant Detail · Assigned Tent Environment panel.
 *
 * Mix of pure-rule unit tests, hook query-shape tests, and static
 * source-level guardrails. Covers:
 *  - empty states (no tent / no readings)
 *  - rendering of available metrics, source, stale labels
 *  - hook is disabled when no tent is assigned
 *  - hook queries sensor_readings scoped only by tent_id
 *  - no writes, no automation/device-control strings, no Edge / pi-ingest edits
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { buildPlantTentEnvironmentView } from "@/lib/plantTentEnvironmentRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

// --- Mock supabase BEFORE importing the hook ---
const limitMock = vi.fn();
const orderMock = vi.fn(() => ({ limit: limitMock }));
const eqMock = vi.fn(() => ({ order: orderMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock: ReturnType<typeof vi.fn> = vi.fn(() => ({ select: selectMock }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

import { usePlantTentLatestReadings } from "@/hooks/usePlantTentLatestReadings";

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  fromMock.mockClear();
  selectMock.mockClear();
  eqMock.mockClear();
  orderMock.mockClear();
  limitMock.mockReset();
});

describe("buildPlantTentEnvironmentView (pure)", () => {
  it("returns empty view for null/empty input", () => {
    expect(buildPlantTentEnvironmentView(null).hasReadings).toBe(false);
    expect(buildPlantTentEnvironmentView([]).hasReadings).toBe(false);
  });

  it("maps available metrics and leaves missing ones as Unknown", () => {
    const ts = new Date().toISOString();
    const view = buildPlantTentEnvironmentView([
      { ts, metric: "temperature_c", value: 24.5, source: "sensor" },
      { ts, metric: "humidity_pct", value: 55, source: "sensor" },
    ]);
    expect(view.hasReadings).toBe(true);
    expect(view.sourceLabel).toBe("Live sensor");
    expect(view.stale).toBe(false);
    const temp = view.metrics.find((m) => m.key === "temp")!;
    const vpd = view.metrics.find((m) => m.key === "vpd")!;
    expect(temp.hasValue).toBe(true);
    // 24.5°C displayed as Fahrenheit per Verdant convention: 24.5*9/5+32 = 76.1°F
    expect(temp.display).toContain("76.1");
    expect(temp.display).toContain("°F");
    expect(vpd.hasValue).toBe(false);
    expect(vpd.display).toBe("Unknown");
  });

  it("does not invent missing values as zero", () => {
    const ts = new Date().toISOString();
    const view = buildPlantTentEnvironmentView([
      { ts, metric: "temperature_c", value: 22, source: "sensor" },
    ]);
    for (const m of view.metrics) {
      if (!m.hasValue) expect(m.display).toBe("Unknown");
    }
  });

  it("flags stale readings via the shared isStale helper", () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const view = buildPlantTentEnvironmentView([
      { ts: old, metric: "temperature_c", value: 21, source: "sensor" },
    ]);
    expect(view.stale).toBe(true);
  });

  it("surfaces source label when source metadata is present", () => {
    const ts = new Date().toISOString();
    expect(
      buildPlantTentEnvironmentView([
        { ts, metric: "temperature_c", value: 22, source: "manual" },
      ]).sourceLabel,
    ).toBe("Manual");
  });
});

describe("usePlantTentLatestReadings (scoping)", () => {
  it("is disabled when no tentId is provided (no sensor_readings query)", async () => {
    const { result } = renderHook(() => usePlantTentLatestReadings(null), {
      wrapper: wrapper(),
    });
    // give react-query a tick; should remain idle/fetchStatus 'idle'
    await new Promise((r) => setTimeout(r, 10));
    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.isFetching).toBe(false);
  });

  it("queries sensor_readings scoped only by tent_id when assigned", async () => {
    limitMock.mockResolvedValue({ data: [], error: null });
    renderHook(() => usePlantTentLatestReadings("tent-123"), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith("sensor_readings"));
    expect(selectMock).toHaveBeenCalledWith("ts,metric,value,source");
    expect(eqMock).toHaveBeenCalledWith("tent_id", "tent-123");
    expect(orderMock).toHaveBeenCalledWith("ts", { ascending: false });
  });
});

// ---------- Static source-level guardrails ----------
const PANEL = read("src/components/PlantTentEnvironmentPanel.tsx");
const HOOK = read("src/hooks/usePlantTentLatestReadings.ts");
const RULES = read("src/lib/plantTentEnvironmentRules.ts");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

describe("Plant Detail · Assigned Tent Environment static safety", () => {
  it("PlantDetail mounts the panel", () => {
    expect(PLANT_DETAIL).toContain("PlantTentEnvironmentPanel");
    expect(PLANT_DETAIL).toMatch(/tentId=\{plant\.tentId\s*\?\?\s*null\}/);
  });

  it("panel renders both empty-state messages", () => {
    expect(PANEL).toContain(
      "Assign this plant to a tent to see its latest environment context.",
    );
    expect(PANEL).toContain("No sensor readings found for this tent yet.");
  });

  it("panel provides a View Tent link", () => {
    expect(PANEL).toContain("plant-tent-environment-view-tent");
    expect(PANEL).toMatch(/\/tents\//);
  });

  it("hook only reads sensor_readings (no writes)", () => {
    expect(HOOK).toMatch(/\.from\(["']sensor_readings["']\)/);
    for (const verb of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
      expect(HOOK.includes(verb)).toBe(false);
    }
  });

  it("rules + panel + hook do not touch unrelated tables or write anywhere", () => {
    const all = [PANEL, HOOK, RULES].join("\n");
    for (const verb of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
      expect(all.includes(verb)).toBe(false);
    }
    for (const t of [
      "plants",
      "tents",
      "alerts",
      "alert_events",
      "action_queue",
      "action_queue_events",
      "diary_entries",
      "watering_events",
      "feeding_events",
      "photo_events",
      "pi_ingest_idempotency_keys",
      "pi_ingest_bridge_credentials",
    ]) {
      // panel + hook + rules should never write to these. The hook only
      // reads sensor_readings; assert no .from("<table>") references either.
      expect(all).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)`));
    }
  });

  it("contains no automation / device-control / pi-ingest transport strings", () => {
    const all = [PANEL, HOOK, RULES].join("\n");
    expect(all).not.toMatch(
      /mqtt|home[\s_-]?assistant|relay|actuator|webhook|device_command|service_role|automation/i,
    );
  });
});
