/**
 * The live Plant Detail AI Doctor context panel (mounted inside the
 * "How this was decided" disclosure) prints the newest manual snapshot's time.
 * A snapshot dated beyond MANUAL_SNAPSHOT_FUTURE_SKEW_MS has no known age:
 * the line must say so instead of "in 1 day" (date-fns relative time).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantDetailAiDoctorContextPanel from "@/components/PlantDetailAiDoctorContextPanel";
import { buildAiDoctorLatestSnapshotLine } from "@/lib/aiDoctorLatestSnapshotLineViewModel";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      select: () => ({ eq: () => ({ data: [], error: null }) }),
    }),
    functions: { invoke: vi.fn() },
  },
}));

const sources = vi.hoisted(() => ({ timelineItems: [] as TimelineMemoryItem[] }));

vi.mock("@/hooks/useTimelineMemory", () => ({
  useTimelineMemory: () => ({ items: sources.timelineItems, isLoading: false }),
  TIMELINE_MEMORY_DEFAULT_LIMIT: 25,
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: (tentIds: string[]) => ({
    byTent: Object.fromEntries(tentIds.map((id) => [id, []])),
    statusByTent: Object.fromEntries(tentIds.map((id) => [id, "success"])),
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useRootZoneObservations", () => ({
  useRootZoneObservations: () => ({
    observations: [],
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

const TENT = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e77";
const HOUR = 3_600_000;

// Plant-level manual snapshot as it reaches the panel through the timeline.
// (Assigned-tent current rows dated in the future are already dropped by
// manualTentSensorRowsToAiDoctorContextSnapshots; the timeline path is not.)
function manualSnapshotItem(capturedAt: string): TimelineMemoryItem {
  return {
    kind: "manual_sensor_snapshot",
    key: `snap-${capturedAt}`,
    occurredAt: capturedAt,
    card: {
      id: `snap-${capturedAt}`,
      title: "Manual sensor snapshot",
      capturedAt,
      sourceLabel: "Manual",
      source: "manual",
      tentId: TENT,
      plantId: "p1",
      isTentLevel: false,
      notes: null,
      readings: [],
      severity: "ok",
      warnings: [],
      errors: [],
    },
  } as TimelineMemoryItem;
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <PlantDetailAiDoctorContextPanel
        plantId="p1"
        plant={{
          id: "p1",
          name: "Alpha",
          strain: "NL",
          stage: "veg",
          medium: "Coco",
          photo: null,
          growId: "11111111-1111-4111-8111-111111111111",
          tentId: TENT,
        }}
      />
    </MemoryRouter>,
  );
}

describe("PlantDetailAiDoctorContextPanel — future-dated latest snapshot", () => {
  beforeEach(() => {
    sources.timelineItems = [];
  });

  it("says the age is unknown instead of a relative time for a snapshot 1 day ahead", () => {
    sources.timelineItems = [manualSnapshotItem(new Date(Date.now() + 24 * HOUR).toISOString())];
    renderPanel();
    const line = screen.getByTestId("plant-ai-doctor-context-latest-snapshot");
    expect(line).toHaveTextContent(
      "Latest manual sensor snapshot: dated in the future, so its age is unknown",
    );
    expect(line.textContent).not.toMatch(/\bin\b.*\b(day|hour|minute)s?\b/);
    expect(line.textContent).not.toMatch(/\bago\b/);
  });

  it("keeps the relative age for a snapshot in the past", () => {
    sources.timelineItems = [manualSnapshotItem(new Date(Date.now() - 2 * HOUR).toISOString())];
    renderPanel();
    expect(screen.getByTestId("plant-ai-doctor-context-latest-snapshot")).toHaveTextContent(
      /Latest manual sensor snapshot: about 2 hours ago/,
    );
  });

  it("keeps the relative time for a snapshot within the 5-minute clock-skew allowance", () => {
    // +2 min is not flagged future-dated (MANUAL_SNAPSHOT_FUTURE_SKEW_MS), so
    // the line keeps date-fns relative time, unchanged from before this fix.
    sources.timelineItems = [manualSnapshotItem(new Date(Date.now() + 2 * 60_000).toISOString())];
    renderPanel();
    const line = screen.getByTestId("plant-ai-doctor-context-latest-snapshot");
    expect(line).toHaveTextContent(/Latest manual sensor snapshot: in \d+ minutes?/);
    expect(line).not.toHaveTextContent(/age is unknown/);
  });
});

describe("buildAiDoctorLatestSnapshotLine", () => {
  const NOW = Date.parse("2026-11-12T12:00:00.000Z");
  const iso = (ms: number) => new Date(ms).toISOString();

  it("returns null when there is no snapshot", () => {
    expect(buildAiDoctorLatestSnapshotLine({ manualSnapshotAt: null }, NOW)).toBeNull();
  });

  it("uses the unknown-age copy when the rules flag the newest snapshot as future-dated", () => {
    expect(
      buildAiDoctorLatestSnapshotLine(
        { manualSnapshotAt: iso(NOW + HOUR), manualSnapshotFutureDated: true },
        NOW,
      ),
    ).toBe("dated in the future, so its age is unknown");
  });

  it("keeps the relative age for a past snapshot (flag unset)", () => {
    expect(buildAiDoctorLatestSnapshotLine({ manualSnapshotAt: iso(NOW - 3 * HOUR) }, NOW)).toBe(
      "about 3 hours ago",
    );
  });

  it("keeps a relative time within the clock-skew allowance (flag unset, +2 min)", () => {
    expect(buildAiDoctorLatestSnapshotLine({ manualSnapshotAt: iso(NOW + 2 * 60_000) }, NOW)).toBe(
      "in 2 minutes",
    );
  });

  it("returns null for an unparseable timestamp rather than 'Invalid Date'", () => {
    expect(buildAiDoctorLatestSnapshotLine({ manualSnapshotAt: "not-a-date" }, NOW)).toBeNull();
  });
});
