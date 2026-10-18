import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import {
  setLocalStorageItemForTest,
  clearLocalStorageForTest,
} from "./helpers/localStorageTestHelper";

const saveMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());
const trackSuccessMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/quickLogSuccessTelemetry", () => ({
  trackQuickLogSuccess: trackSuccessMock,
}));
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

import QuickLog, { type QuickLogPrefill } from "@/components/QuickLog";
import {
  PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY,
  serializePublicQuickLogStarterDraft,
  type PublicQuickLogStarterDraft,
} from "@/lib/publicQuickLogStarterRules";
import { QUICK_LOG_WATER_VOLUME_TOO_LARGE_MESSAGE } from "@/lib/quickLogWateringFormViewModel";

/**
 * Codex P1 on #2110: a resumed public-starter watering draft goes through the
 * legacy QuickLog editor, whose submit and adapter only checked "finite and
 * positive". Editing a valid 250 ml draft to 1,000,000 ml must be refused with
 * the shared single-watering ceiling message and must not reach any save.
 */
const draft: PublicQuickLogStarterDraft = {
  v: 1,
  id: "draft-water-max",
  createdAt: "2026-10-14T21:00:00.000Z",
  updatedAt: "2026-10-14T21:00:00.000Z",
  plantNickname: "Test Plant",
  stage: "",
  logType: "watering",
  note: "Starter water",
  wateringVolumeMl: 250,
  attribution: {},
};
const prefill: QuickLogPrefill = {
  plantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  plantName: "Test Plant",
  growId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  tentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  eventType: "watering",
  note: "Starter water",
  wateringVolumeMl: 250,
  suggestSnapshot: false,
  source: "public-starter",
  publicStarterDraftId: draft.id,
  publicStarterDraftUpdatedAt: draft.updatedAt,
};

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  clearLocalStorageForTest();
  window.sessionStorage.clear();
  saveMock.mockReset();
  rpcMock.mockReset();
  setLocalStorageItemForTest(
    PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY,
    serializePublicQuickLogStarterDraft(draft),
  );
});
afterEach(() => {
  clearLocalStorageForTest();
});

describe("legacy public-starter Water volume ceiling", () => {
  it("refuses an edited 1,000,000 ml volume before any save", async () => {
    renderWithClient(<QuickLog open onOpenChange={vi.fn()} prefill={prefill} />);
    const input = (await screen.findByTestId("quicklog-watering-ml")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("250"));
    fireEvent.change(input, { target: { value: "1000000" } });
    fireEvent.click(screen.getByTestId("quick-log-save"));
    await waitFor(() =>
      expect(screen.getByTestId("quicklog-watering-error")).toHaveTextContent(
        QUICK_LOG_WATER_VOLUME_TOO_LARGE_MESSAGE,
      ),
    );
    expect(screen.getByTestId("quick-log-save-error")).toHaveTextContent(
      QUICK_LOG_WATER_VOLUME_TOO_LARGE_MESSAGE,
    );
    expect(saveMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
