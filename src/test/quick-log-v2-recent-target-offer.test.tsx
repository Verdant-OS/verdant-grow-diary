/**
 * QuickLogV2Sheet — the remembered target as an OFFER on the desktop entry.
 *
 * `QuickLogV2Fab` is `hidden md:inline-flex`, so on desktop this sheet is the
 * Dashboard Quick Log button. Slice D5 shipped the chip on the legacy dialog
 * only, and this sheet recorded the target after every plant-scoped save
 * without ever reading it back — so the approved S5 reduction ("exactly one
 * explicit choice") held on mobile and not on desktop.
 *
 * Fences asserted here, by rendering rather than by scanning source:
 *  - the offer is shown but the target is NOT selected;
 *  - Continue performs exactly the selection the Select performs, and saves
 *    nothing;
 *  - Choose another leaves the target empty;
 *  - a launcher-scoped sheet, an expired record, a plant the Select does not
 *    list, another account's record, and a signed-out session all offer
 *    nothing — each against a positive control.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpcMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
const insertMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    from: () => ({ insert: insertMock }),
  },
}));

let plantsMock: Array<Record<string, unknown>> = [];
let tentsMock: Array<Record<string, unknown>> = [];
let growsMock: Array<Record<string, unknown>> = [];
let userMock: { id: string } | null = { id: "u1" };

vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: plantsMock }) }));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: tentsMock }) }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: userMock }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: growsMock,
    activeGrow: growsMock[0] ?? null,
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

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

const PLANTS = [
  { id: "p1", name: "Blue Dream", tent_id: "t1", grow_id: "g1" },
  { id: "p2", name: "OG Kush", tent_id: "t1", grow_id: "g1" },
];
const TENTS = [{ id: "t1", name: "Tent 1", grow_id: "g1" }];
const GROWS = [{ id: "g1", name: "Grow 1", stage: "veg" }];

const NOW = Date.parse("2026-08-19T12:00:00.000Z");
const USER_STORAGE_KEY = "verdant.quickLog.lastTarget.v2.u1";

function seed(key: string, plantId: string, ageMs: number) {
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

function renderSheet(defaultTargetKey: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={() => {}} defaultTargetKey={defaultTargetKey} />
    </QueryClientProvider>,
  );
}

function dispatchStorageChange(key: string, oldValue: string | null, newValue: string | null) {
  window.dispatchEvent(
    new StorageEvent("storage", { key, oldValue, newValue, storageArea: window.localStorage }),
  );
}

function targetTrigger() {
  return screen.getByLabelText("Choose plant or tent for this Quick Log");
}

describe("QuickLogV2Sheet — remembered target is an offer on the desktop entry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    clearLocalStorageForTest();
    plantsMock = [...PLANTS];
    tentsMock = [...TENTS];
    growsMock = [...GROWS];
    userMock = { id: "u1" };
    rpcMock.mockClear();
    insertMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("offers the remembered plant without selecting it", () => {
    seed(USER_STORAGE_KEY, "p2", 60_000);
    renderSheet();

    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toHaveTextContent(
      "Continue with OG Kush?",
    );
    // Offered, never applied: the Select still shows its placeholder.
    expect(targetTrigger()).toHaveTextContent("Choose a tent or plant");
    expect(targetTrigger()).not.toHaveTextContent("OG Kush");
  });

  it("selects the plant only on an explicit Continue, and saves nothing", () => {
    seed(USER_STORAGE_KEY, "p2", 60_000);
    renderSheet();

    fireEvent.click(screen.getByTestId("qlv2-recent-target-accept"));

    expect(targetTrigger()).toHaveTextContent("OG Kush");
    expect(screen.queryByTestId("qlv2-recent-target-suggestion")).not.toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("leaves the target empty when the offer is dismissed", () => {
    seed(USER_STORAGE_KEY, "p2", 60_000);
    renderSheet();

    fireEvent.click(screen.getByTestId("qlv2-recent-target-dismiss"));

    expect(screen.queryByTestId("qlv2-recent-target-suggestion")).not.toBeInTheDocument();
    expect(targetTrigger()).toHaveTextContent("Choose a tent or plant");
    // Dismissal is not a selection.
    expect(screen.getByTestId("qlv2-missing-target-help")).toBeInTheDocument();
  });

  it("offers nothing when the launcher already named a target", () => {
    // The positive control is the first case: identical record and freshness,
    // differing only in the launcher's own scope.
    seed(USER_STORAGE_KEY, "p2", 60_000);
    renderSheet("plant:p1");

    expect(targetTrigger()).toHaveTextContent("Blue Dream");
    expect(screen.queryByTestId("qlv2-recent-target-suggestion")).not.toBeInTheDocument();
  });

  it("offers nothing once the record is past its window", () => {
    seed(USER_STORAGE_KEY, "p2", RECENT_TARGET_SUGGESTION_MAX_AGE_MS + 1);
    renderSheet();

    expect(targetTrigger()).toBeInTheDocument();
    expect(screen.queryByTestId("qlv2-recent-target-suggestion")).not.toBeInTheDocument();
  });

  it("offers nothing for a plant this Select does not list", () => {
    // Same fresh record; only the target list differs. An offer the Select
    // cannot honour would resolve to `ok: false` and select nothing.
    seed(USER_STORAGE_KEY, "p2", 60_000);
    plantsMock = [PLANTS[0]];
    renderSheet();

    expect(targetTrigger()).toBeInTheDocument();
    expect(screen.queryByTestId("qlv2-recent-target-suggestion")).not.toBeInTheDocument();
  });

  it("offers nothing from another account's record", () => {
    // Differs from the offered case ONLY in the account segment of the key.
    seed("verdant.quickLog.lastTarget.v2.someone-else", "p2", 60_000);
    renderSheet();

    expect(targetTrigger()).toBeInTheDocument();
    expect(screen.queryByTestId("qlv2-recent-target-suggestion")).not.toBeInTheDocument();
  });

  it("offers nothing to a signed-out session", () => {
    seed(USER_STORAGE_KEY, "p2", 60_000);
    userMock = null;
    renderSheet();

    expect(targetTrigger()).toBeInTheDocument();
    expect(screen.queryByTestId("qlv2-recent-target-suggestion")).not.toBeInTheDocument();
  });

  it("offers nothing while there are no targets to choose from", () => {
    seed(USER_STORAGE_KEY, "p2", 60_000);
    plantsMock = [];
    tentsMock = [];
    renderSheet();

    expect(screen.queryByTestId("qlv2-recent-target-suggestion")).not.toBeInTheDocument();
  });

  it("follows another tab to the newest remembered plant", () => {
    seed(USER_STORAGE_KEY, "p1", 60_000);
    renderSheet();
    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toHaveTextContent(
      "Continue with Blue Dream?",
    );

    const oldValue = getLocalStorageItemForTest(USER_STORAGE_KEY);
    seed(USER_STORAGE_KEY, "p2", 30_000);
    act(() =>
      dispatchStorageChange(
        USER_STORAGE_KEY,
        oldValue,
        getLocalStorageItemForTest(USER_STORAGE_KEY),
      ),
    );

    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toHaveTextContent(
      "Continue with OG Kush?",
    );
    expect(targetTrigger()).not.toHaveTextContent("Blue Dream");
  });

  it("ignores a storage change under another account's key", () => {
    seed(USER_STORAGE_KEY, "p1", 60_000);
    renderSheet();

    const otherKey = "verdant.quickLog.lastTarget.v2.someone-else";
    seed(otherKey, "p2", 30_000);
    act(() => dispatchStorageChange(otherKey, null, getLocalStorageItemForTest(otherKey)));

    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toHaveTextContent(
      "Continue with Blue Dream?",
    );
  });

  it("never reinterprets a click on one plant as consent for another", () => {
    // The record moves from A to B without its storage event arriving, so the
    // button still reads A. Accepting must redraw B and select nothing — the
    // grower has not consented to B.
    seed(USER_STORAGE_KEY, "p1", 60_000);
    renderSheet();
    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toHaveTextContent(
      "Continue with Blue Dream?",
    );

    seed(USER_STORAGE_KEY, "p2", 30_000);
    fireEvent.click(screen.getByTestId("qlv2-recent-target-accept"));

    expect(targetTrigger()).toHaveTextContent("Choose a tent or plant");
    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toHaveTextContent(
      "Continue with OG Kush?",
    );
  });

  it("retires a rendered offer when its window closes while the sheet stays open", () => {
    // A sheet can sit open across the boundary. Leaving the chip on screen
    // would present an action that silently does nothing.
    seed(USER_STORAGE_KEY, "p2", RECENT_TARGET_SUGGESTION_MAX_AGE_MS - 60_000);
    renderSheet();
    expect(screen.getByTestId("qlv2-recent-target-suggestion")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_001);
    });

    expect(screen.queryByTestId("qlv2-recent-target-suggestion")).not.toBeInTheDocument();
    expect(targetTrigger()).toHaveTextContent("Choose a tent or plant");
  });
});
