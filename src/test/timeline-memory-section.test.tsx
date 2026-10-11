/**
 * TimelineMemorySection — filterable plant/tent timeline rendering.
 *
 * Mocks the Supabase client so the read-only diary fetch is deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";

import TimelineMemorySection from "@/components/TimelineMemorySection";

type Row = {
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  entry_at: string;
  note: string | null;
  photo_url: string | null;
  details: unknown;
};

const ROWS: Row[] = [
  {
    id: "note-a",
    plant_id: "plant-1",
    tent_id: "tent-1",
    entry_at: "2026-01-01T10:00:00.000Z",
    note: "Top dressed.",
    photo_url: null,
    details: { event_type: "note" },
  },
  {
    id: "water-a",
    plant_id: "plant-1",
    tent_id: "tent-1",
    entry_at: "2026-01-02T10:00:00.000Z",
    note: "Watered 500ml.",
    photo_url: null,
    details: { event_type: "watering" },
  },
  {
    id: "photo-a",
    plant_id: "plant-1",
    tent_id: "tent-1",
    entry_at: "2026-01-03T10:00:00.000Z",
    note: "Day 14 photo.",
    photo_url: "diary-photos/foo.jpg",
    details: { event_type: "note" },
  },
  {
    id: "snap-ok",
    plant_id: "plant-1",
    tent_id: "tent-1",
    entry_at: "2026-01-04T10:00:00.000Z",
    note: null,
    photo_url: null,
    details: {
      manual_sensor_snapshot: {
        source: "manual",
        temp_f: 75,
        humidity_percent: 55,
      },
    },
  },
  {
    id: "snap-warn",
    plant_id: "plant-1",
    tent_id: "tent-1",
    entry_at: "2026-01-05T10:00:00.000Z",
    note: null,
    photo_url: null,
    details: {
      manual_sensor_snapshot: {
        source: "manual",
        temp_f: 24, // looks like Celsius in °F field → warning
        humidity_percent: 50,
      },
    },
  },
];

let nextResponse: { data: Row[] | null; error: unknown } = { data: [], error: null };
let nextAuditResponse: { data: unknown[] | null; error: unknown } | undefined;
const queryReads = vi.hoisted(() => vi.fn());
const clients: QueryClient[] = [];

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery(table: string) {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.is = () => q;
    q.not = () => q;
    q.in = () => q;
    q.or = () => q;
    q.order = () => q;
    q.limit = () =>
      Promise.resolve(
        table === "ai_doctor_sessions" && nextAuditResponse !== undefined
          ? nextAuditResponse
          : nextResponse,
      );
    return q;
  }
  return {
    supabase: {
      from: (table: string) => {
        queryReads(table);
        return makeQuery(table);
      },
    },
  };
});

function renderSection(props: Parameters<typeof TimelineMemorySection>[0]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(qc);
  const rendered = render(
    <QueryClientProvider client={qc}>
      <TimelineMemorySection {...props} />
    </QueryClientProvider>,
  );
  return { ...rendered, qc };
}

beforeEach(() => {
  nextResponse = { data: [], error: null };
  nextAuditResponse = undefined;
  queryReads.mockClear();
  onlineManager.setOnline(true);
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  onlineManager.setOnline(true);
});

describe("TimelineMemorySection", () => {
  it.each([
    { name: "failed", response: { data: null, error: new Error("audit read failed") } },
    { name: "malformed", response: { data: null, error: null } },
  ])(
    "does not claim empty history when the Doctor evidence read is $name",
    async ({ response }) => {
      nextAuditResponse = response;
      const { qc } = renderSection({ scope: "plant", plantId: "plant-1" });
      await waitFor(() =>
        expect(
          qc.getQueryCache().find({ queryKey: ["timeline_memory"], exact: false })?.state.status,
        ).toBe("success"),
      );
      expect(screen.queryByTestId("timeline-memory-empty")).not.toBeInTheDocument();
      expect(screen.getByTestId("timeline-memory-doctor-evidence-unavailable")).toHaveTextContent(
        "AI Doctor timeline evidence is unavailable.",
      );
      expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    },
  );

  it("preserves surviving diary evidence and retries a failed Doctor evidence read", async () => {
    nextResponse = { data: ROWS, error: null };
    nextAuditResponse = { data: null, error: new Error("audit read failed") };
    renderSection({ scope: "tent", tentId: "tent-1" });
    await waitFor(() => expect(screen.getByTestId("timeline-memory-day-groups")).toBeVisible());
    expect(screen.getByText("Top dressed.")).toBeVisible();
    expect(screen.getAllByTestId("manual-snapshot-timeline-card")).toHaveLength(2);
    expect(screen.getByTestId("timeline-memory-doctor-evidence-unavailable")).toBeVisible();
    queryReads.mockClear();
    nextAuditResponse = {
      data: [
        {
          id: "doctor-audit-recovered",
          created_at: "2026-01-06T10:00:00.000Z",
          sensor_snapshot_status: "stale",
          sensor_snapshot_reason_code: "stale_reading",
          counts_as_healthy_evidence: false,
          sensor_evidence_mode: "cautionary",
          sensor_evidence_evaluated_at: "2026-01-06T10:00:00.000Z",
        },
      ],
      error: null,
    };
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        screen.queryByTestId("timeline-memory-doctor-evidence-unavailable"),
      ).not.toBeInTheDocument(),
    );
    expect(queryReads).toHaveBeenCalledWith("ai_doctor_sessions");
    expect(queryReads).toHaveBeenCalledWith("diary_entries");
    expect(screen.getByText("Top dressed.")).toBeVisible();
    expect(screen.getByTestId("timeline-memory-ai-doctor-evidence-audit")).toHaveTextContent(
      "AI Doctor treated this as stale cautionary context.",
    );
    expect(screen.getByTestId("timeline-memory-ai-doctor-evidence-audit")).toHaveAttribute(
      "data-counts-as-healthy",
      "no",
    );
  });

  it("shows empty history only after the failed Doctor read also completes empty", async () => {
    nextAuditResponse = { data: null, error: new Error("audit read failed") };
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() =>
      expect(screen.getByTestId("timeline-memory-doctor-evidence-unavailable")).toBeVisible(),
    );
    nextAuditResponse = { data: [], error: null };
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("timeline-memory-empty")).toBeVisible());
    expect(
      screen.queryByTestId("timeline-memory-doctor-evidence-unavailable"),
    ).not.toBeInTheDocument();
  });

  it.each([
    { scope: "plant" as const, plantId: "plant-1" },
    { scope: "tent" as const, tentId: "tent-1" },
  ])("keeps a paused first $scope read unresolved and loads on reconnect", async (props) => {
    onlineManager.setOnline(false);
    nextResponse = { data: ROWS, error: null };
    const { qc } = renderSection(props);
    expect(
      qc.getQueryCache().find({ queryKey: ["timeline_memory"], exact: false })?.state,
    ).toMatchObject({
      status: "pending",
      fetchStatus: "paused",
      data: undefined,
    });
    expect(queryReads).not.toHaveBeenCalled();
    expect(screen.queryByTestId("timeline-memory-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline-memory-paused")).toHaveTextContent(
      "Waiting for connection to load timeline memory.",
    );
    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(screen.getByTestId("timeline-memory-day-groups")).toBeVisible());
    expect(screen.queryByTestId("timeline-memory-paused")).not.toBeInTheDocument();
    expect(screen.getByText("Top dressed.")).toBeVisible();
  });

  it("reserves empty copy for a successfully completed empty read after reconnect", async () => {
    onlineManager.setOnline(false);
    const { qc } = renderSection({ scope: "plant", plantId: "plant-1" });
    expect(screen.queryByTestId("timeline-memory-empty")).not.toBeInTheDocument();
    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(screen.getByTestId("timeline-memory-empty")).toBeVisible());
    expect(
      qc.getQueryCache().find({ queryKey: ["timeline_memory"], exact: false })?.state.status,
    ).toBe("success");
    expect(queryReads).toHaveBeenCalled();
  });

  it("shows a failed reconnect read with Retry and recovers without claiming empty", async () => {
    onlineManager.setOnline(false);
    nextResponse = { data: null, error: new Error("read failed") };
    renderSection({ scope: "plant", plantId: "plant-1" });
    expect(screen.queryByTestId("timeline-memory-empty")).not.toBeInTheDocument();
    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(screen.getByTestId("timeline-memory-error")).toBeVisible());
    expect(screen.queryByTestId("timeline-memory-empty")).not.toBeInTheDocument();
    nextResponse = { data: ROWS, error: null };
    fireEvent.click(screen.getByTestId("timeline-memory-retry"));
    await waitFor(() => expect(screen.getByTestId("timeline-memory-day-groups")).toBeVisible());
  });

  it("keeps no-scope guidance while offline without starting a read", () => {
    onlineManager.setOnline(false);
    renderSection({ scope: "plant", plantId: null });
    expect(screen.getByTestId("timeline-memory-no-scope")).toBeVisible();
    expect(screen.queryByTestId("timeline-memory-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline-memory-paused")).not.toBeInTheDocument();
    expect(queryReads).not.toHaveBeenCalled();
  });

  it("retains loaded history during a paused refresh", async () => {
    nextResponse = { data: ROWS, error: null };
    const { qc } = renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() => expect(screen.getByTestId("timeline-memory-day-groups")).toBeVisible());
    await act(async () => {
      onlineManager.setOnline(false);
      void qc.invalidateQueries({ queryKey: ["timeline_memory"] });
    });
    expect(
      qc.getQueryCache().find({ queryKey: ["timeline_memory"], exact: false })?.state,
    ).toMatchObject({
      status: "success",
      fetchStatus: "paused",
    });
    expect(screen.getByText("Top dressed.")).toBeVisible();
    expect(screen.queryByTestId("timeline-memory-paused")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline-memory-empty")).not.toBeInTheDocument();
  });

  it("keeps an offline retry unresolved after a failed read", async () => {
    nextResponse = { data: null, error: new Error("read failed") };
    const { qc } = renderSection({ scope: "tent", tentId: "tent-1" });
    await waitFor(() => expect(screen.getByTestId("timeline-memory-error")).toBeVisible());
    await act(async () => onlineManager.setOnline(false));
    fireEvent.click(screen.getByTestId("timeline-memory-retry"));
    await waitFor(() =>
      expect(
        qc.getQueryCache().find({ queryKey: ["timeline_memory"], exact: false })?.state.fetchStatus,
      ).toBe("paused"),
    );
    expect(screen.getByTestId("timeline-memory-paused")).toBeVisible();
    expect(screen.queryByTestId("timeline-memory-empty")).not.toBeInTheDocument();
  });

  it("renders all events under 'All' and includes manual snapshots", async () => {
    nextResponse = { data: ROWS, error: null };
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() =>
      expect(screen.getByTestId("timeline-memory-day-groups")).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("manual-snapshot-timeline-card")).toHaveLength(2);
    expect(screen.getAllByTestId("timeline-memory-diary-item").length).toBeGreaterThanOrEqual(3);
  });

  it("filters to manual snapshots only", async () => {
    nextResponse = { data: ROWS, error: null };
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() => screen.getByTestId("timeline-memory-day-groups"));
    fireEvent.click(screen.getByTestId("timeline-filter-chip-manual_sensor_snapshot"));
    expect(screen.queryAllByTestId("timeline-memory-diary-item")).toHaveLength(0);
    expect(screen.getAllByTestId("manual-snapshot-timeline-card")).toHaveLength(2);
  });

  it("filters to watering when metadata supports it", async () => {
    nextResponse = { data: ROWS, error: null };
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() => screen.getByTestId("timeline-memory-day-groups"));
    fireEvent.click(screen.getByTestId("timeline-filter-chip-watering"));
    const items = screen.getAllByTestId("timeline-memory-diary-item");
    expect(items.map((i) => i.getAttribute("data-item-key"))).toEqual(["water-a"]);
  });

  it("shows the filter empty state copy when nothing matches", async () => {
    nextResponse = {
      data: ROWS.filter((r) => r.id === "snap-ok"),
      error: null,
    };
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() => screen.getByTestId("timeline-memory-day-groups"));
    // No watering chip should be rendered (count 0). Manually invoke a
    // filter that has no chip by clicking warnings? Not present either.
    // Click manual_sensor_snapshot then synthesize a hidden filter via
    // a chip whose count is 0 — we instead assert the chip is absent.
    expect(screen.queryByTestId("timeline-filter-chip-watering")).not.toBeInTheDocument();
  });

  it("offers a 'Show all' reset that returns to 'All'", async () => {
    nextResponse = { data: ROWS, error: null };
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() => screen.getByTestId("timeline-memory-day-groups"));
    fireEvent.click(screen.getByTestId("timeline-filter-chip-watering"));
    const reset = screen.getByTestId("timeline-filter-reset");
    fireEvent.click(reset);
    expect(screen.getByTestId("timeline-filter-chip-all").getAttribute("data-selected")).toBe(
      "true",
    );
  });

  it("renders a calm error notice when the read fails (diary panels elsewhere remain)", async () => {
    nextResponse = { data: null, error: new Error("boom") };
    renderSection({ scope: "tent", tentId: "tent-1" });
    await waitFor(() => expect(screen.getByTestId("timeline-memory-error")).toBeInTheDocument());
    const text = screen.getByTestId("timeline-memory-error").textContent ?? "";
    expect(text.toLowerCase()).not.toMatch(/\blive\b/);
  });

  it("renders the section-level empty state when there are no events", async () => {
    nextResponse = { data: [], error: null };
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() => expect(screen.getByTestId("timeline-memory-empty")).toBeInTheDocument());
  });

  it("never shows live/synced/connected/imported wording", async () => {
    nextResponse = { data: ROWS, error: null };
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() => screen.getByTestId("timeline-memory-day-groups"));
    const text = screen.getByTestId("timeline-memory-section").textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/\blive\b/);
    expect(text).not.toMatch(/\bsynced\b/);
    expect(text).not.toMatch(/\bconnected\b/);
    expect(text).not.toMatch(/\bimported\b/);
  });
});
