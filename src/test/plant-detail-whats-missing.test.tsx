import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantDetailWhatsMissing from "@/components/PlantDetailWhatsMissing";
import fs from "fs";
import path from "path";
import {
  buildPlantDetailWhatsMissing,
  type PlantDetailWhatsMissingInput,
} from "@/lib/plantDetailWhatsMissing";

const activityQuery = vi.hoisted(() => ({
  data: [] as unknown,
  isLoading: false,
  isError: false,
}));

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: () => activityQuery,
}));

const savedStatusNote = {
  id: "saved-status-note",
  plant_id: "p-1",
  entry_at: "2026-09-03T02:00:00.000Z",
  note: "Response check: Same.",
  details: { event_type: "observation", response: "same" },
};

describe("PlantDetailWhatsMissing saved activity", () => {
  beforeEach(() => {
    activityQuery.data = [];
    activityQuery.isLoading = false;
    activityQuery.isError = false;
  });

  function renderPanel() {
    return render(
      <MemoryRouter>
        <PlantDetailWhatsMissing plantId="p-1" growId="g-1" stage="veg" hasPlantPhoto />
      </MemoryRouter>,
    );
  }

  it.each([
    ["Same status", savedStatusNote],
    ["legacy note without an event kind", { ...savedStatusNote, details: null }],
  ])("counts a saved %s as activity without fabricating watering or feeding", (_name, row) => {
    activityQuery.data = [row];
    renderPanel();
    expect(screen.queryByText("No timeline entries yet")).not.toBeInTheDocument();
    expect(screen.getByText("No recent watering or feed note")).toBeInTheDocument();
    expect(screen.getByText("No sensor snapshot")).toBeInTheDocument();
  });

  it("distinguishes a successful empty history from unavailable activity", () => {
    renderPanel();
    expect(screen.getByText("No timeline entries yet")).toBeInTheDocument();
    expect(screen.queryByTestId("plant-detail-whats-missing-unavailable")).toBeNull();
  });

  it.each([
    ["non-array", { rows: [] }],
    ["null", null],
    ["one bad element after a valid note", [savedStatusNote, null]],
    ["missing row id", [{ ...savedStatusNote, id: null }]],
    ["invalid date", [{ ...savedStatusNote, entry_at: "invalid" }]],
    ["malformed details", [{ ...savedStatusNote, details: "{" }]],
    ["another plant", [{ ...savedStatusNote, plant_id: "p-other" }]],
  ])("shows unavailable for %s instead of claiming empty or complete history", (_name, data) => {
    activityQuery.data = data;
    renderPanel();
    expect(screen.getByTestId("plant-detail-whats-missing-unavailable")).toHaveTextContent(
      /activity is unavailable/i,
    );
    expect(screen.queryByTestId("plant-detail-whats-missing-list")).toBeNull();
    expect(screen.queryByTestId("plant-detail-whats-missing-solid")).toBeNull();
  });

  it.each([{ data: [] }, { data: [savedStatusNote] }])(
    "shows unavailable after a failed read, even with cached data",
    ({ data }) => {
      activityQuery.data = data;
      activityQuery.isError = true;
      renderPanel();
      expect(screen.getByTestId("plant-detail-whats-missing-unavailable")).toBeInTheDocument();
      expect(screen.queryByTestId("plant-detail-whats-missing-list")).toBeNull();
    },
  );

  it("shows loading without claiming no activity", () => {
    activityQuery.data = undefined;
    activityQuery.isLoading = true;
    renderPanel();
    expect(screen.getByTestId("plant-detail-whats-missing-loading")).toBeInTheDocument();
    expect(screen.queryByText("No timeline entries yet")).not.toBeInTheDocument();
  });
});

function makeInput(
  overrides: Partial<PlantDetailWhatsMissingInput> = {},
): PlantDetailWhatsMissingInput {
  return {
    plantId: "p-1",
    hasTimelineEntries: true,
    stage: "veg",
    hasRecentPhoto: true,
    hasSensorSnapshot: true,
    hasRecentWateringOrFeed: true,
    ...overrides,
  };
}

describe("buildPlantDetailWhatsMissing", () => {
  it("returns empty array when everything is present", () => {
    const result = buildPlantDetailWhatsMissing(makeInput());
    expect(result).toEqual([]);
  });

  it("shows no timeline prompt when hasTimelineEntries is false", () => {
    const result = buildPlantDetailWhatsMissing(makeInput({ hasTimelineEntries: false }));
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].kind).toBe("no_timeline");
    expect(result[0].title).toBe("No timeline entries yet");
    expect(result[0].description).toMatch(/Logging helps/);
    expect(result[0].cta?.kind).toBe("quicklog");
    expect(result[0].cta?.label).toBe("Add Quick Log");
    expect(result[0].cta?.event).toBe("open-quicklog");
  });

  it("shows stage unknown prompt when stage is null", () => {
    const result = buildPlantDetailWhatsMissing(
      makeInput({ stage: null, hasTimelineEntries: true }),
    );
    const kinds = result.map((r) => r.kind);
    expect(kinds).toContain("stage_unknown");
    const prompt = result.find((r) => r.kind === "stage_unknown")!;
    expect(prompt.title).toBe("Stage unknown");
    expect(prompt.description).toMatch(/Set the plant stage/);
    expect(prompt.cta).toBeUndefined();
  });

  it("shows stage unknown prompt when stage is empty string", () => {
    const result = buildPlantDetailWhatsMissing(makeInput({ stage: "", hasTimelineEntries: true }));
    expect(result.map((r) => r.kind)).toContain("stage_unknown");
  });

  it("shows stage unknown prompt when stage is 'unknown'", () => {
    const result = buildPlantDetailWhatsMissing(
      makeInput({ stage: "unknown", hasTimelineEntries: true }),
    );
    expect(result.map((r) => r.kind)).toContain("stage_unknown");
  });

  it("shows no recent photo prompt when hasRecentPhoto is false", () => {
    const result = buildPlantDetailWhatsMissing(makeInput({ hasRecentPhoto: false }));
    expect(result.map((r) => r.kind)).toContain("no_recent_photo");
    const prompt = result.find((r) => r.kind === "no_recent_photo")!;
    expect(prompt.title).toBe("No recent photo");
    expect(prompt.description).toMatch(/Photos help compare/);
    expect(prompt.cta?.kind).toBe("upload_photo");
    expect(prompt.cta?.label).toBe("Upload photo");
    expect(prompt.cta?.href).toBeUndefined();
    expect(prompt.cta?.event).toBe("open-quicklog");
    expect(prompt.cta?.eventPayload).toEqual({
      plantId: "p-1",
      growId: null,
      activityId: "photo",
    });
  });

  it("includes grow and plant context in the photo Quick Log handoff", () => {
    const result = buildPlantDetailWhatsMissing(
      makeInput({ hasRecentPhoto: false, growId: "g-1" }),
    );
    const prompt = result.find((r) => r.kind === "no_recent_photo")!;
    expect(prompt.cta!.eventPayload).toEqual({
      plantId: "p-1",
      growId: "g-1",
      activityId: "photo",
    });
  });

  it("shows no sensor snapshot prompt when hasSensorSnapshot is false", () => {
    const result = buildPlantDetailWhatsMissing(makeInput({ hasSensorSnapshot: false }));
    expect(result.map((r) => r.kind)).toContain("no_sensor_snapshot");
    const prompt = result.find((r) => r.kind === "no_sensor_snapshot")!;
    expect(prompt.title).toBe("No sensor snapshot");
    expect(prompt.description).toMatch(/Sensor snapshots help separate/);
    expect(prompt.cta?.kind).toBe("sensor_snapshot");
    expect(prompt.cta?.label).toBe("Add manual sensor snapshot");
  });

  it("includes growId in sensor_snapshot href when provided", () => {
    const result = buildPlantDetailWhatsMissing(
      makeInput({ hasSensorSnapshot: false, growId: "g-1" }),
    );
    const prompt = result.find((r) => r.kind === "no_sensor_snapshot")!;
    expect(prompt.cta!.href).toBe("/sensors?growId=g-1");
  });

  it("shows no recent watering/feed prompt when hasRecentWateringOrFeed is false", () => {
    const result = buildPlantDetailWhatsMissing(makeInput({ hasRecentWateringOrFeed: false }));
    expect(result.map((r) => r.kind)).toContain("no_recent_watering_or_feed");
    const prompt = result.find((r) => r.kind === "no_recent_watering_or_feed")!;
    expect(prompt.title).toBe("No recent watering or feed note");
    expect(prompt.description).toMatch(/Watering and feeding logs/);
    expect(prompt.cta?.kind).toBe("quicklog");
  });

  it("limits prompts to 3 maximum", () => {
    const result = buildPlantDetailWhatsMissing(
      makeInput({
        hasTimelineEntries: false,
        stage: null,
        hasRecentPhoto: false,
        hasSensorSnapshot: false,
        hasRecentWateringOrFeed: false,
      }),
    );
    expect(result.length).toBe(3);
    // Priority order: no_timeline, stage_unknown, no_recent_photo
    expect(result[0].kind).toBe("no_timeline");
    expect(result[1].kind).toBe("stage_unknown");
    expect(result[2].kind).toBe("no_recent_photo");
  });

  it("uses deterministic priority order (no timeline > stage > photo > sensor > watering)", () => {
    const result = buildPlantDetailWhatsMissing(
      makeInput({
        hasTimelineEntries: false,
        stage: null,
        hasRecentPhoto: false,
        hasSensorSnapshot: false,
        hasRecentWateringOrFeed: false,
      }),
    );
    expect(result.map((r) => r.kind)).toEqual(["no_timeline", "stage_unknown", "no_recent_photo"]);
  });

  it("falls back to lower priority when higher ones are satisfied", () => {
    const result = buildPlantDetailWhatsMissing(
      makeInput({
        hasTimelineEntries: true,
        stage: "veg",
        hasRecentPhoto: false,
        hasSensorSnapshot: false,
        hasRecentWateringOrFeed: false,
      }),
    );
    expect(result.map((r) => r.kind)).toEqual([
      "no_recent_photo",
      "no_sensor_snapshot",
      "no_recent_watering_or_feed",
    ]);
  });

  it("never returns more than 3 prompts", () => {
    const result = buildPlantDetailWhatsMissing(
      makeInput({
        hasTimelineEntries: false,
        stage: null,
        hasRecentPhoto: false,
        hasSensorSnapshot: false,
        hasRecentWateringOrFeed: false,
      }),
    );
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("handles null plantId gracefully (still evaluates conditions)", () => {
    const result = buildPlantDetailWhatsMissing(
      makeInput({
        plantId: null,
        hasTimelineEntries: false,
      }),
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].kind).toBe("no_timeline");
  });

  it("does not expose internal IDs in visible fields", () => {
    const result = buildPlantDetailWhatsMissing(
      makeInput({ hasTimelineEntries: false, plantId: "secret-id-123" }),
    );
    for (const r of result) {
      expect(r.title).not.toMatch(/secret-id-123/);
      expect(r.description).not.toMatch(/secret-id-123/);
    }
  });

  it("does not expose storage paths or tokens", () => {
    const result = buildPlantDetailWhatsMissing(makeInput({ hasRecentPhoto: false }));
    for (const r of result) {
      expect(r.description).not.toMatch(/storage|bucket|path|token|key/i);
    }
  });

  it("static safety: no service_role reference", () => {
    const src = JSON.stringify(buildPlantDetailWhatsMissing.toString());
    expect(src).not.toMatch(/service_role/);
  });

  it("static safety: no action_queue reference", () => {
    const src = JSON.stringify(buildPlantDetailWhatsMissing.toString());
    expect(src).not.toMatch(/action_queue/);
  });

  it("static safety: no supabase reference", () => {
    const src = JSON.stringify(buildPlantDetailWhatsMissing.toString());
    expect(src).not.toMatch(/supabase/);
  });

  it("static safety: no automation or device control language", () => {
    const src = JSON.stringify(buildPlantDetailWhatsMissing.toString());
    expect(src).not.toMatch(/automation|device.control|trigger|schedule/i);
  });
});

describe("PlantDetailWhatsMissing component static safety", () => {
  it("component file does not contain service_role", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailWhatsMissing.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/service_role/);
  });

  it("component file does not contain action_queue", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailWhatsMissing.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/action_queue/);
  });

  it("component file does not contain supabase writes", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailWhatsMissing.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/supabase\s*\.\s*from/);
    expect(src).not.toMatch(/supabase\s*\.\s*insert/);
    expect(src).not.toMatch(/supabase\s*\.\s*update/);
    expect(src).not.toMatch(/supabase\s*\.\s*delete/);
    expect(src).not.toMatch(/supabase\s*\.\s*rpc/);
  });

  it("component file does not contain functions.invoke", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailWhatsMissing.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/functions\.invoke/);
  });

  it("component file does not contain automation/device-control language", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailWhatsMissing.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/automation|device.control|trigger|schedule/i);
  });

  it("component file does not contain calendar/notification/email language", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/PlantDetailWhatsMissing.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/calendar_events|notification|email|reminder|mail/i);
  });
});
