/**
 * ManualSnapshotTimelineSection — integration: scope filtering, empty
 * state, load failure, and surface labels.
 *
 * Mocks the Supabase client so the read-only diary fetch is deterministic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import ManualSnapshotTimelineSection from "@/components/ManualSnapshotTimelineSection";

type DiaryRow = {
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  entry_at: string;
  note: string | null;
  details: unknown;
};

const ROWS: DiaryRow[] = [
  {
    id: "plant-1-snap-a",
    plant_id: "plant-1",
    tent_id: "tent-1",
    entry_at: "2026-01-01T10:00:00.000Z",
    note: null,
    details: {
      manual_sensor_snapshot: {
        source: "manual",
        temp_f: 75,
        humidity_percent: 55,
        ph: 6.0,
      },
    },
  },
  {
    id: "tent-level-b",
    plant_id: null,
    tent_id: "tent-1",
    entry_at: "2026-01-02T10:00:00.000Z",
    note: "tent reading",
    details: {
      manual_sensor_snapshot: {
        source: "manual",
        temp_f: 76,
        humidity_percent: 56,
      },
    },
  },
  {
    id: "other-tent-c",
    plant_id: "plant-9",
    tent_id: "tent-2",
    entry_at: "2026-01-03T10:00:00.000Z",
    note: null,
    details: {
      manual_sensor_snapshot: {
        source: "manual",
        temp_f: 70,
        humidity_percent: 60,
      },
    },
  },
  {
    id: "other-plant-d",
    plant_id: "plant-2",
    tent_id: "tent-1",
    entry_at: "2026-01-04T10:00:00.000Z",
    note: null,
    details: {
      manual_sensor_snapshot: {
        source: "manual",
        temp_f: 71,
        humidity_percent: 58,
      },
    },
  },
];

let nextResponse: { data: DiaryRow[] | null; error: unknown } = { data: [], error: null };
let lastFilter: { column?: string; value?: string } = {};

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery() {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (column: string, value: string) => {
      lastFilter = { column, value };
      return q;
    };
    q.order = () => q;
    q.limit = () => Promise.resolve(nextResponse);
    return q;
  }
  return {
    supabase: {
      from: () => makeQuery(),
    },
  };
});

function renderSection(props: Parameters<typeof ManualSnapshotTimelineSection>[0]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ManualSnapshotTimelineSection {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  nextResponse = { data: [], error: null };
  lastFilter = {};
});

describe("ManualSnapshotTimelineSection — plant scope", () => {
  it("renders only the plant-linked snapshot", async () => {
    nextResponse = {
      data: ROWS.filter((r) => r.plant_id === "plant-1"),
      error: null,
    };
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() =>
      expect(
        screen.getByTestId("manual-snapshot-timeline-section-list"),
      ).toBeInTheDocument(),
    );
    const cards = screen.getAllByTestId("manual-snapshot-timeline-card");
    expect(cards.map((c) => c.getAttribute("data-card-id"))).toEqual([
      "plant-1-snap-a",
    ]);
    expect(lastFilter).toEqual({ column: "plant_id", value: "plant-1" });
  });

  it("does not render snapshots from another plant", async () => {
    nextResponse = {
      data: ROWS.filter((r) => r.plant_id === "plant-2"),
      error: null,
    };
    renderSection({ scope: "plant", plantId: "plant-1" });
    // Even though the DB stub returns plant-2 rows, the pure selector
    // rejects them because their plantId !== "plant-1".
    await waitFor(() =>
      expect(
        screen.getByTestId("manual-snapshot-timeline-section-empty"),
      ).toBeInTheDocument(),
    );
  });
});

describe("ManualSnapshotTimelineSection — tent scope", () => {
  it("renders plant-linked and tent-level snapshots for the tent", async () => {
    nextResponse = {
      data: ROWS.filter((r) => r.tent_id === "tent-1"),
      error: null,
    };
    renderSection({ scope: "tent", tentId: "tent-1" });
    await waitFor(() =>
      expect(
        screen.getByTestId("manual-snapshot-timeline-section-list"),
      ).toBeInTheDocument(),
    );
    const ids = screen
      .getAllByTestId("manual-snapshot-timeline-card")
      .map((c) => c.getAttribute("data-card-id"));
    expect(ids).toContain("plant-1-snap-a");
    expect(ids).toContain("tent-level-b");
    expect(ids).toContain("other-plant-d");
    expect(ids).not.toContain("other-tent-c");
    // Sorted descending by capturedAt — newest first.
    expect(ids[0]).toBe("other-plant-d");
  });

  it("does not render snapshots from another tent", async () => {
    nextResponse = {
      data: ROWS.filter((r) => r.tent_id === "tent-2"),
      error: null,
    };
    renderSection({ scope: "tent", tentId: "tent-1" });
    await waitFor(() =>
      expect(
        screen.getByTestId("manual-snapshot-timeline-section-empty"),
      ).toBeInTheDocument(),
    );
  });
});

describe("ManualSnapshotTimelineSection — failure + empty", () => {
  it("shows a calm non-blocking notice when the read fails", async () => {
    nextResponse = { data: null, error: new Error("boom") };
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() =>
      expect(
        screen.getByTestId("manual-snapshot-timeline-section-error"),
      ).toBeInTheDocument(),
    );
    // The error notice does not throw past the boundary, and no live label
    // appears in the failure copy.
    const text = screen
      .getByTestId("manual-snapshot-timeline-section-error")
      .textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/\blive\b/);
  });

  it("renders the empty state when no manual snapshots exist", async () => {
    nextResponse = { data: [], error: null };
    renderSection({ scope: "tent", tentId: "tent-1" });
    await waitFor(() =>
      expect(
        screen.getByTestId("manual-snapshot-timeline-section-empty"),
      ).toBeInTheDocument(),
    );
  });

  it("renders a no-scope placeholder when the id is missing", () => {
    renderSection({ scope: "plant", plantId: null });
    expect(
      screen.getByTestId("manual-snapshot-timeline-section-no-scope"),
    ).toBeInTheDocument();
  });
});
