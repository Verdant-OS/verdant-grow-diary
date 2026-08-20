/**
 * Slice D5 — rendered behaviour of the "Continue with <plant>?" suggestion.
 *
 * The pure rules are covered in quick-log-recent-target-suggestion.test.ts and
 * the wiring is pinned statically in quick-log-recent-target-chip-wiring.test.ts.
 * This file is the missing third leg: it renders QuickLog and proves the
 * remembered target is only ever an OFFER.
 *
 * Fences asserted here:
 *  - a stored target is shown, never silently applied;
 *  - accepting it is an explicit click, and only then is the plant selected;
 *  - dismissing leaves the target empty and the save disabled;
 *  - an expired record, an unknown plant, another account's record, and a
 *    signed-out session all offer nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactElement } from "react";

const rpcMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: () => ({
      insert: vi.fn(),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => {
              const chain: Record<string, unknown> = {
                abortSignal: () => chain,
                then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
                  Promise.resolve({ data: [], error: null }).then(r, j),
              };
              return chain;
            },
          }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));

let userMock: { id: string } | null = { id: "u1" };
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: userMock }) }));

const setActiveGrowIdMock = vi.fn();
// Mutable so a test can archive the remembered plant's grow. `useGrows()`
// returns ACTIVE grows only, so archiving one removes it from this list while
// leaving the plant itself in `usePlants()`.
const ACTIVE_GROW = { id: "g1", name: "Tent 1", stage: "veg" };
let growsMock: Array<Record<string, unknown>> = [ACTIVE_GROW];
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: growsMock,
    activeGrow: growsMock.find((g) => g.id === "g1") ?? null,
    activeGrowId: "g1",
    setActiveGrowId: setActiveGrowIdMock,
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "t1", name: "Tent 1", grow_id: "g1" }] }),
}));
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: plantsMock }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));
vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));

import QuickLog from "@/components/QuickLog";
import { RECENT_TARGET_SUGGESTION_MAX_AGE_MS } from "@/lib/quickLogRecentTargetSuggestion";
import {
  clearLocalStorageForTest,
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

let plantsMock: Array<Record<string, unknown>> = [];

const PLANTS = [
  { id: "p1", name: "Blue Dream", strain: "BD", tent_id: "t1", grow_id: "g1" },
  { id: "p2", name: "OG Kush", strain: "OG", tent_id: "t1", grow_id: "g1" },
];

// Deterministic clock: the component reads Date.now() when it resolves the
// suggestion, so freshness is expressed relative to a frozen NOW.
const NOW = Date.parse("2026-08-19T12:00:00.000Z");

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

function renderQL(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function ReopenableQuickLog() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open Quick Log
      </button>
      <QuickLog open={open} onOpenChange={setOpen} />
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  rpcMock.mockClear();
  setActiveGrowIdMock.mockClear();
  growsMock = [ACTIVE_GROW];
  userMock = { id: "u1" };
  plantsMock = PLANTS;
  clearLocalStorageForTest();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("QuickLog — remembered target is an offer, never a default", () => {
  it("shows the suggestion without selecting the plant", () => {
    seed("verdant.quickLog.lastTarget.v2.u1", "p2", 60_000);
    renderQL(<QuickLog open onOpenChange={() => {}} />);

    expect(screen.getByTestId("quick-log-recent-target-suggestion")).toHaveTextContent(
      "Continue with OG Kush?",
    );
    // Nothing is selected until the grower says so.
    expect(screen.getByTestId("quick-log-plant-select")).not.toHaveTextContent("OG Kush");
    expect(screen.getByTestId("quick-log-plant-error")).toBeInTheDocument();
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("accepting it selects that plant and retires the offer", () => {
    seed("verdant.quickLog.lastTarget.v2.u1", "p2", 60_000);
    renderQL(<QuickLog open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByTestId("quick-log-recent-target-accept"));

    expect(screen.getByTestId("quick-log-plant-select")).toHaveTextContent("OG Kush");
    expect(screen.queryByTestId("quick-log-recent-target-suggestion")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-log-plant-error")).not.toBeInTheDocument();
    // Accepting selects. It does not save.
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("dismissing it leaves the target empty and the save disabled", () => {
    seed("verdant.quickLog.lastTarget.v2.u1", "p2", 60_000);
    renderQL(<QuickLog open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByTestId("quick-log-recent-target-dismiss"));

    expect(screen.queryByTestId("quick-log-recent-target-suggestion")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-log-plant-select")).not.toHaveTextContent("OG Kush");
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
  });

  it("offers the remembered target again in a new session after Choose another", () => {
    seed("verdant.quickLog.lastTarget.v2.u1", "p2", 60_000);
    renderQL(<ReopenableQuickLog />);

    fireEvent.click(screen.getByTestId("quick-log-recent-target-dismiss"));
    expect(screen.queryByTestId("quick-log-recent-target-suggestion")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Quick Log" }));

    expect(screen.getByTestId("quick-log-recent-target-suggestion")).toHaveTextContent(
      "Continue with OG Kush?",
    );
    expect(screen.getByTestId("quick-log-plant-select")).not.toHaveTextContent("OG Kush");
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
  });

  it("offers the remembered target again without preselecting it after an accepted session closes", () => {
    seed("verdant.quickLog.lastTarget.v2.u1", "p2", 60_000);
    renderQL(<ReopenableQuickLog />);

    fireEvent.click(screen.getByTestId("quick-log-recent-target-accept"));
    expect(screen.getByTestId("quick-log-plant-select")).toHaveTextContent("OG Kush");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Quick Log" }));

    expect(screen.getByTestId("quick-log-recent-target-suggestion")).toHaveTextContent(
      "Continue with OG Kush?",
    );
    expect(screen.getByTestId("quick-log-plant-select")).not.toHaveTextContent("OG Kush");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("offers nothing once the record is past its freshness window", () => {
    seed("verdant.quickLog.lastTarget.v2.u1", "p2", RECENT_TARGET_SUGGESTION_MAX_AGE_MS + 1);
    renderQL(<QuickLog open onOpenChange={() => {}} />);

    expect(screen.getByTestId("quick-log-plant-select")).toBeInTheDocument();
    expect(screen.queryByTestId("quick-log-recent-target-suggestion")).not.toBeInTheDocument();
  });

  it("offers nothing when the remembered plant is no longer visible to the grower", () => {
    seed("verdant.quickLog.lastTarget.v2.u1", "p-deleted", 60_000);
    renderQL(<QuickLog open onOpenChange={() => {}} />);

    expect(screen.getByTestId("quick-log-plant-select")).toBeInTheDocument();
    expect(screen.queryByTestId("quick-log-recent-target-suggestion")).not.toBeInTheDocument();
  });

  it("offers nothing when the remembered plant's GROW has been archived", () => {
    // Archiving a grow updates only the `grows` row, so p1 is still visible in
    // `usePlants()` — the plant lookup alone cannot catch this. Accepting would
    // call setActiveGrowId("g1"), which GrowsProvider does not recognise and
    // replaces with a different grow, stranding the grower.
    growsMock = [{ id: "g2", name: "Other Tent", stage: "veg" }];
    seed("verdant.quickLog.lastTarget.v2.u1", "p1", 60_000);
    renderQL(<QuickLog open onOpenChange={() => {}} />);

    // Positive control: the plant select still renders, so "nothing found" is
    // not passing as "the offer was correctly withheld".
    expect(screen.getByTestId("quick-log-plant-select")).toBeInTheDocument();
    expect(screen.queryByTestId("quick-log-recent-target-suggestion")).not.toBeInTheDocument();
    expect(setActiveGrowIdMock).not.toHaveBeenCalled();
  });

  it("never reads another account's remembered target", () => {
    seed("verdant.quickLog.lastTarget.v2.someone-else", "p2", 60_000);
    renderQL(<QuickLog open onOpenChange={() => {}} />);

    // Same plant, same freshness as the offered case above — only the account
    // segment differs, so this can only pass because the key is scoped.
    expect(screen.getByTestId("quick-log-plant-select")).toBeInTheDocument();
    expect(screen.queryByTestId("quick-log-recent-target-suggestion")).not.toBeInTheDocument();
  });

  it("offers nothing to a signed-out session", () => {
    userMock = null;
    seed("verdant.quickLog.lastTarget.v2.u1", "p2", 60_000);
    renderQL(<QuickLog open onOpenChange={() => {}} />);

    expect(screen.getByTestId("quick-log-plant-select")).toBeInTheDocument();
    expect(screen.queryByTestId("quick-log-recent-target-suggestion")).not.toBeInTheDocument();
  });

  it("is still offered for an activity-only prefill, which scopes nothing", () => {
    // AppShell sends `{ eventType }` for a context-free Fast Add. It preselects
    // a form, not a target, so this is exactly the unscoped open the
    // suggestion exists for. A truthiness test on `prefill` withheld it here.
    seed("verdant.quickLog.lastTarget.v2.u1", "p2", 60_000);
    renderQL(<QuickLog open onOpenChange={() => {}} prefill={{ eventType: "feeding" }} />);

    expect(screen.getByTestId("quick-log-recent-target-suggestion")).toHaveTextContent(
      "Continue with OG Kush?",
    );
  });

  it("is withheld when the prefill names a grow or a tent but no plant", () => {
    // Not a named plant, but not unscoped either — the grower already said
    // where they are. Offering a plant here would widen their context for them.
    for (const prefill of [{ growId: "g1" }, { tentId: "t1" }]) {
      cleanup();
      seed("verdant.quickLog.lastTarget.v2.u1", "p2", 60_000);
      renderQL(<QuickLog open onOpenChange={() => {}} prefill={prefill} />);
      expect(screen.getByTestId("quick-log-plant-select")).toBeInTheDocument();
      expect(screen.queryByTestId("quick-log-recent-target-suggestion")).not.toBeInTheDocument();
    }
  });

  it("is not offered when the dialog opens with a route prefill", () => {
    seed("verdant.quickLog.lastTarget.v2.u1", "p2", 60_000);
    renderQL(
      <QuickLog
        open
        onOpenChange={() => {}}
        prefill={{ plantId: "p1", growId: "g1", tentId: "t1" }}
      />,
    );

    // The prefill won: Blue Dream is selected, and OG Kush was never offered.
    expect(screen.getByTestId("quick-log-plant-select")).toHaveTextContent("Blue Dream");
    expect(screen.queryByTestId("quick-log-recent-target-suggestion")).not.toBeInTheDocument();
  });

  it("revalidates freshness at the moment of acceptance, not at open", () => {
    // The dialog can sit open across the 14-day boundary. A value captured at
    // open would let an expired target through on a click made later.
    seed("verdant.quickLog.lastTarget.v2.u1", "p2", RECENT_TARGET_SUGGESTION_MAX_AGE_MS - 60_000);
    renderQL(<QuickLog open onOpenChange={() => {}} />);
    expect(screen.getByTestId("quick-log-recent-target-suggestion")).toBeInTheDocument();

    // Time passes while the sheet stays open; the record is now stale.
    vi.setSystemTime(NOW + 120_000);
    fireEvent.click(screen.getByTestId("quick-log-recent-target-accept"));

    // The offer is retired rather than applied — no plant is selected.
    expect(screen.queryByTestId("quick-log-recent-target-suggestion")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-log-plant-select")).not.toHaveTextContent("OG Kush");
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("still accepts a target that is fresh at click time", () => {
    seed("verdant.quickLog.lastTarget.v2.u1", "p2", RECENT_TARGET_SUGGESTION_MAX_AGE_MS - 600_000);
    renderQL(<QuickLog open onOpenChange={() => {}} />);

    vi.setSystemTime(NOW + 60_000);
    fireEvent.click(screen.getByTestId("quick-log-recent-target-accept"));

    expect(screen.getByTestId("quick-log-plant-select")).toHaveTextContent("OG Kush");
  });
});
