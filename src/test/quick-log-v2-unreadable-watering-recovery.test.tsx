/**
 * CodeRabbit on #2110: an over-ceiling typed Water journal (written before the
 * 50,000 ml ceiling) reads as `blocked`, and Water stayed unavailable with no
 * way out. The sheet now offers "Check Timeline, then clear": it removes only
 * this owner's unreadable key, never sends the record, and unblocks Water.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import {
  QUICK_LOG_WATER_RECOVERY_UNREADABLE_CLEAR_LABEL,
  QUICK_LOG_WATER_RECOVERY_UNREADABLE_HELPER,
} from "@/constants/quickLogWaterRecoveryCopy";
import { starterWaterRecoveryKey, typedWaterRecoveryKey } from "@/lib/quickLogWaterRecoveryKeys";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

vi.setConfig({ testTimeout: 15_000 });

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const plantId = "33333333-3333-4333-8333-333333333333";
const tentId = "55555555-5555-4555-8555-555555555555";
const growId = "66666666-6666-4666-8666-666666666666";
const at = "2026-09-17T03:00:00.000Z";

const rpcMock = vi.hoisted(() => vi.fn());
const wateringWriterMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
    from: () => ({ insert: vi.fn() }),
  },
}));
vi.mock("@/lib/writeQuickLogWateringTypedEvent", () => ({
  writeQuickLogWateringTypedEvent: (...args: unknown[]) => wateringWriterMock(...args),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    isLoading: false,
    isError: false,
    data: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Plant 1",
        strain: "Oreoz",
        tent_id: "55555555-5555-4555-8555-555555555555",
        grow_id: "66666666-6666-4666-8666-666666666666",
        stage: "flowering",
        medium: "coco coir",
        pot_size: "5 gal",
      },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "Tent 1",
        grow_id: "66666666-6666-4666-8666-666666666666",
        stage: "vegetative",
      },
    ],
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "66666666-6666-4666-8666-666666666666", name: "Home Run", stage: "seedling" }],
  }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const typed = (ownerId: string, volume: number) =>
  JSON.stringify({
    version: 1,
    ownerId,
    createdAt: at,
    payload: {
      idempotency_key: "typed-water-key-1234",
      grow_id: growId,
      tent_id: tentId,
      plant_id: plantId,
      occurred_at: at,
      volume_ml: volume,
    },
    resolved: { ok: true, targetType: "plant", targetId: plantId, plantId, tentId, growId },
    attachments: { photo: false, video: false },
  });

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey={`plant:${plantId}`} />
    </QueryClientProvider>,
  );
}

const originalLocks = Object.getOwnPropertyDescriptor(window.navigator, "locks");
beforeEach(() => {
  window.sessionStorage.clear();
  clearLocalStorageForTest();
  rpcMock.mockReset();
  wateringWriterMock.mockReset();
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
  window.sessionStorage.clear();
  if (originalLocks) Object.defineProperty(window.navigator, "locks", originalLocks);
  else Reflect.deleteProperty(window.navigator, "locks");
});

describe("Quick Log V2: unreadable typed Water recovery", () => {
  it("clears only this owner's over-ceiling journal, sends nothing, and unblocks Water", async () => {
    window.sessionStorage.setItem(typedWaterRecoveryKey(ownerA), typed(ownerA, 1_000_000));
    window.sessionStorage.setItem(typedWaterRecoveryKey(ownerB), typed(ownerB, 1_000_000));
    renderSheet();

    const panel = await screen.findByTestId("qlv2-watering-unreadable-recovery");
    expect(panel).toHaveTextContent(QUICK_LOG_WATER_RECOVERY_UNREADABLE_HELPER);
    const clear = screen.getByTestId("qlv2-watering-clear-unreadable");
    expect(clear).toHaveTextContent(QUICK_LOG_WATER_RECOVERY_UNREADABLE_CLEAR_LABEL);

    fireEvent.click(clear);

    await waitFor(() =>
      expect(screen.queryByTestId("qlv2-watering-unreadable-recovery")).not.toBeInTheDocument(),
    );
    expect(window.sessionStorage.getItem(typedWaterRecoveryKey(ownerA))).toBeNull();
    expect(window.sessionStorage.getItem(typedWaterRecoveryKey(ownerB))).toBe(
      typed(ownerB, 1_000_000),
    );
    expect(window.sessionStorage.getItem(starterWaterRecoveryKey(ownerA))).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(wateringWriterMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qlv2-error")).not.toBeInTheDocument();
  });

  it("does not offer the escape for a readable journal", async () => {
    window.sessionStorage.setItem(typedWaterRecoveryKey(ownerA), typed(ownerA, 600));
    renderSheet();
    await screen.findByTestId("qlv2-error");
    expect(screen.queryByTestId("qlv2-watering-unreadable-recovery")).not.toBeInTheDocument();
  });
});
