/**
 * ManualSnapshotTimelineSection — integration: scope filtering, empty
 * state, load failure, and surface labels.
 *
 * Mocks the Supabase client so the read-only diary fetch is deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

type ReadResponse = { data: DiaryRow[] | null; error: unknown };
let nextResponse: ReadResponse | Promise<ReadResponse> = { data: [], error: null };
let lastFilter: { column?: string; value?: string } = {};
let readCount = 0;
const clients: QueryClient[] = [];

function pendingRead() {
  let resolve!: (response: ReadResponse) => void;
  const promise = new Promise<ReadResponse>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery() {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (column: string, value: string) => {
      if (column === "plant_id" || column === "tent_id") lastFilter = { column, value };
      return q;
    };
    q.not = () => q;
    q.is = () => q;
    q.order = () => q;
    q.limit = () => {
      readCount += 1;
      return Promise.resolve(nextResponse);
    };
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
  clients.push(qc);
  const section = (nextProps: Parameters<typeof ManualSnapshotTimelineSection>[0]) => (
    <QueryClientProvider client={qc}>
      <ManualSnapshotTimelineSection {...nextProps} />
    </QueryClientProvider>
  );
  const view = render(section(props));
  return {
    ...view,
    qc,
    rerenderSection: (nextProps: Parameters<typeof ManualSnapshotTimelineSection>[0]) =>
      view.rerender(section(nextProps)),
  };
}

beforeEach(() => {
  nextResponse = { data: [], error: null };
  lastFilter = {};
  readCount = 0;
  onlineManager.setOnline(true);
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  onlineManager.setOnline(true);
});

describe("ManualSnapshotTimelineSection — plant scope", () => {
  it("renders only the plant-linked snapshot", async () => {
    nextResponse = {
      data: ROWS.filter((r) => r.plant_id === "plant-1"),
      error: null,
    };
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() =>
      expect(screen.getByTestId("manual-snapshot-timeline-section-list")).toBeInTheDocument(),
    );
    const cards = screen.getAllByTestId("manual-snapshot-timeline-card");
    expect(cards.map((c) => c.getAttribute("data-card-id"))).toEqual(["plant-1-snap-a"]);
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
      expect(screen.getByTestId("manual-snapshot-timeline-section-empty")).toBeInTheDocument(),
    );
  });
});

describe("ManualSnapshotTimelineSection — scope wording", () => {
  it("does not imply shared tent or sibling-plant snapshots are missing", async () => {
    nextResponse = {
      // Deliberately return both kinds: the selector must keep plant isolation.
      data: ROWS.filter((r) => r.plant_id !== "plant-1" && r.tent_id === "tent-1"),
      error: null,
    };
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() =>
      expect(screen.getByTestId("manual-snapshot-timeline-section-empty")).toHaveTextContent(
        /No manual sensor snapshots attached to this plant yet/i,
      ),
    );
    expect(screen.queryByTestId("manual-snapshot-timeline-section-list")).toBeNull();
    expect(screen.getByText("Manual snapshots attached to this plant")).toBeInTheDocument();
    expect(screen.getByTestId("manual-snapshot-timeline-section-helper")).toHaveTextContent(
      /plant.s diary.*Shared tent records.*QuickLog memory/i,
    );
    expect(lastFilter).toEqual({ column: "plant_id", value: "plant-1" });
  });

  it("describes a successful empty tent read as tent-scoped", async () => {
    renderSection({ scope: "tent", tentId: "tent-1" });
    await waitFor(() =>
      expect(screen.getByTestId("manual-snapshot-timeline-section-empty")).toHaveTextContent(
        /No manual sensor snapshots in this tent.s diary yet/i,
      ),
    );
    expect(screen.getByText("Manual snapshots in this tent’s diary")).toBeInTheDocument();
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
      expect(screen.getByTestId("manual-snapshot-timeline-section-list")).toBeInTheDocument(),
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
      expect(screen.getByTestId("manual-snapshot-timeline-section-empty")).toBeInTheDocument(),
    );
  });
});

describe("ManualSnapshotTimelineSection — failure + empty", () => {
  it("shows a calm non-blocking notice when the read fails", async () => {
    nextResponse = { data: null, error: new Error("boom") };
    renderSection({ scope: "plant", plantId: "plant-1" });
    await waitFor(() =>
      expect(screen.getByTestId("manual-snapshot-timeline-section-error")).toBeInTheDocument(),
    );
    // The error notice does not throw past the boundary, and no live label
    // appears in the failure copy.
    const text =
      screen.getByTestId("manual-snapshot-timeline-section-error").textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/\blive\b/);
  });

  it("renders the empty state when no manual snapshots exist", async () => {
    nextResponse = { data: [], error: null };
    renderSection({ scope: "tent", tentId: "tent-1" });
    await waitFor(() =>
      expect(screen.getByTestId("manual-snapshot-timeline-section-empty")).toBeInTheDocument(),
    );
  });

  it("renders a no-scope placeholder when the id is missing", () => {
    renderSection({ scope: "plant", plantId: null });
    expect(screen.getByTestId("manual-snapshot-timeline-section-no-scope")).toBeInTheDocument();
  });
});

const SCOPES = [
  {
    name: "plant",
    props: { scope: "plant", plantId: "plant-1" } as const,
    filter: { column: "plant_id", value: "plant-1" },
  },
  {
    name: "tent",
    props: { scope: "tent", tentId: "tent-1" } as const,
    filter: { column: "tent_id", value: "tent-1" },
  },
];

describe.each(SCOPES)(
  "ManualSnapshotTimelineSection — real $name read lifecycle",
  ({ props, filter }) => {
    it("keeps the first paused read unresolved until reconnect completes an empty read", async () => {
      onlineManager.setOnline(false);
      const pending = pendingRead();
      nextResponse = pending.promise;
      renderSection(props);
      expect(readCount).toBe(0);
      expect(screen.queryByTestId("manual-snapshot-timeline-section-empty")).toBeNull();
      expect(screen.getByRole("status", { name: "Manual snapshot read status" })).toHaveTextContent(
        /waiting for connection/i,
      );
      expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();

      act(() => onlineManager.setOnline(true));
      await waitFor(() => expect(readCount).toBe(1));
      expect(lastFilter).toEqual(filter);
      expect(screen.queryByTestId("manual-snapshot-timeline-section-empty")).toBeNull();
      expect(screen.getByRole("status", { name: "Manual snapshot read status" })).toHaveTextContent(
        /loading manual snapshots/i,
      );
      await act(async () => pending.resolve({ data: [], error: null }));
      await waitFor(() =>
        expect(screen.getByTestId("manual-snapshot-timeline-section-empty")).toBeInTheDocument(),
      );
      expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    });

    it("retries a failed first read and displays the returned manual snapshot", async () => {
      nextResponse = { data: null, error: new Error("unavailable") };
      renderSection(props);
      await screen.findByTestId("manual-snapshot-timeline-section-error");
      expect(screen.queryByTestId("manual-snapshot-timeline-section-empty")).toBeNull();
      const pending = pendingRead();
      nextResponse = pending.promise;
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(readCount).toBe(2));
      expect(lastFilter).toEqual(filter);
      expect(screen.queryByTestId("manual-snapshot-timeline-section-empty")).toBeNull();
      await act(async () => pending.resolve({ data: [ROWS[0]], error: null }));
      await screen.findByTestId("manual-snapshot-timeline-section-list");
      expect(screen.getByTestId("manual-snapshot-timeline-card")).toHaveAttribute(
        "data-card-id",
        "plant-1-snap-a",
      );
      expect(screen.getByTestId("manual-snapshot-timeline-card-source")).toHaveTextContent(
        /manual/i,
      );
      expect(screen.queryByTestId("manual-snapshot-timeline-section-error")).toBeNull();
    });

    it("retains prior cards with an unconfirmed-read warning through refresh failure and retry", async () => {
      nextResponse = { data: [ROWS[0]], error: null };
      const { qc } = renderSection(props);
      await screen.findByTestId("manual-snapshot-timeline-section-list");
      nextResponse = { data: null, error: new Error("refresh unavailable") };
      await act(async () => {
        await qc.invalidateQueries();
      });
      await screen.findByTestId("manual-snapshot-timeline-section-error");
      expect(screen.getByTestId("manual-snapshot-timeline-card")).toHaveAttribute(
        "data-card-id",
        "plant-1-snap-a",
      );
      expect(screen.getByRole("status", { name: "Manual snapshot read status" })).toHaveTextContent(
        /previously loaded.*unconfirmed/i,
      );
      expect(screen.queryByTestId("manual-snapshot-timeline-section-empty")).toBeNull();

      const pending = pendingRead();
      nextResponse = pending.promise;
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(readCount).toBe(3));
      expect(screen.getByRole("status", { name: "Manual snapshot read status" })).toHaveTextContent(
        /refreshing.*previously loaded.*unconfirmed/i,
      );
      expect(screen.getByTestId("manual-snapshot-timeline-card")).toHaveAttribute(
        "data-card-id",
        "plant-1-snap-a",
      );
      expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(readCount).toBe(3);
      await act(async () => pending.resolve({ data: [], error: null }));
      await screen.findByTestId("manual-snapshot-timeline-section-empty");
      expect(screen.queryByTestId("manual-snapshot-timeline-card")).toBeNull();
      expect(screen.queryByRole("status", { name: "Manual snapshot read status" })).toBeNull();
    });

    it("does not promote a previously empty result after a failed read or an offline retry", async () => {
      const { qc } = renderSection(props);
      await screen.findByTestId("manual-snapshot-timeline-section-empty");
      nextResponse = { data: null, error: new Error("refresh unavailable") };
      await act(async () => {
        await qc.invalidateQueries();
      });
      await screen.findByTestId("manual-snapshot-timeline-section-error");
      expect(screen.queryByTestId("manual-snapshot-timeline-section-empty")).toBeNull();
      act(() => onlineManager.setOnline(false));
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      await waitFor(() =>
        expect(
          screen.getByRole("status", { name: "Manual snapshot read status" }),
        ).toHaveTextContent(/waiting for connection/i),
      );
      expect(readCount).toBe(2);
      expect(screen.queryByTestId("manual-snapshot-timeline-section-empty")).toBeNull();
      nextResponse = { data: [], error: null };
      act(() => onlineManager.setOnline(true));
      await screen.findByTestId("manual-snapshot-timeline-section-empty");
      expect(readCount).toBe(3);
    });

    it("qualifies cached cards when their refresh is paused and preserves manual provenance", async () => {
      nextResponse = { data: [ROWS[0]], error: null };
      const { qc } = renderSection(props);
      await screen.findByTestId("manual-snapshot-timeline-section-list");
      act(() => onlineManager.setOnline(false));
      act(() => {
        void qc.invalidateQueries();
      });
      await waitFor(() =>
        expect(
          screen.getByRole("status", { name: "Manual snapshot read status" }),
        ).toHaveTextContent(/waiting for connection.*previously loaded.*unconfirmed/i),
      );
      expect(screen.getByTestId("manual-snapshot-timeline-card-source")).toHaveTextContent(
        /manual/i,
      );
      expect(readCount).toBe(1);
      expect(screen.queryByTestId("manual-snapshot-timeline-section-empty")).toBeNull();
    });

    it("shows an honest refreshing state while an online refetch is still unresolved", async () => {
      nextResponse = { data: [ROWS[0]], error: null };
      const pending = pendingRead();
      const { qc } = renderSection(props);
      await screen.findByTestId("manual-snapshot-timeline-section-list");
      nextResponse = pending.promise;
      act(() => {
        void qc.invalidateQueries({ refetchType: "active" });
      });
      await waitFor(() => expect(readCount).toBe(2));
      expect(screen.getByRole("status", { name: "Manual snapshot read status" })).toHaveTextContent(
        /refreshing.*previously loaded.*unconfirmed/i,
      );
      expect(screen.getByTestId("manual-snapshot-timeline-card")).toHaveAttribute(
        "data-card-id",
        "plant-1-snap-a",
      );
      expect(screen.queryByTestId("manual-snapshot-timeline-section-empty")).toBeNull();
      expect(screen.queryByTestId("manual-snapshot-timeline-section-error")).toBeNull();
      expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
      await act(async () => pending.resolve({ data: [ROWS[0]], error: null }));
      await waitFor(() =>
        expect(screen.queryByRole("status", { name: "Manual snapshot read status" })).toBeNull(),
      );
    });
  },
);

describe("ManualSnapshotTimelineSection — pending scope boundaries", () => {
  it("does not show an old plant's cards when the next plant's first read is paused", async () => {
    nextResponse = { data: [ROWS[0]], error: null };
    const { rerenderSection } = renderSection({ scope: "plant", plantId: "plant-1" });
    await screen.findByTestId("manual-snapshot-timeline-section-list");
    act(() => onlineManager.setOnline(false));
    rerenderSection({ scope: "plant", plantId: "plant-2" });
    expect(screen.queryByTestId("manual-snapshot-timeline-card")).toBeNull();
    expect(screen.queryByTestId("manual-snapshot-timeline-section-empty")).toBeNull();
    expect(screen.getByRole("status", { name: "Manual snapshot read status" })).toHaveTextContent(
      /waiting for connection/i,
    );
    nextResponse = { data: [ROWS[3]], error: null };
    act(() => onlineManager.setOnline(true));
    await screen.findByTestId("manual-snapshot-timeline-card");
    expect(screen.getByTestId("manual-snapshot-timeline-card")).toHaveAttribute(
      "data-card-id",
      "other-plant-d",
    );
    expect(lastFilter).toEqual({ column: "plant_id", value: "plant-2" });
  });

  it("does not leak a late tent response into the newly selected tent", async () => {
    const oldRead = pendingRead();
    nextResponse = oldRead.promise;
    const { rerenderSection } = renderSection({ scope: "tent", tentId: "tent-1" });
    const newRead = pendingRead();
    nextResponse = newRead.promise;
    rerenderSection({ scope: "tent", tentId: "tent-2" });
    await act(async () => oldRead.resolve({ data: [ROWS[0]], error: null }));
    expect(screen.queryByTestId("manual-snapshot-timeline-card")).toBeNull();
    expect(screen.queryByTestId("manual-snapshot-timeline-section-empty")).toBeNull();
    expect(screen.getByRole("status", { name: "Manual snapshot read status" })).toHaveTextContent(
      /loading manual snapshots/i,
    );
    await act(async () => newRead.resolve({ data: [ROWS[2]], error: null }));
    await screen.findByTestId("manual-snapshot-timeline-card");
    expect(screen.getByTestId("manual-snapshot-timeline-card")).toHaveAttribute(
      "data-card-id",
      "other-tent-c",
    );
    expect(lastFilter).toEqual({ column: "tent_id", value: "tent-2" });
  });

  it("keeps missing scope distinct from waiting for connection", () => {
    onlineManager.setOnline(false);
    renderSection({ scope: "tent", tentId: null });
    expect(screen.getByTestId("manual-snapshot-timeline-section-no-scope")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Manual snapshot read status" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(readCount).toBe(0);
  });
});
