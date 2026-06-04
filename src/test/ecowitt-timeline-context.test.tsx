/**
 * EcoWitt timeline context — pure view-model + presenter tests.
 *
 * Validates that EcoWitt sensor_readings link to the nearest diary entry
 * inside the configured window, never bleed across tents/grows, prefer
 * plant-matched rows when relevant, and render an honest Fresh/Stale/
 * Invalid chip — never "Live VPD".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";

import {
  buildEcowittTimelineContext,
  ECOWITT_TIMELINE_DEFAULT_WINDOW_MINUTES,
} from "@/lib/ecowittTimelineContextViewModel";
import { EcowittTimelineSnapshotChip } from "@/components/EcowittTimelineSnapshotChip";

const GROW = "g0000000-0000-0000-0000-000000000001";
const GROW_OTHER = "g0000000-0000-0000-0000-000000000099";
const TENT = "t0000000-0000-0000-0000-000000000001";
const TENT_OTHER = "t0000000-0000-0000-0000-000000000099";
const PLANT = "p0000000-0000-0000-0000-000000000001";

const NOW = new Date("2026-06-04T12:30:00Z");
const ENTRY_AT = "2026-06-04T12:20:00Z";
const FRESH_AT = "2026-06-04T12:18:00Z"; // 2 min from entry, fresh vs NOW
const FAR_AT = "2026-06-04T09:00:00Z"; // 200 min away from entry
const STALE_AT = "2026-06-04T11:30:00Z"; // 50 min from NOW → stale (>30)

function freshPayload(captured = "2026-06-04T12:18:00Z") {
  return {
    vendor: "ecowitt",
    temp1f: 77,
    humidity1: 55,
    soilmoisture1: 40,
    co2: 800,
    dateutc: captured.replace("T", " ").replace("Z", ""),
  };
}

const baseEntry = {
  id: "d1",
  grow_id: GROW,
  tent_id: TENT,
  plant_id: PLANT,
  occurred_at: ENTRY_AT,
};

describe("buildEcowittTimelineContext", () => {
  it("links a reading to the nearest diary entry inside the window", () => {
    const out = buildEcowittTimelineContext({
      diaryEntries: [baseEntry],
      sensorReadings: [
        {
          id: "r1",
          tent_id: TENT,
          plant_id: PLANT,
          source: "ecowitt",
          captured_at: FRESH_AT,
          raw_payload: freshPayload(FRESH_AT),
        },
      ],
      growId: GROW,
      tentId: TENT,
      now: NOW,
    });
    expect(out[0].snapshot?.hasReading).toBe(true);
    expect(out[0].matchAgeMinutes).toBeLessThanOrEqual(5);
  });

  it("does not link a reading outside the time window", () => {
    const out = buildEcowittTimelineContext({
      diaryEntries: [baseEntry],
      sensorReadings: [
        {
          id: "r1",
          tent_id: TENT,
          source: "ecowitt",
          captured_at: FAR_AT,
          raw_payload: freshPayload(FAR_AT),
        },
      ],
      growId: GROW,
      tentId: TENT,
      windowMinutes: 30,
      now: NOW,
    });
    expect(out[0].snapshot).toBeNull();
    expect(out[0].matchAgeMinutes).toBeNull();
  });

  it("never links another tent's reading", () => {
    const out = buildEcowittTimelineContext({
      diaryEntries: [baseEntry],
      sensorReadings: [
        {
          id: "r1",
          tent_id: TENT_OTHER,
          source: "ecowitt",
          captured_at: FRESH_AT,
          raw_payload: freshPayload(FRESH_AT),
        },
      ],
      growId: GROW,
      tentId: TENT,
      now: NOW,
    });
    expect(out[0].snapshot).toBeNull();
  });

  it("never links across grows when grow_id disagrees", () => {
    const out = buildEcowittTimelineContext({
      diaryEntries: [{ ...baseEntry, grow_id: GROW_OTHER }],
      sensorReadings: [
        {
          id: "r1",
          tent_id: TENT,
          source: "ecowitt",
          captured_at: FRESH_AT,
          raw_payload: freshPayload(FRESH_AT),
        },
      ],
      growId: GROW,
      tentId: TENT,
      now: NOW,
    });
    expect(out[0].snapshot).toBeNull();
  });

  it("prefers a plant-matched reading when relevant", () => {
    const out = buildEcowittTimelineContext({
      diaryEntries: [baseEntry],
      sensorReadings: [
        {
          id: "r-nonplant",
          tent_id: TENT,
          plant_id: null,
          source: "ecowitt",
          captured_at: "2026-06-04T12:19:30Z", // closer in time
          raw_payload: freshPayload("2026-06-04T12:19:30Z"),
        },
        {
          id: "r-plant",
          tent_id: TENT,
          plant_id: PLANT,
          source: "ecowitt",
          captured_at: "2026-06-04T12:15:00Z", // farther but plant-matched
          raw_payload: freshPayload("2026-06-04T12:15:00Z"),
        },
      ],
      growId: GROW,
      tentId: TENT,
      plantId: PLANT,
      now: NOW,
    });
    expect(out[0].snapshot?.hasReading).toBe(true);
    // The plant-matched row (4 min away) wins over the closer non-plant row.
    expect(out[0].matchAgeMinutes).toBeGreaterThanOrEqual(4);
    expect(out[0].matchAgeMinutes).toBeLessThanOrEqual(6);
  });
});

describe("EcowittTimelineSnapshotChip presenter", () => {
  it("renders a chip when a matching fresh snapshot exists", () => {
    const [ctx] = buildEcowittTimelineContext({
      diaryEntries: [baseEntry],
      sensorReadings: [
        {
          id: "r1",
          tent_id: TENT,
          source: "ecowitt",
          captured_at: FRESH_AT,
          raw_payload: freshPayload(FRESH_AT),
        },
      ],
      growId: GROW,
      tentId: TENT,
      now: NOW,
    });
    const { getByTestId, container } = render(
      <EcowittTimelineSnapshotChip diaryEntryId="d1" snapshot={ctx.snapshot} />,
    );
    expect(getByTestId("ecowitt-timeline-chip-d1")).toBeTruthy();
    expect(getByTestId("ecowitt-timeline-chip-freshness-d1").textContent).toBe(
      "Fresh",
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Derived VPD");
    expect(text).not.toMatch(/Live VPD|VPD Live/i);
  });

  it("renders nothing when no snapshot matched", () => {
    const { container } = render(
      <EcowittTimelineSnapshotChip diaryEntryId="d1" snapshot={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows Stale when the matched reading aged past freshness", () => {
    const [ctx] = buildEcowittTimelineContext({
      diaryEntries: [baseEntry],
      sensorReadings: [
        {
          id: "r1",
          tent_id: TENT,
          source: "ecowitt",
          captured_at: STALE_AT,
          raw_payload: freshPayload(STALE_AT),
        },
      ],
      growId: GROW,
      tentId: TENT,
      windowMinutes: 120,
      now: NOW,
    });
    const { getByTestId } = render(
      <EcowittTimelineSnapshotChip diaryEntryId="d1" snapshot={ctx.snapshot} />,
    );
    expect(getByTestId("ecowitt-timeline-chip-freshness-d1").textContent).toBe(
      "Stale",
    );
  });

  it("shows Invalid for a suspicious reading", () => {
    const [ctx] = buildEcowittTimelineContext({
      diaryEntries: [baseEntry],
      sensorReadings: [
        {
          id: "r1",
          tent_id: TENT,
          source: "ecowitt",
          captured_at: FRESH_AT,
          raw_payload: {
            vendor: "ecowitt",
            temp1f: 200, // implausible
            humidity1: 250, // out of range
            dateutc: FRESH_AT.replace("T", " ").replace("Z", ""),
          },
        },
      ],
      growId: GROW,
      tentId: TENT,
      now: NOW,
    });
    const { getByTestId, container } = render(
      <EcowittTimelineSnapshotChip diaryEntryId="d1" snapshot={ctx.snapshot} />,
    );
    expect(getByTestId("ecowitt-timeline-chip-freshness-d1").textContent).toMatch(
      /Invalid|Unavailable/,
    );
    expect(container.textContent ?? "").not.toMatch(/Live VPD|VPD Live/i);
  });

  it("ECOWITT_TIMELINE_DEFAULT_WINDOW_MINUTES is a positive number", () => {
    expect(ECOWITT_TIMELINE_DEFAULT_WINDOW_MINUTES).toBeGreaterThan(0);
  });
});

describe("EcoWitt timeline static safety", () => {
  const files = [
    "src/lib/ecowittTimelineContextViewModel.ts",
    "src/components/EcowittTimelineSnapshotChip.tsx",
  ];

  it("does not contain Live VPD / device control / SwitchBot / service_role strings", () => {
    for (const f of files) {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      expect(src).not.toMatch(/Live VPD|VPD Live/i);
      expect(src.toLowerCase()).not.toContain("switchbot");
      expect(src).not.toMatch(/service_role/);
      expect(src.toLowerCase()).not.toMatch(/turn[_ ]?on|turn[_ ]?off/);
      expect(src).not.toMatch(/from\(\s*['"]alerts['"]/);
      expect(src).not.toMatch(/from\(\s*['"]action_queue['"]/);
    }
  });
});
