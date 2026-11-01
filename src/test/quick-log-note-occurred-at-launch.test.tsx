import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setLocalStorageItemForTest } from "./helpers/localStorageTestHelper";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  grows: [{ id: "g-active", name: "Newer grow", stage: "veg", started_at: "" }] as Array<{
    id: string;
    name: string;
    stage: string;
    started_at?: string;
  }>,
  archivedGrows: [
    { id: "g-archived", name: "Winter run", stage: "flower", is_archived: true },
  ] as Array<{
    id: string;
    name: string;
    stage: string;
    is_archived: boolean;
    started_at?: string;
  }>,
  plants: [] as Array<Record<string, unknown>>,
  tents: [] as Array<Record<string, unknown>>,
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => harness.rpc(...args),
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: harness.grows,
    archivedGrows: harness.archivedGrows,
    activeGrow: harness.grows[0] ?? null,
    activeGrowId: "g-active",
    setActiveGrowId: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: harness.plants,
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: harness.tents,
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: "empty",
    snapshot: {
      status: "empty",
      source: null,
      captured_at: null,
      badge_label: "No data",
      metrics: {},
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));
vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: () => <div data-testid="all-activities-target" />,
}));

import QuickLog, { type QuickLogPrefill } from "@/components/QuickLog";
import {
  QUICK_LOG_NOTE_OCCURRED_AT_BEFORE_LIFETIME,
  QUICK_LOG_NOTE_OCCURRED_AT_FUTURE,
  formatQuickLogNoteLocalDateTime,
} from "@/lib/quickLogNoteOccurredAtRules";

const elementPrototype = Element.prototype as Element & {
  hasPointerCapture?: () => boolean;
  setPointerCapture?: () => void;
  releasePointerCapture?: () => void;
  scrollIntoView?: () => void;
};
elementPrototype.hasPointerCapture ??= () => false;
elementPrototype.setPointerCapture ??= () => {};
elementPrototype.releasePointerCapture ??= () => {};
elementPrototype.scrollIntoView ??= () => {};

function renderQuickLog(prefill?: QuickLogPrefill) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const ui = (next?: QuickLogPrefill): ReactElement => (
    <QueryClientProvider client={client}>
      <QuickLog open onOpenChange={() => {}} prefill={next} />
    </QueryClientProvider>
  );
  return render(ui(prefill));
}

function localMinute(daysFromNow: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setSeconds(0, 0);
  date.setMilliseconds(0);
  return date;
}

function archivedPrefill(): QuickLogPrefill {
  return {
    plantId: "plant-old",
    growId: "g-archived",
    tentId: "tent-old",
    eventType: "observation",
  };
}

beforeEach(() => {
  const growStart = localMinute(-30).toISOString();
  harness.grows = [{ id: "g-active", name: "Newer grow", stage: "veg", started_at: growStart }];
  harness.archivedGrows = [
    {
      id: "g-archived",
      name: "Winter run",
      stage: "flower",
      is_archived: true,
      started_at: growStart,
    },
  ];
  harness.plants = [
    {
      id: "plant-old",
      name: "Archived plant",
      grow_id: "g-archived",
      tent_id: "tent-old",
      stage: "flower",
      started_at: localMinute(-10).toISOString(),
    },
    {
      id: "plant-new",
      name: "Newer plant",
      grow_id: "g-active",
      tent_id: "tent-new",
      stage: "veg",
      started_at: localMinute(-10).toISOString(),
    },
  ];
  harness.tents = [
    { id: "tent-old", name: "Old tent", grow_id: "g-archived" },
    { id: "tent-new", name: "New tent", grow_id: "g-active" },
  ];
  harness.rpc.mockReset();
  harness.rpc.mockResolvedValue({
    data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000009" },
    error: null,
  });
  setLocalStorageItemForTest("verdant.activeGrow.u1", "g-active");
});

afterEach(() => cleanup());

function typeNote(value: string) {
  fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
    target: { value },
  });
}

function submit() {
  fireEvent.submit(screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement);
}

describe("Quick Log note occurred-at field", () => {
  it("saves an untouched note with a null occurrence, including on an archived grow", async () => {
    renderQuickLog(archivedPrefill());
    expect(screen.getByTestId("quick-log-note-occurred-at")).toBeInTheDocument();
    typeNote("Left at the current time");
    submit();
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    expect(harness.rpc).toHaveBeenCalledWith(
      "quicklog_save_manual",
      expect.objectContaining({
        p_action: "note",
        p_target_id: "plant-old",
        p_occurred_at: null,
      }),
    );
  });

  it("saves a backdated note on an archived-grow plant at the chosen time", async () => {
    const chosen = localMinute(-2);
    renderQuickLog(archivedPrefill());
    typeNote("Tent walk from two days ago");
    fireEvent.change(screen.getByTestId("quick-log-note-occurred-at"), {
      target: { value: formatQuickLogNoteLocalDateTime(chosen) },
    });
    submit();
    await waitFor(() => expect(harness.rpc).toHaveBeenCalledTimes(1));
    expect(harness.rpc).toHaveBeenCalledWith(
      "quicklog_save_manual",
      expect.objectContaining({
        p_action: "note",
        p_target_id: "plant-old",
        p_occurred_at: chosen.toISOString(),
      }),
    );
  });

  it("rejects a future time and a time before the plant started", async () => {
    renderQuickLog(archivedPrefill());
    typeNote("This has not happened yet");
    fireEvent.change(screen.getByTestId("quick-log-note-occurred-at"), {
      target: { value: formatQuickLogNoteLocalDateTime(localMinute(1)) },
    });
    submit();
    expect(await screen.findByTestId("quick-log-save-error")).toHaveTextContent(
      QUICK_LOG_NOTE_OCCURRED_AT_FUTURE,
    );
    expect(harness.rpc).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("quick-log-note-occurred-at"), {
      target: { value: formatQuickLogNoteLocalDateTime(localMinute(-20)) },
    });
    submit();
    expect(await screen.findByTestId("quick-log-save-error")).toHaveTextContent(
      QUICK_LOG_NOTE_OCCURRED_AT_BEFORE_LIFETIME,
    );
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("does not offer the note date on an environment check or a reminder", () => {
    const { unmount } = renderQuickLog({
      plantId: "plant-old",
      growId: "g-archived",
      tentId: "tent-old",
      eventType: "environment",
    });
    expect(screen.queryByTestId("quick-log-note-occurred-at")).not.toBeInTheDocument();
    unmount();

    renderQuickLog({
      plantId: "plant-new",
      growId: "g-active",
      tentId: "tent-new",
      eventType: "reminder",
    });
    expect(screen.queryByTestId("quick-log-note-occurred-at")).not.toBeInTheDocument();
    expect(document.querySelectorAll('input[type="datetime-local"]')).toHaveLength(1);
  });
});
