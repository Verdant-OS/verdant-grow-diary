/**
 * QA 2026-09-24: the plant page's watering history showed a morning watering
 * as "8:26 AM UTC" — the grower's own log, in a zone they are not in. The
 * absolute label now uses the viewer's zone (named, so it stays unambiguous);
 * the zone is injectable for deterministic tests.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import WateringCadenceHistoryStrip from "@/components/WateringCadenceHistoryStrip";
import {
  buildWateringCadenceHistory,
  formatWateringCadenceAbsolute,
} from "@/lib/wateringCadenceHistoryRules";

const WATERED_AT = "2026-09-24T08:26:00.000Z";
const NOW = Date.parse("2026-09-24T12:00:00.000Z");

const ledgerRows = vi.hoisted(() => [
  {
    id: "w-2",
    kind: "watering" as const,
    occurredAt: "2026-09-24T08:26:00.000Z",
    volumeMl: 500,
    sourceLabel: "Manual",
  },
  {
    id: "w-1",
    kind: "watering" as const,
    occurredAt: "2026-09-22T19:05:00.000Z",
    volumeMl: 400,
    sourceLabel: "Manual",
  },
]);

vi.mock("@/hooks/useTentIrrigationLedger", () => ({
  useTentIrrigationLedger: () => ({
    rows: ledgerRows,
    isLoading: false,
    isError: false,
    isOlderError: false,
  }),
}));

function vm(timeZone?: string) {
  return buildWateringCadenceHistory(
    ledgerRows.map((r) => ({ ...r })),
    timeZone === undefined ? { now: NOW } : { now: NOW, timeZone },
  );
}

describe("watering history absolute times", () => {
  it("QA repro: 08:26Z reads as the grower's local morning time, not UTC", () => {
    const model = vm("America/New_York");
    expect(model.lastWatering?.absoluteLabel).toBe("Sep 24, 4:26 AM EDT");
    expect(model.recentWaterings.map((r) => r.absoluteLabel)).toEqual([
      "Sep 24, 4:26 AM EDT",
      "Sep 22, 3:05 PM EDT",
    ]);
  });

  it("names the zone, so a UTC viewer still sees an unambiguous label", () => {
    expect(vm("UTC").lastWatering?.absoluteLabel).toBe("Sep 24, 8:26 AM UTC");
    expect(vm("Europe/Berlin").lastWatering?.absoluteLabel).toBe("Sep 24, 10:26 AM GMT+2");
  });

  it("defaults to the viewer's own zone", () => {
    const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(vm().lastWatering?.absoluteLabel).toBe(
      formatWateringCadenceAbsolute(WATERED_AT, viewerZone),
    );
  });

  it("an unknown zone name falls back to the viewer's zone instead of throwing", () => {
    expect(formatWateringCadenceAbsolute(WATERED_AT, "Not/AZone")).toBe(
      formatWateringCadenceAbsolute(WATERED_AT),
    );
    expect(formatWateringCadenceAbsolute("not a date")).toBe("not a date");
  });

  it("the strip renders the label inside a machine-readable <time>", () => {
    render(<WateringCadenceHistoryStrip tentId="tent-a" plantId="plant-a" />);
    const absolute = screen.getByTestId("watering-cadence-history-last-absolute");
    const time = absolute.querySelector("time");
    expect(time).not.toBeNull();
    expect(time?.getAttribute("dateTime")).toBe(WATERED_AT);
    expect(time?.textContent).toBe(formatWateringCadenceAbsolute(WATERED_AT));
  });
});
