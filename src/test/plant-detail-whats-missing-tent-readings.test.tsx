/**
 * D2 (docs/specs/ai-doctor-readiness-single-summary.md §10): when the plant has no
 * snapshot of its own but its assigned tent has current readings, the What's Missing
 * prompt says so instead of implying no environment evidence exists. Loading, failed
 * or absent tent reads keep the plant-diary wording.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import {
  buildPlantDetailWhatsMissing,
  NO_PLANT_SNAPSHOT_TENT_READINGS_PROMPT,
  type PlantDetailWhatsMissingInput,
} from "@/lib/plantDetailWhatsMissing";

const activityQuery = vi.hoisted(() => ({
  data: [] as unknown,
  isLoading: false,
  isError: false,
}));
const tentRead = vi.hoisted(() => ({
  status: "success" as "loading" | "error" | "refresh_error" | "success",
  rows: [] as unknown[],
  calls: [] as unknown[][],
}));

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: () => activityQuery,
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: (tentIds: string[], limit: number, sources: readonly string[]) => {
    tentRead.calls.push([tentIds, limit, sources]);
    const byTent: Record<string, unknown[]> = {};
    const statusByTent: Record<string, string> = {};
    for (const id of tentIds) {
      byTent[id] = tentRead.status === "success" ? tentRead.rows : [];
      statusByTent[id] = tentRead.status;
    }
    return { byTent, statusByTent, refetch: vi.fn() };
  },
}));

import PlantDetailWhatsMissing from "@/components/PlantDetailWhatsMissing";
import {
  AI_DOCTOR_CURRENT_SENSOR_ROW_CAP,
  AI_DOCTOR_CURRENT_SENSOR_SOURCES,
  AI_DOCTOR_MANUAL_SENSOR_SOURCES,
} from "@/lib/aiDoctorCurrentSensorSnapshotRules";

const TENT_ID = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e77";
const PLANT_DIARY_DESCRIPTION =
  "Sensor snapshots help separate environment issues from plant issues. This check uses the plant diary only and does not include the tent's Recent Sensor Readings.";

/** Same shape the readiness-card tests use for a usable live tent reading. */
function liveRow() {
  return {
    metric: "temperature_c",
    value: 25,
    captured_at: new Date(Date.now() - 60_000).toISOString(),
    source: "live",
    raw_payload: {
      vendor: "ecowitt_windows_testbench",
      metadata: {
        reported_verdant_source: "live",
        raw_payload: {
          stationtype: "GW2000A_V3.2.4",
          model: "GW2000A",
          dateutc: "2026-07-17 19:30:00",
        },
      },
    },
  };
}

const savedNote = {
  id: "n-1",
  plant_id: "p-1",
  entry_at: "2026-09-03T02:00:00.000Z",
  note: "Checked leaves.",
  details: { event_type: "observation" },
};

const baseInput: PlantDetailWhatsMissingInput = {
  plantId: "p-1",
  growId: "g-1",
  hasTimelineEntries: true,
  stage: "veg",
  hasRecentPhoto: true,
  hasSensorSnapshot: false,
  hasRecentWateringOrFeed: true,
};

function sensorPrompt(input: PlantDetailWhatsMissingInput) {
  return buildPlantDetailWhatsMissing(input).find((p) => p.kind === "no_sensor_snapshot");
}

describe("buildPlantDetailWhatsMissing tent readings (rules)", () => {
  it("uses the tent-readings copy only when tent readings are present", () => {
    const prompt = sensorPrompt({ ...baseInput, tentCurrentReadings: "present" });
    expect(prompt?.title).toBe(NO_PLANT_SNAPSHOT_TENT_READINGS_PROMPT.title);
    expect(prompt?.description).toBe(NO_PLANT_SNAPSHOT_TENT_READINGS_PROMPT.description);
    expect(prompt?.title).toBe("No plant snapshot");
    expect(prompt?.description).toBe("Tent readings are used in AI review.");
  });

  it.each([["absent"], ["unknown"], [null], [undefined]] as const)(
    "keeps the plant-diary copy when tent readings are %s",
    (value) => {
      const prompt = sensorPrompt({ ...baseInput, tentCurrentReadings: value });
      expect(prompt?.title).toBe("No sensor snapshot");
      expect(prompt?.description).toBe(PLANT_DIARY_DESCRIPTION);
    },
  );

  it("keeps the add-snapshot action with the tent-readings copy", () => {
    const prompt = sensorPrompt({ ...baseInput, tentCurrentReadings: "present" });
    expect(prompt?.cta?.kind).toBe("sensor_snapshot");
  });

  it("does not add a sensor prompt when the plant already has a snapshot", () => {
    const prompt = sensorPrompt({
      ...baseInput,
      hasSensorSnapshot: true,
      tentCurrentReadings: "present",
    });
    expect(prompt).toBeUndefined();
  });

  it("is deterministic and does not mutate its input", () => {
    const input = Object.freeze({ ...baseInput, tentCurrentReadings: "present" as const });
    expect(buildPlantDetailWhatsMissing(input)).toEqual(buildPlantDetailWhatsMissing(input));
  });
});

describe("PlantDetailWhatsMissing tent readings (component)", () => {
  beforeEach(() => {
    activityQuery.data = [savedNote];
    activityQuery.isLoading = false;
    activityQuery.isError = false;
    tentRead.status = "success";
    tentRead.rows = [];
    tentRead.calls = [];
  });

  function renderPanel(tentId?: string | null) {
    return render(
      <MemoryRouter>
        <PlantDetailWhatsMissing
          plantId="p-1"
          growId="g-1"
          stage="veg"
          hasPlantPhoto
          tentId={tentId}
        />
      </MemoryRouter>,
    );
  }

  it("says tent readings are used when the assigned tent has a current reading", async () => {
    tentRead.rows = [liveRow()];
    renderPanel(TENT_ID);
    expect(await screen.findByText("No plant snapshot")).toBeInTheDocument();
    expect(screen.getByText("Tent readings are used in AI review.")).toBeInTheDocument();
    expect(screen.queryByText("No sensor snapshot")).toBeNull();
  });

  it("reads the tent with the same windows the AI Doctor readiness card uses", () => {
    renderPanel(TENT_ID);
    expect(tentRead.calls).toContainEqual([
      [TENT_ID],
      AI_DOCTOR_CURRENT_SENSOR_ROW_CAP,
      AI_DOCTOR_CURRENT_SENSOR_SOURCES,
    ]);
    expect(tentRead.calls).toContainEqual([
      [TENT_ID],
      AI_DOCTOR_CURRENT_SENSOR_ROW_CAP,
      AI_DOCTOR_MANUAL_SENSOR_SOURCES,
    ]);
  });

  it.each([["loading"], ["error"], ["refresh_error"]] as const)(
    "keeps the plant-diary copy while the tent read is %s",
    (status) => {
      tentRead.status = status;
      tentRead.rows = [liveRow()];
      renderPanel(TENT_ID);
      expect(screen.getByText("No sensor snapshot")).toBeInTheDocument();
      expect(screen.queryByText("Tent readings are used in AI review.")).toBeNull();
    },
  );

  it("keeps the plant-diary copy when the tent has no current reading", () => {
    renderPanel(TENT_ID);
    expect(screen.getByText("No sensor snapshot")).toBeInTheDocument();
    expect(screen.queryByText("No plant snapshot")).toBeNull();
  });

  it.each([[undefined], [null], ["not-a-uuid"]])(
    "does not read any tent without a valid tent id (%s)",
    (tentId) => {
      renderPanel(tentId);
      expect(tentRead.calls).toEqual([]);
      expect(screen.getByText("No sensor snapshot")).toBeInTheDocument();
    },
  );
});
