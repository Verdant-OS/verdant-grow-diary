/**
 * The remembered target must follow EVERY successful save.
 *
 * The legacy form's write is pinned in quicklog-target-contract. This file
 * covers the other path: "All activity types" has its own save, and wiring
 * only the draft-consume to it left a grower who logs that way being offered
 * an older plant — or nothing — on their next unscoped open, even though they
 * had just used a target.
 *
 * The section itself is stubbed. Its save behaviour is already covered by
 * quick-log-all-activities-integration; what is under test here is QuickLog's
 * handling of the success payload.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

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
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "Tent 1", stage: "veg" }],
    activeGrow: { id: "g1", name: "Tent 1", stage: "veg" },
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "t1", name: "Tent 1", grow_id: "g1" }] }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "p1", name: "Blue Dream", strain: "BD", tent_id: "t1", grow_id: "g1" }],
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));
vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));

// Stub the section down to the one seam under test: its success callback.
let successPayload: {
  activityId: string;
  target: { growId: string; tentId: string | null; plantId: string | null };
  growEventId: string | null;
};
vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: ({ onSaveSuccess }: { onSaveSuccess?: (r: unknown) => void }) => (
    <button
      type="button"
      data-testid="stub-all-activities-save"
      onClick={() => onSaveSuccess?.(successPayload)}
    >
      stub save
    </button>
  ),
}));

import QuickLog from "@/components/QuickLog";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

const KEY = "verdant.quickLog.lastTarget.v2.u1";

function renderQL(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function saveThroughAllActivities() {
  fireEvent.click(screen.getByTestId("stub-all-activities-save"));
}

beforeEach(() => {
  rpcMock.mockClear();
  userMock = { id: "u1" };
  clearLocalStorageForTest();
  successPayload = {
    activityId: "feeding",
    target: { growId: "g1", tentId: "t1", plantId: "p1" },
    growEventId: "e-1",
  };
});
afterEach(() => cleanup());

describe("QuickLog — the All activity types save path", () => {
  it("records the plant it just used as the remembered target", () => {
    renderQL(<QuickLog open onOpenChange={() => {}} />);
    expect(getLocalStorageItemForTest(KEY)).toBeNull();

    saveThroughAllActivities();

    expect(JSON.parse(getLocalStorageItemForTest(KEY) ?? "{}")).toEqual(
      expect.objectContaining({ plantId: "p1", growId: "g1", tentId: "t1" }),
    );
  });

  it("stamps a savedAt the freshness rule can read", () => {
    renderQL(<QuickLog open onOpenChange={() => {}} />);
    saveThroughAllActivities();

    const record = JSON.parse(getLocalStorageItemForTest(KEY) ?? "{}") as { savedAt?: string };
    expect(typeof record.savedAt).toBe("string");
    expect(Number.isFinite(Date.parse(record.savedAt ?? ""))).toBe(true);
  });

  it("remembers nothing when the save had no plant — a target is never invented", () => {
    successPayload = {
      activityId: "environment",
      target: { growId: "g1", tentId: "t1", plantId: null },
      growEventId: "e-2",
    };
    renderQL(<QuickLog open onOpenChange={() => {}} />);

    saveThroughAllActivities();

    expect(getLocalStorageItemForTest(KEY)).toBeNull();
  });

  it("remembers nothing for a signed-out session", () => {
    userMock = null;
    renderQL(<QuickLog open onOpenChange={() => {}} />);

    saveThroughAllActivities();

    expect(getLocalStorageItemForTest(KEY)).toBeNull();
    // And no unscoped key either — the retired v1 write stays retired.
    expect(getLocalStorageItemForTest("verdant.quickLog.lastTarget.v1")).toBeNull();
  });
});
