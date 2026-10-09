/**
 * Legacy Quick Log hides "When it happened" for every kind except
 * observation and note. Watering stays on the recovery contract's null
 * occurrence. Environment checks are sensor readings. Feeding and
 * reminders use their own forms.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocalStorageItemForTest } from "./helpers/localStorageTestHelper";

const harness = vi.hoisted(() => ({
  grows: [{ id: "g-active", name: "Newer grow", stage: "veg", started_at: "" }] as Array<{
    id: string;
    name: string;
    stage: string;
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
    archivedGrows: [],
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
  const view = render(ui(prefill));
  return { ...view, rerenderWith: (next?: QuickLogPrefill) => view.rerender(ui(next)) };
}

function expectNoOccurredAtField() {
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.queryByTestId("quick-log-note-occurred-at")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("When it happened")).not.toBeInTheDocument();
}

beforeEach(() => {
  harness.grows = [
    {
      id: "g-active",
      name: "Newer grow",
      stage: "veg",
      started_at: "2026-06-01T12:00:00.000Z",
    },
  ];
  harness.plants = [
    {
      id: "plant-new",
      name: "Newer plant",
      grow_id: "g-active",
      tent_id: "tent-new",
      stage: "veg",
      started_at: "2026-06-01T12:00:00.000Z",
    },
  ];
  harness.tents = [{ id: "tent-new", name: "New tent", grow_id: "g-active" }];
  harness.rpc.mockReset();
  setLocalStorageItemForTest("verdant.activeGrow.u1", "g-active");
});

afterEach(() => cleanup());

describe("legacy Quick Log hides When it happened for excluded kinds", () => {
  it("shows the field for an observation and hides it after switching to an environment check", async () => {
    renderQuickLog({
      plantId: "plant-new",
      growId: "g-active",
      tentId: "tent-new",
      eventType: "observation",
    });
    expect(screen.getByTestId("quick-log-note-occurred-at")).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    const combobox = within(dialog).getByRole("combobox", { name: /event/i });
    fireEvent.pointerDown(combobox, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(combobox);
    fireEvent.click(await screen.findByRole("option", { name: /environment check/i }));

    expect(screen.queryByTestId("quick-log-note-occurred-at")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("When it happened")).not.toBeInTheDocument();
  });

  it("does not show the field for watering, feeding, or a reminder", () => {
    const { unmount } = renderQuickLog({
      plantId: "plant-new",
      growId: "g-active",
      tentId: "tent-new",
      eventType: "watering",
    });
    expectNoOccurredAtField();
    unmount();

    const feeding = renderQuickLog({
      plantId: "plant-new",
      growId: "g-active",
      tentId: "tent-new",
      eventType: "feeding",
    });
    expectNoOccurredAtField();
    feeding.unmount();

    renderQuickLog({
      plantId: "plant-new",
      growId: "g-active",
      tentId: "tent-new",
      eventType: "reminder",
    });
    expectNoOccurredAtField();
  });
});
