/**
 * QuickLogV2Sheet — remembered plant is a visible offer on a global open.
 *
 * The sheet must never silently reuse local target memory. A current,
 * account-scoped record may appear only when the launcher supplied no target,
 * and it becomes the draft target only after the grower clicks Continue.
 */
import { useState, type ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveMock = vi.fn();

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: saveMock, saving: false }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
vi.mock("@/lib/react-router-compat", () => ({
  useInRouterContext: () => false,
  useNavigate: () => vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

let userMock: { id: string } | null = { id: "u1" };
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: userMock }) }));

const ACTIVE_GROW = { id: "g1", name: "Grow 1" };
let growsMock: Array<Record<string, unknown>> = [ACTIVE_GROW];
vi.mock("@/store/grows", () => ({ useGrows: () => ({ grows: growsMock }) }));

const plantsState: {
  data: Array<Record<string, unknown>>;
  isLoading: boolean;
  isError: boolean;
  refetch: ReturnType<typeof vi.fn>;
} = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
const tentsState: typeof plantsState = {
  data: [],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => plantsState }));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => tentsState }));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { RECENT_TARGET_SUGGESTION_MAX_AGE_MS } from "@/lib/quickLogRecentTargetSuggestion";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

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

const NOW = Date.parse("2026-08-20T12:00:00.000Z");
const USER_STORAGE_KEY = "verdant.quickLog.lastTarget.v2.u1";
const PLANTS = [
  { id: "p1", name: "Blue Dream", tent_id: "t1", grow_id: "g1" },
  { id: "p2", name: "OG Kush", tent_id: "t1", grow_id: "g1" },
];
const TENTS = [{ id: "t1", name: "Tent 1", grow_id: "g1" }];

function seed(key: string, plantId: string, ageMs: number): void {
  setLocalStorageItemForTest(
    key,
    JSON.stringify({
      plantId,
      growId: "g1",
      tentId: "t1",
      savedAt: new Date(NOW - ageMs).toISOString(),
    }),
  );
}

function dispatchStorageChange(key: string, oldValue: string | null, newValue: string | null) {
  window.dispatchEvent(
    new StorageEvent("storage", { key, oldValue, newValue, storageArea: window.localStorage }),
  );
}

function renderSheet(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function targetTrigger(): HTMLElement {
  return screen.getByRole("combobox", { name: "Choose plant or tent for this Quick Log" });
}

function ReopenableSheet() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open V2 Quick Log
      </button>
      <QuickLogV2Sheet open={open} onOpenChange={setOpen} />
    </>
  );
}

function AccountSwitchingSheet() {
  const [, forceRender] = useState(0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          userMock = { id: "u2" };
          forceRender((value) => value + 1);
        }}
      >
        Switch V2 account
      </button>
      <QuickLogV2Sheet open onOpenChange={() => {}} />
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  clearLocalStorageForTest();
  saveMock.mockReset().mockResolvedValue({ ok: true, growEventId: "event-1" });
  userMock = { id: "u1" };
  growsMock = [ACTIVE_GROW];
  plantsState.data = PLANTS;
  plantsState.isLoading = false;
  plantsState.isError = false;
  plantsState.refetch = vi.fn();
  tentsState.data = TENTS;
  tentsState.isLoading = false;
  tentsState.isError = false;
  tentsState.refetch = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("QuickLogV2Sheet remembered-target suggestion", () => {
  it("renders a global-open offer without silently selecting or saving it", () => {
    seed(USER_STORAGE_KEY, "p2", 60_000);
    renderSheet(<QuickLogV2Sheet open onOpenChange={() => {}} />);

    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toHaveTextContent(
      "Continue with OG Kush?",
    );
    expect(targetTrigger()).not.toHaveTextContent("OG Kush");
    // V2 keeps its Save control reachable and rejects an empty target in the
    // handler. Exercising it proves the offer did not become a hidden target.
    fireEvent.click(screen.getByTestId("qlv2-save"));
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("selects the remembered plant only after Continue and never saves on acceptance", () => {
    seed(USER_STORAGE_KEY, "p2", 60_000);
    renderSheet(<QuickLogV2Sheet open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByTestId("qlv2-recent-target-accept"));

    expect(targetTrigger()).toHaveTextContent("OG Kush");
    expect(screen.queryByTestId("qlv2-recent-target-suggestion")).not.toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("dismisses the offer for this session and restores it on a fresh null-target open", () => {
    seed(USER_STORAGE_KEY, "p2", 60_000);
    renderSheet(<ReopenableSheet />);

    fireEvent.click(screen.getByTestId("qlv2-recent-target-dismiss"));
    expect(screen.queryByTestId("qlv2-recent-target-suggestion")).not.toBeInTheDocument();
    expect(targetTrigger()).not.toHaveTextContent("OG Kush");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByText("Open V2 Quick Log"));

    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toHaveTextContent(
      "Continue with OG Kush?",
    );
    expect(targetTrigger()).not.toHaveTextContent("OG Kush");
  });

  it("withholds the offer when the launcher supplied a target", () => {
    seed(USER_STORAGE_KEY, "p2", 60_000);
    renderSheet(<QuickLogV2Sheet open onOpenChange={() => {}} defaultTargetKey="plant:p1" />);

    expect(targetTrigger()).toHaveTextContent("Blue Dream");
    expect(screen.queryByTestId("qlv2-recent-target-suggestion")).not.toBeInTheDocument();
  });

  it("uses only the signed-in account key and swaps records on account change", () => {
    seed(USER_STORAGE_KEY, "p1", 60_000);
    seed("verdant.quickLog.lastTarget.v2.u2", "p2", 30_000);
    renderSheet(<AccountSwitchingSheet />);
    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toHaveTextContent(
      "Continue with Blue Dream?",
    );

    fireEvent.click(screen.getByText("Switch V2 account"));

    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toHaveTextContent(
      "Continue with OG Kush?",
    );
    expect(targetTrigger()).not.toHaveTextContent("Blue Dream");
    expect(targetTrigger()).not.toHaveTextContent("OG Kush");
  });

  it("offers nothing to a signed-out session", () => {
    userMock = null;
    seed(USER_STORAGE_KEY, "p2", 60_000);
    renderSheet(<QuickLogV2Sheet open onOpenChange={() => {}} />);

    expect(screen.queryByTestId("qlv2-recent-target-suggestion")).not.toBeInTheDocument();
    expect(targetTrigger()).not.toHaveTextContent("OG Kush");
  });

  it("re-reads current storage for cross-tab and delayed events", () => {
    seed(USER_STORAGE_KEY, "p1", 60_000);
    const delayedP1 = getLocalStorageItemForTest(USER_STORAGE_KEY);
    renderSheet(<QuickLogV2Sheet open onOpenChange={() => {}} />);

    seed(USER_STORAGE_KEY, "p2", 30_000);
    act(() => dispatchStorageChange(USER_STORAGE_KEY, null, delayedP1));

    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toHaveTextContent(
      "Continue with OG Kush?",
    );
    expect(targetTrigger()).not.toHaveTextContent("OG Kush");
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("does not reinterpret acceptance when storage changed before its event arrived", () => {
    seed(USER_STORAGE_KEY, "p1", 60_000);
    renderSheet(<QuickLogV2Sheet open onOpenChange={() => {}} />);
    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toHaveTextContent(
      "Continue with Blue Dream?",
    );

    seed(USER_STORAGE_KEY, "p2", 30_000);
    fireEvent.click(screen.getByTestId("qlv2-recent-target-accept"));

    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toHaveTextContent(
      "Continue with OG Kush?",
    );
    expect(targetTrigger()).not.toHaveTextContent("Blue Dream");
    expect(targetTrigger()).not.toHaveTextContent("OG Kush");
    expect(saveMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("qlv2-recent-target-accept"));
    expect(targetTrigger()).toHaveTextContent("OG Kush");
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("removes the rendered offer at the strict 14-day expiry boundary", () => {
    seed(USER_STORAGE_KEY, "p2", RECENT_TARGET_SUGGESTION_MAX_AGE_MS - 60_000);
    renderSheet(<QuickLogV2Sheet open onOpenChange={() => {}} />);
    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(60_001));

    expect(screen.queryByTestId("qlv2-recent-target-suggestion")).not.toBeInTheDocument();
    expect(targetTrigger()).not.toHaveTextContent("OG Kush");
    fireEvent.click(screen.getByTestId("qlv2-save"));
    expect(saveMock).not.toHaveBeenCalled();
  });
});
