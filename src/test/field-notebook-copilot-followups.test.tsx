import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldNotebook, { type FieldNotebookSaveResponse } from "@/components/FieldNotebook";
import FieldNotebookMount from "@/components/FieldNotebookMount";
import FieldNotebookTimelineRecovery from "@/components/FieldNotebookTimelineRecovery";
import { emptyDraft } from "@/lib/fieldNotebookOutcomeRules";
import {
  writeNotebookDraft,
  readNotebookDraft,
  clearNotebookSession,
} from "@/lib/fieldNotebookSession";
import { MemoryRouter, Route, Routes, useLocation } from "@/lib/react-router-compat";

const EVENT = "11111111-1111-4111-8111-111111111111";
const GROW = "22222222-2222-4222-8222-222222222222";
const TENT = "33333333-3333-4333-8333-333333333333";

const rpcMock = vi.fn();
const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("@/lib/quickLogSuccessTelemetry", () => ({
  trackQuickLogSuccess: vi.fn(),
}));

const saveMock = vi.fn();
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: saveMock, saving: false, error: null }),
}));

vi.mock("@/hooks/useDashboardScopedData", () => ({
  readDashboardRecent: vi.fn(async () => ({
    status: "ok",
    items: [{ id: `grow-event-${EVENT}` }],
  })),
}));

function queryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const pass = () => builder;
  builder.select = pass;
  builder.eq = pass;
  builder.in = pass;
  builder.or = pass;
  builder.order = pass;
  builder.is = pass;
  builder.not = pass;
  builder.limit = () =>
    Promise.resolve({
      data:
        table === "grow_events"
          ? [
              {
                id: EVENT,
                plant_id: null,
                tent_id: TENT,
                occurred_at: "2025-01-08T15:24:00.000Z",
                event_type: "observation",
                source: "manual",
                note: "trimmed",
                is_deleted: false,
                watering_events: [],
                environment_events: [],
              },
            ]
          : [],
      error: null,
    });
  builder.maybeSingle = () => Promise.resolve({ data: null, error: { message: "read failed" } });
  return builder;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-path">{location.pathname}</div>;
}

const tent = {
  id: "flower",
  name: "Flower Tent 2",
  weekLabel: "—",
  ageLabel: "—",
  startedLabel: "—",
};

describe("field notebook remaining Copilot follow-ups", () => {
  beforeEach(() => {
    clearNotebookSession();
    rpcMock.mockReset();
    fromMock.mockReset();
    saveMock.mockReset();
    fromMock.mockImplementation((table: string) => queryBuilder(table));
  });

  it("fetches the tent timeline when the query cache starts empty", async () => {
    saveMock.mockResolvedValue({
      ok: true,
      growEventId: EVENT,
      serverOccurredAt: "2025-01-08T15:24:00.000Z",
      persistedNote: "trimmed",
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <FieldNotebookMount growId={GROW} tents={[{ id: TENT, name: "Flower Tent 2" }]} />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "trimmed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(await screen.findByText(/Saved to Flower Tent 2/)).toBeInTheDocument();
    expect(
      client.getQueryCache().findAll({ queryKey: ["quick_log_grouped_timeline"] }).length,
    ).toBeGreaterThan(0);
  });

  it("leaves Saving when the save finishes after a remount", async () => {
    let finish: (value: FieldNotebookSaveResponse) => void = () => {};
    const onSave = vi.fn(
      () =>
        new Promise<FieldNotebookSaveResponse>((resolve) => {
          finish = resolve;
        }),
    );
    const props = {
      tents: [tent],
      readingsByTent: {},
      onSave,
      onFindEntry: vi.fn(),
    };
    const first = render(<FieldNotebook {...props} />);
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "still saving" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(await screen.findByRole("button", { name: "Saving..." })).toBeInTheDocument();
    first.unmount();
    render(<FieldNotebook {...props} />);
    expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
    finish({
      transport: { kind: "dispatched_no_receipt" },
      reflection: {
        timelineHasEntry: false,
        countIncludesEntry: false,
        lastActivityIncludesEntry: false,
      },
    });
    expect(await screen.findByRole("button", { name: "Check Timeline" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Saving..." })).not.toBeInTheDocument();
  });

  it("returns Back to note to the grow without dropping the typed note", async () => {
    clearNotebookSession();
    writeNotebookDraft({
      ...emptyDraft("flower"),
      note: "typed on the grow",
      phase: "check_none",
      writeBlocked: true,
      recoverySurface: "timeline",
      attempt: {
        attemptId: "a1",
        tentId: "flower",
        tentName: "Flower Tent 2",
        note: "typed on the grow",
        idempotencyKey: "k",
      },
    });
    render(
      <MemoryRouter initialEntries={["/timeline"]}>
        <LocationProbe />
        <Routes>
          <Route path="/timeline" element={<FieldNotebookTimelineRecovery />} />
          <Route path="/" element={<div>Grow</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to note" }));
    expect(await screen.findByTestId("location-path")).toHaveTextContent("/");
    expect(readNotebookDraft("flower").note).toBe("typed on the grow");
    expect(readNotebookDraft("flower").recoverySurface).toBe("grow");
  });

  it("matches a trimmed receipt while keeping the editor snapshot", async () => {
    const onSave = vi.fn().mockResolvedValue({
      transport: {
        kind: "acknowledged",
        entry: {
          growEventId: EVENT,
          tentId: "flower",
          tentName: "Flower Tent 2",
          note: "hello",
          occurredAt: "2025-01-08T15:24:00.000Z",
        },
      },
      reflection: {
        timelineHasEntry: true,
        countIncludesEntry: true,
        lastActivityIncludesEntry: true,
      },
    });
    render(
      <FieldNotebook tents={[tent]} readingsByTent={{}} onSave={onSave} onFindEntry={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "hello\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(await screen.findByText(/Saved to Flower Tent 2/)).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ note: "hello" }));
    expect(screen.getByPlaceholderText("Add what you observed.")).toHaveValue("hello\n");
  });
});
