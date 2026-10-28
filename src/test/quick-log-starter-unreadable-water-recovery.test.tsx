/**
 * CodeRabbit on #2110 (quickLogPendingStarterWaterStore.ts:108): an older
 * starter Water recovery record over the ceiling reads as `blocked`; QuickLog
 * rejected Water for that state with no retry and no clear. The grower can now
 * "Check Timeline, then clear": only this owner's unreadable starter key is
 * removed, nothing is sent to quicklog_save_manual, and Water unblocks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const saveMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/quickLogSuccessTelemetry", () => ({ trackQuickLogSuccess: vi.fn() }));
vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: (...args: unknown[]) => saveMock(...args),
    saving: false,
    error: null,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: rpcMock,
    from: () => ({
      insert: vi.fn(),
      update: () => ({ eq: vi.fn() }),
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => {
              const query: any = {
                abortSignal: () => query,
                then: (resolve: any, reject?: any) =>
                  Promise.resolve({ data: [], error: null }).then(resolve, reject),
              };
              return query;
            },
          }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Test Grow", stage: "veg" }],
    activeGrow: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Test Grow", stage: "veg" },
    activeGrowId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Test Plant",
        tent_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        grow_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "Test Tent",
        grow_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    ],
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));

import QuickLog from "@/components/QuickLog";
import {
  QUICK_LOG_WATER_RECOVERY_UNREADABLE_CLEAR_LABEL,
  QUICK_LOG_WATER_RECOVERY_UNREADABLE_HELPER,
} from "@/constants/quickLogWaterRecoveryCopy";
import { STARTER_WATER_RECOVERY_UNAVAILABLE } from "@/lib/quickLogPendingStarterWaterStore";
import { starterWaterRecoveryKey, typedWaterRecoveryKey } from "@/lib/quickLogWaterRecoveryKeys";

const plantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const starter = (ownerId: string, volume: number) =>
  JSON.stringify({
    version: 1,
    ownerId,
    createdAt: "2026-09-26T04:00:00.000Z",
    payload: {
      p_target_type: "plant",
      p_target_id: plantId,
      p_action: "water",
      p_volume_ml: volume,
      p_note: "Starter Water",
      p_temperature_c: null,
      p_humidity_pct: null,
      p_vpd_kpa: null,
      p_occurred_at: "2026-09-26T04:00:00.000Z",
      p_idempotency_key: "original-water-key",
    },
    target: {
      plantId,
      growId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      tentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    },
    plantName: "Test Plant",
    tentName: "Test Tent",
    growName: "Test Grow",
    stageWasUserTouched: false,
    reviewedDraftId: null,
    reviewedDraftUpdatedAt: null,
  });

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const originalLocks = Object.getOwnPropertyDescriptor(window.navigator, "locks");
beforeEach(() => {
  clearLocalStorageForTest();
  window.sessionStorage.clear();
  saveMock.mockReset();
  rpcMock.mockReset();
  let tail: Promise<unknown> = Promise.resolve();
  Object.defineProperty(window.navigator, "locks", {
    configurable: true,
    value: {
      request: (_name: string, _options: unknown, callback: () => unknown) => {
        const turn = tail.then(callback);
        tail = turn.then(
          () => undefined,
          () => undefined,
        );
        return turn;
      },
    },
  });
});
afterEach(() => {
  clearLocalStorageForTest();
  window.sessionStorage.clear();
  if (originalLocks) Object.defineProperty(window.navigator, "locks", originalLocks);
  else Reflect.deleteProperty(window.navigator, "locks");
});

describe("QuickLog: unreadable starter Water recovery", () => {
  it("clears only this owner's over-ceiling key, never calls quicklog_save_manual, and unblocks", async () => {
    window.sessionStorage.setItem(starterWaterRecoveryKey("user-1"), starter("user-1", 1_000_000));
    window.sessionStorage.setItem(starterWaterRecoveryKey("user-2"), starter("user-2", 1_000_000));
    window.sessionStorage.setItem(typedWaterRecoveryKey("user-2"), "{other owner}");
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);

    const panel = await screen.findByTestId("quick-log-starter-water-recovery");
    expect(panel).toHaveTextContent(STARTER_WATER_RECOVERY_UNAVAILABLE);
    expect(panel).toHaveTextContent(QUICK_LOG_WATER_RECOVERY_UNREADABLE_HELPER);
    expect(screen.queryByTestId("quick-log-starter-water-retry")).not.toBeInTheDocument();
    const clear = screen.getByTestId("quick-log-starter-water-clear-unreadable");
    expect(clear).toHaveTextContent(QUICK_LOG_WATER_RECOVERY_UNREADABLE_CLEAR_LABEL);

    fireEvent.click(clear);

    await waitFor(() =>
      expect(screen.queryByTestId("quick-log-starter-water-recovery")).not.toBeInTheDocument(),
    );
    expect(window.sessionStorage.getItem(starterWaterRecoveryKey("user-1"))).toBeNull();
    expect(window.sessionStorage.getItem(starterWaterRecoveryKey("user-2"))).toBe(
      starter("user-2", 1_000_000),
    );
    expect(window.sessionStorage.getItem(typedWaterRecoveryKey("user-2"))).toBe("{other owner}");
    expect(rpcMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.queryByText(STARTER_WATER_RECOVERY_UNAVAILABLE)).not.toBeInTheDocument();
  });

  it("keeps a readable starter record on Retry without the clear escape", async () => {
    window.sessionStorage.setItem(starterWaterRecoveryKey("user-1"), starter("user-1", 250));
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} />);
    await screen.findByTestId("quick-log-starter-water-retry");
    expect(
      screen.queryByTestId("quick-log-starter-water-clear-unreadable"),
    ).not.toBeInTheDocument();
  });
});
