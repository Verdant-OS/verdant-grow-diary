/**
 * Manual Sensor Snapshot — change context tests.
 *
 * Pure helper coverage + Daily Check post-submit integration coverage
 * (static + behavioral). Read-only derivation only. No new schema,
 * persistence, RPC, ingestion, alerts, action_queue, automation,
 * device control, or service_role.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import {
  buildManualSnapshotChangeContext,
  deriveChangeContextFromReadings,
  groupManualReadingsToSnapshots,
} from "@/lib/manualSensorSnapshotChangeContextRules";

const T1 = "2026-05-24T09:00:00Z";
const T2 = "2026-05-24T15:00:00Z";

describe("buildManualSnapshotChangeContext — pure helper", () => {
  it("compares temp, RH, VPD, CO2, soil moisture, soil EC, and pH", () => {
    const r = buildManualSnapshotChangeContext({
      previous: {
        ts: T1,
        metrics: {
          temperature_c: 24,
          humidity_pct: 55,
          vpd_kpa: 1.0,
          co2_ppm: 700,
          soil_moisture_pct: 50,
          soil_ec_ms_cm: 1.5,
          reservoir_ph: 6.0,
        },
      },
      latest: {
        ts: T2,
        metrics: {
          temperature_c: 25,
          humidity_pct: 51,
          vpd_kpa: 1.18,
          co2_ppm: 820,
          soil_moisture_pct: 46,
          soil_ec_ms_cm: 1.7,
          reservoir_ph: 5.9,
        },
      },
    });
    expect(r.firstSnapshot).toBe(false);
    const keys = r.deltas.map((d) => d.key);
    expect(keys).toEqual([
      "temperature_c",
      "humidity_pct",
      "vpd_kpa",
      "co2_ppm",
      "soil_moisture_pct",
      "soil_ec_ms_cm",
      "reservoir_ph",
    ]);
    // Temp delta is in °F (1°C ≈ 1.8°F).
    const temp = r.deltas.find((d) => d.key === "temperature_c")!;
    expect(temp.formatted).toMatch(/\+1\.8°F/);
    expect(temp.direction).toBe("up");
    expect(r.deltas.find((d) => d.key === "humidity_pct")!.direction).toBe("down");
    expect(r.deltas.find((d) => d.key === "vpd_kpa")!.formatted).toMatch(/\+0\.18 kPa/);
    expect(r.deltas.find((d) => d.key === "co2_ppm")!.formatted).toMatch(/\+120 ppm/);
  });

  it("omits missing/invalid values rather than guessing", () => {
    const r = buildManualSnapshotChangeContext({
      previous: { ts: T1, metrics: { humidity_pct: 55 } },
      latest: {
        ts: T2,
        metrics: {
          humidity_pct: 50,
          // temperature only present on latest — must be omitted.
          temperature_c: 25,
          // vpd_kpa missing on both — must be omitted.
        },
      },
    });
    expect(r.firstSnapshot).toBe(false);
    expect(r.deltas.map((d) => d.key)).toEqual(["humidity_pct"]);
  });

  it("returns firstSnapshot=true when there is no previous snapshot", () => {
    const a = buildManualSnapshotChangeContext({
      latest: { ts: T2, metrics: { humidity_pct: 50 } },
      previous: null,
    });
    expect(a.firstSnapshot).toBe(true);
    expect(a.deltas).toEqual([]);

    const b = buildManualSnapshotChangeContext({ latest: null, previous: null });
    expect(b.firstSnapshot).toBe(true);
  });

  it("is deterministic regardless of input metric ordering", () => {
    const a = buildManualSnapshotChangeContext({
      previous: { ts: T1, metrics: { co2_ppm: 700, temperature_c: 24, humidity_pct: 55 } },
      latest: { ts: T2, metrics: { humidity_pct: 51, temperature_c: 25, co2_ppm: 820 } },
    });
    const b = buildManualSnapshotChangeContext({
      previous: { ts: T1, metrics: { humidity_pct: 55, co2_ppm: 700, temperature_c: 24 } },
      latest: { ts: T2, metrics: { co2_ppm: 820, humidity_pct: 51, temperature_c: 25 } },
    });
    expect(a.deltas.map((d) => d.key)).toEqual(b.deltas.map((d) => d.key));
    expect(a.deltas.map((d) => d.formatted)).toEqual(b.deltas.map((d) => d.formatted));
  });

  it("groupManualReadingsToSnapshots drops non-manual, foreign-tent, unknown-metric, and invalid timestamps", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 400).toISOString();
    const snaps = groupManualReadingsToSnapshots(
      [
        { ts: T1, metric: "temperature_c", value: 24, source: "manual", tent_id: "t1" },
        { ts: T1, metric: "humidity_pct", value: 55, source: "manual", tent_id: "t1" },
        // ignored: live source
        { ts: T2, metric: "temperature_c", value: 99, source: "live", tent_id: "t1" },
        // ignored: foreign tent
        { ts: T2, metric: "temperature_c", value: 99, source: "manual", tent_id: "other" },
        // ignored: unknown metric
        { ts: T2, metric: "made_up_metric", value: 1, source: "manual", tent_id: "t1" },
        // ignored: far-future ts
        { ts: future, metric: "humidity_pct", value: 60, source: "manual", tent_id: "t1" },
        // ignored: invalid value
        { ts: T2, metric: "humidity_pct", value: NaN, source: "manual", tent_id: "t1" },
      ],
      { tentId: "t1" },
    );
    expect(snaps).toHaveLength(1);
    expect(snaps[0].metrics).toEqual({ temperature_c: 24, humidity_pct: 55 });
  });

  it("deriveChangeContextFromReadings returns first-snapshot for a single snapshot's worth of rows", () => {
    const r = deriveChangeContextFromReadings(
      [
        { ts: T2, metric: "temperature_c", value: 25, source: "manual", tent_id: "t1" },
        { ts: T2, metric: "humidity_pct", value: 51, source: "manual", tent_id: "t1" },
      ],
      { tentId: "t1" },
    );
    expect(r.firstSnapshot).toBe(true);
  });

  it("future or invalid timestamps do not break delta display", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 400);
    const r = buildManualSnapshotChangeContext({
      previous: { ts: "not-a-date", metrics: { humidity_pct: 55 } },
      latest: { ts: future.toISOString(), metrics: { humidity_pct: 50 } },
    });
    // ts is metadata only; helper still compares metric arrays cleanly.
    expect(r.firstSnapshot).toBe(false);
    expect(r.deltas.map((d) => d.key)).toEqual(["humidity_pct"]);
  });
});

describe("DailyCheck post-submit — change context surfacing", () => {
  beforeEach(() => vi.resetModules());

  async function renderDaily(initialUrl: string, opts: { withPrior?: boolean } = {}) {
    vi.doMock("@/hooks/use-tents", () => ({
      useTents: () => ({ data: [{ id: "tent-1", name: "Veg Tent" }], isLoading: false }),
    }));
    vi.doMock("@/hooks/use-plants", () => ({
      usePlants: () => ({
        data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
        isLoading: false,
      }),
    }));
    vi.doMock("@/hooks/useScopedGrow", () => ({
      useScopedGrow: () => ({ urlGrowId: "grow-1" }),
    }));
    vi.doMock("@/hooks/use-sensor-readings", () => ({
      useSensorReadings: () => ({
        data: opts.withPrior
          ? [
              { ts: T2, metric: "temperature_c", value: 25, source: "manual", tent_id: "tent-1" },
              { ts: T2, metric: "humidity_pct", value: 51, source: "manual", tent_id: "tent-1" },
              { ts: T1, metric: "temperature_c", value: 24, source: "manual", tent_id: "tent-1" },
              { ts: T1, metric: "humidity_pct", value: 55, source: "manual", tent_id: "tent-1" },
            ]
          : [],
      }),
    }));
    vi.doMock("@/components/QuickLog", () => ({
      default: () => <div data-testid="mock-quicklog" />,
    }));
    vi.doMock("@/components/ManualSensorReadingCard", () => ({
      default: () => <div data-testid="mock-manual-card" />,
    }));
    vi.doMock("@/components/PlantStatusStrip", () => ({ default: () => null }));
    vi.doMock("@/components/PlantAssignedTentAlertsPanel", () => ({ default: () => null }));
    vi.doMock("@/components/PlantAssignedTentActionsPanel", () => ({ default: () => null }));
    vi.doMock("@/components/DailyGrowCheckOnboardingCard", () => ({ default: () => null }));

    const DailyCheck = (await import("@/pages/DailyCheck")).default;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialUrl]}>
          <DailyCheck />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("does not render change-context block before any save", async () => {
    await renderDaily("/daily-check?plantId=plant-1&method=sensor", { withPrior: true });
    expect(screen.queryByTestId("daily-grow-check-change-context")).toBeNull();
  });

  it("renders change-context with deltas only after a successful sensor save", async () => {
    await renderDaily("/daily-check?plantId=plant-1&method=sensor", { withPrior: true });
    act(() => {
      window.dispatchEvent(
        new CustomEvent("verdant:sensor-reading-created", {
          detail: { createdAt: new Date().toISOString() },
        }),
      );
    });
    const block = await screen.findByTestId("daily-grow-check-change-context");
    expect(block.getAttribute("data-first-snapshot")).toBe("false");
    expect(
      screen.getByTestId("daily-grow-check-change-context-delta-temperature_c").textContent,
    ).toMatch(/Temp/);
    expect(
      screen.getByTestId("daily-grow-check-change-context-delta-humidity_pct").textContent,
    ).toMatch(/RH/);
  });

  it("normal QuickLog note success does NOT render change-context block", async () => {
    await renderDaily("/daily-check?plantId=plant-1", { withPrior: true });
    act(() => {
      window.dispatchEvent(
        new CustomEvent("verdant:entry-created", {
          detail: { createdAt: new Date().toISOString() },
        }),
      );
    });
    await screen.findByTestId("daily-grow-check-post-submit");
    expect(screen.queryByTestId("daily-grow-check-change-context")).toBeNull();
  });

  it("shows first-snapshot copy when no prior manual snapshot exists", async () => {
    await renderDaily("/daily-check?plantId=plant-1&method=sensor", { withPrior: false });
    act(() => {
      window.dispatchEvent(
        new CustomEvent("verdant:sensor-reading-created", {
          detail: { createdAt: new Date().toISOString() },
        }),
      );
    });
    const block = await screen.findByTestId("daily-grow-check-change-context");
    expect(block.getAttribute("data-first-snapshot")).toBe("true");
    expect(screen.getByTestId("daily-grow-check-change-context-first").textContent).toMatch(
      /First snapshot for this tent/,
    );
  });
});

describe("safety — change context adds no new writes or wording", () => {
  const rules = readFileSync(
    "src/lib/manualSensorSnapshotChangeContextRules.ts",
    "utf8",
  );
  const page = readFileSync("src/pages/DailyCheck.tsx", "utf8");

  it("no persistence, RPC, ingestion, alerts, action_queue, automation, device control, or service_role added", () => {
    expect(rules).not.toMatch(/supabase/i);
    expect(rules).not.toMatch(/from\(/);
    expect(rules).not.toMatch(/rpc\(/);
    const newBlock = page.match(/daily-grow-check-change-context[\s\S]{0,2000}/);
    expect(newBlock).not.toBeNull();
    expect(newBlock![0]).not.toMatch(/create_watering_event/);
    expect(newBlock![0]).not.toMatch(/from\(["']alerts["']\)/);
    expect(newBlock![0]).not.toMatch(/from\(["']action_queue/);
    expect(newBlock![0]).not.toMatch(/service_role/i);
  });

  it("rules copy contains no forbidden wording", () => {
    const lower = rules.toLowerCase();
    expect(lower).not.toMatch(/\bperfect\b/);
    expect(lower).not.toMatch(/\bcompleted\b/);
    expect(lower).not.toMatch(/guaranteed healthy/);
  });

  it("does not introduce a fake local checked state", () => {
    expect(rules).not.toMatch(/setChecked\(/);
    expect(rules).not.toMatch(/locallyChecked/);
  });
});
