/**
 * QuickLogGroupedTimelineSection — rendering tests with a mocked Supabase
 * client. Verifies grouped vs standalone rendering, source labels, scope
 * isolation, severity preservation, and deterministic ordering.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";

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

function renderSection(props: Parameters<typeof QuickLogGroupedTimelineSection>[0]) {
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
  envData: { temperature_c?: number | null; humidity_pct?: number | null; vpd_kpa?: number | null },
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

describe("QuickLogGroupedTimelineSection — plant scope", () => {
  it("renders a grouped Water + manual environment snapshot card", async () => {
    nextRows = [
      water("w1", "2026-02-01T10:00:00.000Z"),
      env("e1", "2026-02-01T10:00:01.000Z", { temperature_c: 24, humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-grouped-timeline-list")).toBeInTheDocument(),
    );
    const cards = screen.getAllByTestId("quick-log-grouped-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-entry-kind")).toBe("grouped");
    expect(cards[0].getAttribute("data-action-id")).toBe("w1");
    expect(cards[0].getAttribute("data-environment-id")).toBe("e1");
    // Manual source label visible.
    expect(screen.getByTestId("quick-log-grouped-action-source").textContent).toBe(
      "Manual",
    );
    // Inner snapshot card present (env not standalone).
    expect(screen.getAllByTestId("manual-snapshot-timeline-card")).toHaveLength(1);
  });

  it("renders a grouped Note + manual environment snapshot card", async () => {
    nextRows = [
      note("n1", "2026-02-02T10:00:00.000Z"),
      env("e2", "2026-02-02T10:00:00.500Z", { humidity_pct: 60 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-grouped-timeline-list")).toBeInTheDocument(),
    );
    const cards = screen.getAllByTestId("quick-log-grouped-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-entry-kind")).toBe("grouped");
    expect(screen.getByTestId("quick-log-grouped-action-title").textContent).toBe(
      "Note",
    );
  });

  it("grouped env event does not also render standalone", async () => {
    nextRows = [
      water("w1", "2026-02-03T10:00:00.000Z"),
      env("e1", "2026-02-03T10:00:01.000Z", { temperature_c: 24, humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    // exactly one snapshot card rendered (inside grouped), no extra standalone env entry.
    expect(screen.getAllByTestId("manual-snapshot-timeline-card")).toHaveLength(1);
    const kinds = screen
      .getAllByTestId("quick-log-grouped-card")
      .map((c) => c.getAttribute("data-entry-kind"));
    expect(kinds).toEqual(["grouped"]);
  });

  it("standalone env event still renders when no action pair exists", async () => {
    nextRows = [env("eX", "2026-02-04T10:00:00.000Z", { humidity_pct: 55 })];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const cards = screen.getAllByTestId("quick-log-grouped-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-entry-kind")).toBe("environment");
  });

  it("ambiguous pairings render as separate events", async () => {
    // Two waters and one env equidistant → ambiguous → no grouping.
    nextRows = [
      water("w1", "2026-02-05T10:00:00.000Z"),
      water("w2", "2026-02-05T10:00:02.000Z"),
      env("e1", "2026-02-05T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const kinds = screen
      .getAllByTestId("quick-log-grouped-card")
      .map((c) => c.getAttribute("data-entry-kind"))
      .sort();
    expect(kinds).toEqual(["action", "action", "environment"]);
  });

  it("another plant's env event does not group with this plant's action", async () => {
    nextRows = [
      water("w1", "2026-02-06T10:00:00.000Z"),
      // Different plant_id, same tent — must NOT group with plant-scoped action.
      {
        ...env("eOther", "2026-02-06T10:00:01.000Z", { humidity_pct: 55 }),
        plant_id: "plant-2",
      },
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    // The other-plant env row gets scope-filtered out entirely; action stays standalone.
    const cards = screen.getAllByTestId("quick-log-grouped-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-entry-kind")).toBe("action");
  });

  it("preserves warning telemetry severity inside grouped card", async () => {
    nextRows = [
      water("w1", "2026-02-07T10:00:00.000Z"),
      // Temperature_c is given in °C field but value 75 (out-of-range C) → invalid
      env("e1", "2026-02-07T10:00:01.000Z", { temperature_c: 75, humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const inner = screen.getByTestId("manual-snapshot-timeline-card");
    expect(["warning", "invalid"]).toContain(inner.getAttribute("data-severity"));
  });

  it("never shows live/synced/connected/imported wording", async () => {
    nextRows = [
      water("w1", "2026-02-08T10:00:00.000Z"),
      env("e1", "2026-02-08T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const text =
      screen.getByTestId("quick-log-grouped-timeline-section").textContent?.toLowerCase() ??
      "";
    expect(text).not.toMatch(/\blive\b/);
    expect(text).not.toMatch(/\bsynced\b/);
    expect(text).not.toMatch(/\bconnected\b/);
    expect(text).not.toMatch(/\bimported\b/);
  });

  it("orders entries deterministically newest-first by action occurredAt", async () => {
    nextRows = [
      water("w-old", "2026-02-09T08:00:00.000Z"),
      env("e-mid", "2026-02-09T09:00:00.000Z", { humidity_pct: 60 }),
      water("w-new", "2026-02-09T10:00:00.000Z"),
      env("e-new", "2026-02-09T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "plant", plantId: PLANT, tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const cards = screen.getAllByTestId("quick-log-grouped-card");
    // Expect: grouped(w-new,e-new) first, then standalone env-mid, then standalone w-old.
    expect(cards[0].getAttribute("data-occurred-at")).toBe("2026-02-09T10:00:00.000Z");
    expect(cards[cards.length - 1].getAttribute("data-occurred-at")).toBe(
      "2026-02-09T08:00:00.000Z",
    );
  });
});

describe("QuickLogGroupedTimelineSection — tent scope", () => {
  it("renders grouped QuickLog events for that tent", async () => {
    nextRows = [
      water("w1", "2026-02-10T10:00:00.000Z"),
      env("e1", "2026-02-10T10:00:01.000Z", { humidity_pct: 55 }),
    ];
    renderSection({ scope: "tent", tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const cards = screen.getAllByTestId("quick-log-grouped-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-entry-kind")).toBe("grouped");
  });

  it("different-tent events do not group (rows from a different tent are excluded by scope)", async () => {
    nextRows = [
      water("w1", "2026-02-11T10:00:00.000Z"),
      // server query would already filter, but adapter is defensive — env on
      // a different tent must never group with our action.
      {
        ...env("eOther", "2026-02-11T10:00:01.000Z", { humidity_pct: 55 }),
        tent_id: "tent-2",
      },
    ];
    renderSection({ scope: "tent", tentId: TENT });
    await waitFor(() => screen.getByTestId("quick-log-grouped-timeline-list"));
    const cards = screen.getAllByTestId("quick-log-grouped-card");
    // Only the water remains in this tent's scope; the other-tent env is filtered out.
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-entry-kind")).toBe("action");
  });
});
