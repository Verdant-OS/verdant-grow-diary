/**
 * Manual Sensor Snapshot Advisor — guardrail tests.
 *
 * Verifies:
 *  - pure advisor warns on suspicious values but never blocks save
 *  - derived VPD helper appears when temp+RH present and VPD missing
 *  - Daily Check sensor-method path renders advisor warnings + preserves
 *    plant/tent context
 *  - plant without a tent still shows the safe no-tent message
 *  - no new schema/persistence/RPC/automation, no forbidden wording
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { evaluateManualSnapshotAdvisor } from "@/lib/manualSensorSnapshotAdvisorRules";

describe("evaluateManualSnapshotAdvisor — pure guardrails", () => {
  it("accepts normal temp/RH/VPD without warnings", () => {
    const r = evaluateManualSnapshotAdvisor({
      airTempF: 76,
      humidityPct: 55,
      vpdKpa: 1.2,
    });
    expect(r.warnings).toEqual([]);
    expect(r.derivedVpdKpa).toBeNull();
  });

  it("warns when temp looks like Celsius entered into the °F field", () => {
    const r = evaluateManualSnapshotAdvisor({ airTempF: 24 });
    expect(r.warnings.join(" ")).toMatch(/Celsius/i);
    expect(r.warnings.join(" ")).toMatch(/Double-check/);
  });

  it("warns on very low and very high humidity", () => {
    expect(
      evaluateManualSnapshotAdvisor({ humidityPct: 10 }).warnings.join(" "),
    ).toMatch(/unusually low/i);
    expect(
      evaluateManualSnapshotAdvisor({ humidityPct: 95 }).warnings.join(" "),
    ).toMatch(/unusually high/i);
  });

  it("warns on unrealistic VPD", () => {
    expect(
      evaluateManualSnapshotAdvisor({ vpdKpa: 4 }).warnings.join(" "),
    ).toMatch(/VPD/i);
    expect(
      evaluateManualSnapshotAdvisor({ vpdKpa: 0 }).warnings.join(" "),
    ).toMatch(/VPD/i);
  });

  it("derives VPD when temp+RH present and VPD missing", () => {
    const r = evaluateManualSnapshotAdvisor({ airTempF: 77, humidityPct: 55 });
    expect(r.derivedVpdKpa).not.toBeNull();
    expect(r.derivedVpdKpa!).toBeGreaterThan(1);
    expect(r.derivedVpdKpa!).toBeLessThan(2);
  });

  it("warns on CO2 below 300 ppm or above 2000 ppm", () => {
    expect(
      evaluateManualSnapshotAdvisor({ co2Ppm: 200 }).warnings.join(" "),
    ).toMatch(/CO/);
    expect(
      evaluateManualSnapshotAdvisor({ co2Ppm: 2500 }).warnings.join(" "),
    ).toMatch(/CO/);
    expect(evaluateManualSnapshotAdvisor({ co2Ppm: 800 }).warnings).toEqual([]);
  });

  it("warns on soil moisture stuck at 0 or 100", () => {
    expect(
      evaluateManualSnapshotAdvisor({ soilMoisturePct: 0 }).warnings.join(" "),
    ).toMatch(/stuck/i);
    expect(
      evaluateManualSnapshotAdvisor({ soilMoisturePct: 100 }).warnings.join(" "),
    ).toMatch(/stuck/i);
    expect(
      evaluateManualSnapshotAdvisor({ soilMoisturePct: 45 }).warnings,
    ).toEqual([]);
  });

  it("warns when soil EC likely entered in µS/cm instead of mS/cm", () => {
    expect(
      evaluateManualSnapshotAdvisor({ soilEcMsCm: 1500 }).warnings.join(" "),
    ).toMatch(/µS\/cm/);
    expect(
      evaluateManualSnapshotAdvisor({ soilEcMsCm: 2.0 }).warnings,
    ).toEqual([]);
  });

  it("warns on reservoir pH outside realistic range", () => {
    expect(
      evaluateManualSnapshotAdvisor({ reservoirPh: 2 }).warnings.join(" "),
    ).toMatch(/pH/);
    expect(
      evaluateManualSnapshotAdvisor({ reservoirPh: 9 }).warnings.join(" "),
    ).toMatch(/pH/);
    expect(evaluateManualSnapshotAdvisor({ reservoirPh: 6.0 }).warnings).toEqual([]);
  });

  it("never uses forbidden wording", () => {
    const all: string[] = [];
    for (const input of [
      { airTempF: 20 },
      { humidityPct: 5 },
      { humidityPct: 99 },
      { vpdKpa: 5 },
      { co2Ppm: 100 },
      { co2Ppm: 3000 },
      { soilMoisturePct: 0 },
      { soilEcMsCm: 1200 },
      { reservoirPh: 2 },
    ]) {
      all.push(...evaluateManualSnapshotAdvisor(input).warnings);
    }
    const joined = all.join(" ").toLowerCase();
    expect(joined).not.toMatch(/perfect/);
    expect(joined).not.toMatch(/completed/);
    expect(joined).not.toMatch(/guaranteed healthy/);
  });
});

describe("ManualSensorReadingCard — advisor + derived VPD in UI", () => {
  beforeEach(() => vi.resetModules());

  function renderCard(props: { tents?: { id: string; name: string }[] } = {}) {
    const ManualSensorReadingCard = require("@/components/ManualSensorReadingCard").default;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ManualSensorReadingCard
            tents={props.tents ?? [{ id: "tent-1", name: "Veg Tent" }]}
            defaultTentId="tent-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("renders the advisor Celsius-in-°F warning without blocking the save button only on warnings", () => {
    renderCard();
    const tempInput = screen.getByLabelText(/Air temp/i);
    fireEvent.change(tempInput, { target: { value: "24" } });
    const rhInput = screen.getByLabelText(/Humidity/i);
    fireEvent.change(rhInput, { target: { value: "55" } });
    const advisor = screen.getByTestId("manual-reading-advisor-warnings");
    expect(advisor.textContent).toMatch(/Celsius/);
    // save remains enabled — warnings do not block
    const save = screen.getByTestId("manual-reading-save") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
  });

  it("shows the derived VPD helper when temp + RH present and VPD blank", () => {
    renderCard();
    fireEvent.change(screen.getByLabelText(/Air temp/i), { target: { value: "77" } });
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "55" } });
    expect(screen.getByTestId("manual-reading-derived-vpd").textContent).toMatch(
      /Derived VPD/,
    );
  });

  it("clearly labels the snapshot source as manual", () => {
    renderCard();
    expect(screen.getByTestId("manual-reading-helper").textContent).toMatch(
      /manual snapshot/i,
    );
  });
});

describe("Daily Check sensor path — context preservation & no-tent guard", () => {
  beforeEach(() => vi.resetModules());

  it("preserves plant/tent context when launched with method=sensor", async () => {
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

    const DailyCheck = (await import("@/pages/DailyCheck")).default;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/daily-check?plantId=plant-1&method=sensor"]}>
          <DailyCheck />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // The ManualSensorReadingCard mounts on the sensor step with the
    // plant's assigned tent already selected.
    expect(await screen.findByTestId("manual-sensor-reading-card")).toBeTruthy();
    const tentLabel = screen.getByText(/Saving to:/i);
    expect(tentLabel.textContent).toMatch(/Veg Tent/);
  });

  it("plant without a tent shows the safe no-tent guard instead of silently picking one", async () => {
    vi.doMock("@/hooks/use-tents", () => ({
      useTents: () => ({ data: [{ id: "tent-1", name: "Veg Tent" }], isLoading: false }),
    }));
    vi.doMock("@/hooks/use-plants", () => ({
      usePlants: () => ({
        data: [{ id: "plant-2", name: "Untented", tent_id: null, grow_id: "grow-1" }],
        isLoading: false,
      }),
    }));
    vi.doMock("@/hooks/useScopedGrow", () => ({
      useScopedGrow: () => ({ urlGrowId: "grow-1" }),
    }));

    const DailyCheck = (await import("@/pages/DailyCheck")).default;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/daily-check?plantId=plant-2&method=sensor"]}>
          <DailyCheck />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Existing guard copy must surface; manual card must NOT mount.
    expect(await screen.findByText(/tent/i)).toBeTruthy();
    expect(screen.queryByTestId("manual-sensor-reading-card")).toBeNull();
  });
});

describe("safety — advisor + card make no new writes or schema changes", () => {
  const advisor = readFileSync("src/lib/manualSensorSnapshotAdvisorRules.ts", "utf8");
  const card = readFileSync("src/components/ManualSensorReadingCard.tsx", "utf8");
  const all = advisor + "\n" + card;

  it("no persistence, RPC, ingestion, alerts, action_queue, automation, device control, or service_role added", () => {
    expect(advisor).not.toMatch(/supabase/i);
    expect(advisor).not.toMatch(/from\(/);
    expect(advisor).not.toMatch(/rpc\(/);
    expect(all).not.toMatch(/create_watering_event/);
    expect(all).not.toMatch(/from\(["']alerts["']\)/);
    expect(all).not.toMatch(/from\(["']action_queue/);
    expect(all).not.toMatch(/ai-coach/);
    expect(all).not.toMatch(/service_role/i);
    expect(advisor).not.toMatch(/checked/i);
  });

  it("advisor copy contains no forbidden wording", () => {
    const lower = advisor.toLowerCase();
    expect(lower).not.toMatch(/perfect/);
    expect(lower).not.toMatch(/completed/);
    expect(lower).not.toMatch(/guaranteed healthy/);
  });
});
