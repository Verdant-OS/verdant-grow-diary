/**
 * Visibility test: action-only QuickLog timeline entries (no attached
 * environment snapshot) must render a neutral "No sensor snapshot
 * attached" note. Grouped entries (with a snapshot) must not.
 *
 * Scope: presenter visibility only.
 *  - No writes, no Supabase mutations, no AI calls, no Action Queue.
 *  - Never display demo/manual/csv data as live; this only asserts the
 *    neutral missing-snapshot label, not any fabricated reading.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";
import { MISSING_SNAPSHOT_NOTE_LABEL } from "@/lib/manualSensorSnapshotViewModel";

type Row = {
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  occurred_at: string;
  event_type: string;
  source: string;
  note: string | null;
  is_deleted?: boolean;
  watering_events?: { volume_ml: number | null } | null;
  environment_events?: {
    temperature_c: number | null;
    humidity_pct: number | null;
    vpd_kpa: number | null;
  } | null;
};

let nextRows: Row[] = [];

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery() {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.in = () => q;
    q.or = () => q;
    q.order = () => q;
    q.limit = () => Promise.resolve({ data: nextRows, error: null });
    return q;
  }
  return { supabase: { from: () => makeQuery() } };
});

const PLANT = "plant-1";
const TENT = "tent-1";

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <QuickLogGroupedTimelineSection
        scope="plant"
        plantId={PLANT}
        tentId={TENT}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  nextRows = [];
});

describe("QuickLog timeline — missing snapshot visibility", () => {
  it("renders neutral missing-snapshot note on action-only entries", async () => {
    nextRows = [
      {
        id: "w1",
        plant_id: PLANT,
        tent_id: TENT,
        occurred_at: "2026-03-01T10:00:00.000Z",
        event_type: "watering",
        source: "manual",
        note: null,
        watering_events: { volume_ml: 500 },
      },
    ];
    renderSection();
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const card = screen.getByTestId("quick-log-grouped-card");
    expect(card.getAttribute("data-entry-kind")).toBe("action");
    expect(card.getAttribute("data-has-snapshot")).toBe("false");
    const note = screen.getByTestId("quick-log-grouped-action-missing-snapshot");
    expect(note.textContent).toBe(MISSING_SNAPSHOT_NOTE_LABEL);
  });

  it("does not render missing-snapshot note on grouped entries that have a snapshot", async () => {
    nextRows = [
      {
        id: "w1",
        plant_id: PLANT,
        tent_id: TENT,
        occurred_at: "2026-03-02T10:00:00.000Z",
        event_type: "watering",
        source: "manual",
        note: null,
        watering_events: { volume_ml: 500 },
      },
      {
        id: "e1",
        plant_id: PLANT,
        tent_id: TENT,
        occurred_at: "2026-03-02T10:00:01.000Z",
        event_type: "environment",
        source: "manual",
        note: null,
        environment_events: {
          temperature_c: 24,
          humidity_pct: 55,
          vpd_kpa: null,
        },
      },
    ];
    renderSection();
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const card = screen.getByTestId("quick-log-grouped-card");
    expect(card.getAttribute("data-entry-kind")).toBe("grouped");
    expect(screen.queryByTestId("quick-log-grouped-action-missing-snapshot"))
      .toBeNull();
    // Snapshot card itself remains visible.
    expect(screen.getByTestId("manual-snapshot-timeline-card")).toBeTruthy();
  });

  it("missing-snapshot copy is neutral — never live/synced/connected/imported", () => {
    expect(MISSING_SNAPSHOT_NOTE_LABEL.toLowerCase()).not.toMatch(/\blive\b/);
    expect(MISSING_SNAPSHOT_NOTE_LABEL.toLowerCase()).not.toMatch(/\bsynced\b/);
    expect(MISSING_SNAPSHOT_NOTE_LABEL.toLowerCase()).not.toMatch(/\bconnected\b/);
    expect(MISSING_SNAPSHOT_NOTE_LABEL.toLowerCase()).not.toMatch(/\bimported\b/);
    // Never expose raw_payload in UI copy.
    expect(MISSING_SNAPSHOT_NOTE_LABEL.toLowerCase()).not.toMatch(/raw_payload/);
  });
});
