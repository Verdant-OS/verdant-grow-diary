import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const { saveMock, activitySaveMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  activitySaveMock: vi.fn(),
}));

const plants = [
  {
    id: "plant-alpha",
    name: "Alpha route target",
    strain: "Alpha",
    grow_id: "grow-one",
    tent_id: "tent-alpha",
    stage: "veg",
    is_archived: false,
  },
  {
    id: "plant-beta",
    name: "Beta route target",
    strain: "Beta",
    grow_id: "grow-one",
    tent_id: "tent-beta",
    stage: "flower",
    is_archived: false,
  },
];

const tents = [
  { id: "tent-alpha", name: "Alpha tent", grow_id: "grow-one" },
  { id: "tent-beta", name: "Beta tent", grow_id: "grow-one" },
];

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: saveMock, saving: false, error: null }),
}));
vi.mock("@/hooks/useQuickLogActivitySave", () => ({
  useQuickLogActivitySave: () => ({ save: activitySaveMock, saving: false, error: null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-one" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-one", name: "Grow one", stage: "veg" }],
    activeGrow: { id: "grow-one", name: "Grow one", stage: "veg" },
    activeGrowId: "grow-one",
    setActiveGrowId: vi.fn(),
    loading: false,
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: plants, isLoading: false }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: tents, isLoading: false }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({ data: [] }),
}));
vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: "empty",
    snapshot: {
      status: "empty",
      source: null,
      captured_at: null,
      metrics: { temp_f: null, humidity_pct: null, vpd_kpa: null },
    },
  }),
}));
import DailyCheck from "@/pages/DailyCheck";

let navigateInTest: ((path: string) => void) | null = null;

function NavigationCapture() {
  const navigate = useNavigate();
  useEffect(() => {
    navigateInTest = (path) => navigate(path);
    return () => {
      navigateInTest = null;
    };
  }, [navigate]);
  return null;
}

function renderRoute(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <NavigationCapture />
        <DailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function navigateRoute(path: string) {
  expect(navigateInTest).not.toBeNull();
  await act(async () => {
    navigateInTest?.(path);
  });
}

async function chooseDailyCheckPlant(name: RegExp) {
  const trigger = screen.getByTestId("daily-grow-check-plant-select");
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name }));
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  clearLocalStorageForTest();
  saveMock.mockReset();
  activitySaveMock.mockReset();
  navigateInTest = null;
});

describe("DailyCheck real QuickLog target lifetime", () => {
  it("remounts the open dialog when same-mounted navigation changes the plant target", async () => {
    renderRoute("/daily-check?plantId=plant-alpha&method=note");

    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-plant")).toHaveTextContent("Alpha route target"),
    );
    fireEvent.change(screen.getByTestId("quicklog-note"), {
      target: { value: "Alpha-only unsaved draft" },
    });

    await navigateRoute("/daily-check?plantId=plant-beta&method=note");

    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-plant")).toHaveTextContent("Beta route target"),
    );
    expect(screen.getByTestId("quick-log-target-plant")).not.toHaveTextContent(
      "Alpha route target",
    );
    expect(screen.getByTestId("quick-log-target-tent")).toHaveTextContent("Beta tent");
    expect(screen.getByTestId("quick-log-target-grow")).toHaveTextContent("Grow one");
    expect(screen.queryByTestId("quick-log-plant-mismatch-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("quicklog-note")).toHaveValue("");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(saveMock).not.toHaveBeenCalled();
    expect(activitySaveMock).not.toHaveBeenCalled();
  });

  it("remounts the closed dialog when the local target picker changes plants", async () => {
    renderRoute("/daily-check?plantId=plant-alpha&method=note");
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-plant")).toHaveTextContent("Alpha route target"),
    );
    fireEvent.change(screen.getByTestId("quicklog-note"), {
      target: { value: "Alpha-only local draft" },
    });

    await navigateRoute("/daily-check?plantId=plant-alpha");
    await screen.findByTestId("daily-grow-check-target-selector");
    await chooseDailyCheckPlant(/Beta route target/i);
    fireEvent.click(screen.getByTestId("daily-grow-check-choose-quicklog"));

    await waitFor(() =>
      expect(screen.getByTestId("quick-log-target-plant")).toHaveTextContent("Beta route target"),
    );
    expect(screen.getByTestId("quick-log-target-tent")).toHaveTextContent("Beta tent");
    expect(screen.queryByTestId("quick-log-plant-mismatch-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("quicklog-note")).toHaveValue("");
    expect(saveMock).not.toHaveBeenCalled();
    expect(activitySaveMock).not.toHaveBeenCalled();
  });
});
