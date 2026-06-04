/**
 * PPFD UI wiring for Plant Timeline + SensorChart selector.
 *
 * Locks:
 *  - Plant Timeline manual-snapshot card renders a valid PPFD reading
 *    using the shared `µmol` unit and the honest "Manual" source label.
 *  - Invalid / null PPFD is omitted from the readings list (never
 *    rendered as a healthy "0 µmol").
 *  - Sensors page exposes PPFD as a selectable metric chip so growers
 *    can open the PPFD SensorChart (which already owns its own legend /
 *    tooltip / CSV export via the shared meta table).
 *  - Static safety: PPFD short unit appears only once in JSX
 *    presenters (no duplicated PPFD metadata tables in components).
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ManualSnapshotTimelineCard from "@/components/ManualSnapshotTimelineCard";
import {
  buildManualSnapshotTimelineCard,
  MANUAL_SNAPSHOT_SOURCE_LABEL,
  type ManualSnapshotRecord,
} from "@/lib/manualSensorSnapshotViewModel";
import { validateManualSnapshot } from "@/lib/manualSensorSnapshotRules";
import Sensors from "@/pages/Sensors";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

function buildRecord(overrides: { ppfd?: unknown } = {}): ManualSnapshotRecord {
  const validation = validateManualSnapshot({
    airTemp: "24",
    airTempUnit: "C",
    humidityPct: "55",
    ppfd: overrides.ppfd as string | number | null | undefined,
  });
  return {
    id: "snap-1",
    capturedAt: "2026-06-04T12:00:00.000Z",
    tentId: "tent-1",
    plantId: "plant-1",
    notes: null,
    validation,
  };
}

describe("Plant Timeline manual snapshot — PPFD wiring", () => {
  it("renders a valid PPFD reading with the shared µmol unit", () => {
    const card = buildManualSnapshotTimelineCard(buildRecord({ ppfd: 720 }));
    render(<ManualSnapshotTimelineCard card={card} />);
    const list = screen.getByTestId("manual-snapshot-timeline-card-readings");
    const ppfdRow = within(list)
      .getAllByTestId("manual-snapshot-timeline-card-reading")
      .find((el) => el.getAttribute("data-field") === "ppfd");
    expect(ppfdRow).toBeTruthy();
    expect(ppfdRow?.textContent ?? "").toMatch(/PPFD/);
    expect(ppfdRow?.textContent ?? "").toMatch(/720\s*µmol/);
  });

  it("omits PPFD row when value is missing / null (never shows 0 µmol as healthy)", () => {
    const card = buildManualSnapshotTimelineCard(buildRecord({ ppfd: null }));
    render(<ManualSnapshotTimelineCard card={card} />);
    const rows = screen.queryAllByTestId("manual-snapshot-timeline-card-reading");
    const ppfdRow = rows.find((el) => el.getAttribute("data-field") === "ppfd");
    expect(ppfdRow).toBeUndefined();
  });

  it("keeps the Manual source badge honest even when PPFD is present", () => {
    const card = buildManualSnapshotTimelineCard(buildRecord({ ppfd: 500 }));
    render(<ManualSnapshotTimelineCard card={card} />);
    const badge = screen.getByTestId("manual-snapshot-timeline-card-source");
    expect(badge.textContent).toContain(MANUAL_SNAPSHOT_SOURCE_LABEL);
    expect(badge.textContent?.toLowerCase()).not.toMatch(/live|ecowitt|connected|synced/);
  });
});

describe("Sensors page — PPFD metric chip", () => {
  it("exposes a PPFD chip alongside the other environment metrics", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Sensors />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // The PPFD section heading should be present in the per-metric grid.
    const headings = screen.getAllByRole("heading", { level: 3 });
    const ppfdHeading = headings.find((h) => /^\s*PPFD\s*$/.test(h.textContent ?? ""));
    expect(ppfdHeading).toBeTruthy();
  });
});

describe("static safety: PPFD JSX wiring", () => {
  const card = readFileSync(
    resolve(process.cwd(), "src/components/ManualSnapshotTimelineCard.tsx"),
    "utf8",
  );
  const sensorChart = readFileSync(
    resolve(process.cwd(), "src/components/SensorChart.tsx"),
    "utf8",
  );
  const sensorsPage = readFileSync(
    resolve(process.cwd(), "src/pages/Sensors.tsx"),
    "utf8",
  );

  it("ManualSnapshotTimelineCard does not inline a PPFD unit table", () => {
    expect(card).not.toMatch(/µmol\/m²\/s/);
    expect(card).not.toMatch(/PPFD_MAX/);
    expect(card).not.toMatch(/ppfd\s*:\s*['"]µmol/);
  });

  it("SensorChart does not estimate PPFD from lux/watts/brightness", () => {
    const lower = sensorChart.toLowerCase();
    expect(lower).not.toMatch(/\blux\b/);
    expect(lower).not.toMatch(/wattage/);
    expect(lower).not.toMatch(/brightness/);
  });

  it("SensorChart does not duplicate PPFD metadata (unit / max / decimals) in JSX", () => {
    expect(sensorChart).not.toMatch(/ppfd\s*:\s*['"]µmol/);
    expect(sensorChart).not.toMatch(/PPFD_MAX/);
    expect(sensorChart).not.toMatch(/2500/);
  });

  it("Sensors page does not introduce a fake-live PPFD fallback label", () => {
    const lower = sensorsPage.toLowerCase();
    expect(lower).not.toMatch(/ppfd[^\n]*?live/);
    expect(lower).not.toMatch(/estimated.*ppfd/);
  });

  for (const term of ["service_role", "device_command", "actuator", "autopilot", "_executed"]) {
    it(`no presenter file references \`${term}\``, () => {
      expect(card).not.toContain(term);
      expect(sensorChart).not.toContain(term);
      expect(sensorsPage).not.toContain(term);
    });
  }
});
