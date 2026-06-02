/**
 * QuickLog grouped timeline UX polish — rendering tests.
 *
 * Covers:
 *  - Filter chips (All/Water/Note/Environment).
 *  - Empty overall state with "Create Quick Log" button (opens sheet,
 *    submits nothing).
 *  - Empty filtered state copy.
 *  - Demo/sample entries render with explicit demo/sample labels and
 *    NEVER with the plain "Manual" badge.
 *  - Real manual entries continue to render "Manual" without "Demo".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogGroupedTimelineSection, {
  type DemoQuickLogTimelineEntry,
} from "@/components/QuickLogGroupedTimelineSection";
import type { QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";

type Row = {
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  occurred_at: string;
  event_type: string;
  source: string;
  note: string | null;
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

function renderSection(
  props: Parameters<typeof QuickLogGroupedTimelineSection>[0],
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <QuickLogGroupedTimelineSection {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  nextRows = [];
});

const PLANT = "plant-1";
const TENT = "tent-1";

function water(id: string, occurredAt: string, opts: Partial<Row> = {}): Row {
  return {
    id,
    plant_id: PLANT,
    tent_id: TENT,
    occurred_at: occurredAt,
    event_type: "watering",
    source: "manual",
    note: null,
    watering_events: { volume_ml: 500 },
    ...opts,
  };
}
function note(id: string, occurredAt: string, opts: Partial<Row> = {}): Row {
  return {
    id,
    plant_id: PLANT,
    tent_id: TENT,
    occurred_at: occurredAt,
    event_type: "observation",
    source: "manual",
    note: "Top dressed.",
    ...opts,
  };
}
function env(
  id: string,
  occurredAt: string,
  envData: {
    temperature_c?: number | null;
    humidity_pct?: number | null;
    vpd_kpa?: number | null;
  },
  opts: Partial<Row> = {},
): Row {
  return {
    id,
    plant_id: PLANT,
    tent_id: TENT,
    occurred_at: occurredAt,
    event_type: "environment",
    source: "manual",
    note: null,
    environment_events: {
      temperature_c: envData.temperature_c ?? null,
      humidity_pct: envData.humidity_pct ?? null,
      vpd_kpa: envData.vpd_kpa ?? null,
    },
    ...opts,
  };
}

// Helper to build a demo "action" entry without needing a real env card.
function demoActionEntry(
  variant: "demo" | "sample",
  kind: "water" | "note",
  id: string,
): DemoQuickLogTimelineEntry {
  const entry: QuickLogTimelineEntry = {
    kind: "action",
    occurredAt: "2026-03-15T09:00:00.000Z",
    actionSourceLabel: "Manual",
    action: {
      id,
      kind,
      source: "manual",
      plantId: PLANT,
      tentId: TENT,
      occurredAt: "2026-03-15T09:00:00.000Z",
      noteText: kind === "note" ? "demo note" : null,
      volumeMl: kind === "water" ? 250 : null,
    },
  };
  return { entry, variant };
}

describe("QuickLogGroupedTimelineSection — filter chips", () => {
  it("renders All/Water/Note/Environment chips", async () => {
    nextRows = [water("w1", "2026-03-01T10:00:00.000Z")];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() =>
      screen.getByTestId("quick-log-grouped-timeline-list"),
    );
    expect(
      screen.getByTestId("quick-log-grouped-timeline-filter-all"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("quick-log-grouped-timeline-filter-water"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("quick-log-grouped-timeline-filter-note"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("quick-log-grouped-timeline-filter-environment"),
    ).toBeInTheDocument();
    expect(
      screen
        .getByTestId("quick-log-grouped-timeline-filter-all")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("Water filter hides Note + standalone env", async () => {
    nextRows = [
      water("w1", "2026-03-01T10:00:00.000Z"),
      note("n1", "2026-03-01T11:00:00.000Z"),
      env("e1", "2026-03-01T12:00:00.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() =>
      screen.getByTestId("quick-log-grouped-timeline-list"),
    );
    fireEvent.click(
      screen.getByTestId("quick-log-grouped-timeline-filter-water"),
    );
    const cards = screen.getAllByTestId("quick-log-grouped-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-action-id")).toBe("w1");
  });

  it("Note filter hides Water + standalone env", async () => {
    nextRows = [
      water("w1", "2026-03-01T10:00:00.000Z"),
      note("n1", "2026-03-01T11:00:00.000Z"),
      env("e1", "2026-03-01T12:00:00.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() =>
      screen.getByTestId("quick-log-grouped-timeline-list"),
    );
    fireEvent.click(
      screen.getByTestId("quick-log-grouped-timeline-filter-note"),
    );
    const cards = screen.getAllByTestId("quick-log-grouped-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-action-id")).toBe("n1");
  });

  it("Environment filter shows standalone env + grouped entries", async () => {
    nextRows = [
      // Grouped pair
      water("w1", "2026-03-02T10:00:00.000Z"),
      env("eG", "2026-03-02T10:00:01.000Z", { humidity_pct: 55 }),
      // Standalone env (no pair)
      env("eS", "2026-03-02T12:00:00.000Z", { humidity_pct: 60 }),
      // Standalone note (should be hidden by env filter)
      note("nLone", "2026-03-02T13:00:00.000Z"),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() =>
      screen.getByTestId("quick-log-grouped-timeline-list"),
    );
    fireEvent.click(
      screen.getByTestId("quick-log-grouped-timeline-filter-environment"),
    );
    const cards = screen.getAllByTestId("quick-log-grouped-card");
    const kinds = cards.map((c) => c.getAttribute("data-entry-kind")).sort();
    expect(kinds).toEqual(["environment", "grouped"]);
  });

  it("All filter shows every entry kind", async () => {
    nextRows = [
      water("w1", "2026-03-03T10:00:00.000Z"),
      note("n1", "2026-03-03T11:00:00.000Z"),
      env("eS", "2026-03-03T12:00:00.000Z", { humidity_pct: 60 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() =>
      screen.getByTestId("quick-log-grouped-timeline-list"),
    );
    const cards = screen.getAllByTestId("quick-log-grouped-card");
    expect(cards.length).toBe(3);
  });
});

describe("QuickLogGroupedTimelineSection — empty states", () => {
  it("overall empty state renders text + Create Quick Log button", async () => {
    nextRows = [];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() =>
      screen.getByTestId("quick-log-grouped-timeline-empty"),
    );
    const empty = screen.getByTestId("quick-log-grouped-timeline-empty");
    expect(empty.textContent).toContain("No QuickLog entries yet.");
    const btn = screen.getByTestId("quick-log-grouped-timeline-create-button");
    expect(btn.textContent).toContain("Create Quick Log");
  });

  it("clicking Create Quick Log opens the sheet without submitting", async () => {
    nextRows = [];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() =>
      screen.getByTestId("quick-log-grouped-timeline-empty"),
    );
    fireEvent.click(
      screen.getByTestId("quick-log-grouped-timeline-create-button"),
    );
    // Sheet uses role="dialog" via Radix; just confirm something dialog-like surfaced.
    await waitFor(() => {
      const dialogs = screen.queryAllByRole("dialog");
      expect(dialogs.length).toBeGreaterThan(0);
    });
    // No success toast / no "Saved" text — opening must not submit.
    expect(screen.queryByText(/saved/i)).toBeNull();
  });

  it("filtered empty state renders the correct copy", async () => {
    nextRows = [water("w1", "2026-03-04T10:00:00.000Z")];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() =>
      screen.getByTestId("quick-log-grouped-timeline-list"),
    );
    fireEvent.click(
      screen.getByTestId("quick-log-grouped-timeline-filter-note"),
    );
    const msg = await screen.findByTestId(
      "quick-log-grouped-timeline-empty-filtered",
    );
    expect(msg.textContent).toBe("No QuickLog entries match this filter.");
  });
});

describe("QuickLogGroupedTimelineSection — source labels", () => {
  it("real manual cards render the Manual badge and no Demo badge", async () => {
    nextRows = [water("w1", "2026-03-05T10:00:00.000Z")];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() =>
      screen.getByTestId("quick-log-grouped-timeline-list"),
    );
    const badge = screen.getByTestId("quick-log-grouped-action-source");
    expect(badge.textContent).toBe("Manual");
    expect(
      screen.queryByTestId("quick-log-grouped-action-demo-source"),
    ).toBeNull();
    const card = screen.getByTestId("quick-log-grouped-card");
    expect(card.getAttribute("data-demo")).toBe("false");
  });

  it("demo entries render explicit Demo / Sample labels (never plain Manual)", async () => {
    nextRows = [];
    renderSection({
      scope: "plant",
      plantId: PLANT,
      tentId: TENT,
      demoEntries: [
        demoActionEntry("demo", "water", "demo-w"),
        demoActionEntry("sample", "note", "sample-n"),
      ],
    });
    await waitFor(() =>
      screen.getByTestId("quick-log-grouped-timeline-list"),
    );
    const demoBadges = screen.getAllByTestId(
      "quick-log-grouped-action-demo-source",
    );
    const texts = demoBadges.map((b) => b.textContent);
    expect(texts).toContain("Demo data");
    expect(texts).toContain("Sample timeline entry");
    // No plain "Manual" badge present for any of the demo cards.
    expect(
      screen.queryAllByTestId("quick-log-grouped-action-source"),
    ).toHaveLength(0);
    const cards = screen.getAllByTestId("quick-log-grouped-card");
    for (const c of cards) {
      expect(c.getAttribute("data-demo")).toBe("true");
    }
  });

  it("demo entries respect the filter chips like real entries", async () => {
    nextRows = [];
    renderSection({
      scope: "plant",
      plantId: PLANT,
      tentId: TENT,
      demoEntries: [
        demoActionEntry("demo", "water", "demo-w"),
        demoActionEntry("sample", "note", "sample-n"),
      ],
    });
    await waitFor(() =>
      screen.getByTestId("quick-log-grouped-timeline-list"),
    );
    fireEvent.click(
      screen.getByTestId("quick-log-grouped-timeline-filter-water"),
    );
    const cards = screen.getAllByTestId("quick-log-grouped-card");
    expect(cards).toHaveLength(1);
    const badge = within(cards[0]).getByTestId(
      "quick-log-grouped-action-demo-source",
    );
    expect(badge.textContent).toBe("Demo data");
  });
});
