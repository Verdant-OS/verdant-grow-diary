/**
 * A Note refused with receipt_target_moved keeps the verified current scope of
 * the original entry in its pending journal. A reload or sheet remount must
 * rebuild the history-review link from that scope, never from the draft's
 * original target, or the grower reviews the wrong Timeline before discarding.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import type { PendingQuickLogNote } from "@/lib/quickLogPendingNoteStore";

const ownerId = "11111111-1111-4111-8111-111111111111";
const plantA = "33333333-3333-4333-8333-333333333333";
const tentA = "55555555-5555-4555-8555-555555555555";
const growA = "66666666-6666-4666-8666-666666666666";
const plantB = "33333333-3333-4333-8333-3333333333bb";
const tentB = "55555555-5555-4555-8555-5555555555bb";
const growB = "66666666-6666-4666-8666-6666666666bb";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => {
      throw new Error("No reads expected while restoring a history-review draft");
    },
  },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Plant A",
        grow_id: "66666666-6666-4666-8666-666666666666",
        tent_id: "55555555-5555-4555-8555-555555555555",
      },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "Tent A",
        grow_id: "66666666-6666-4666-8666-666666666666",
      },
    ],
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "66666666-6666-4666-8666-666666666666", name: "Grow A" }],
  }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const noteKey = `verdant:quick-log:pending-note:v1:${ownerId}`;

function movedNoteRecord(): PendingQuickLogNote {
  return {
    version: 1,
    ownerId,
    createdAt: "2026-09-01T12:00:00.000Z",
    payload: {
      p_target_type: "plant",
      p_target_id: plantA,
      p_action: "note",
      p_volume_ml: null,
      p_note: "Possibly saved original",
      p_temperature_c: null,
      p_humidity_pct: null,
      p_vpd_kpa: null,
      p_occurred_at: "2026-09-01T12:00:00.000Z",
      p_details: { source: "manual" },
      p_stage: null,
      p_idempotency_key: "moved-note-key-12345678",
    },
    resolved: {
      ok: true,
      targetType: "plant",
      targetId: plantA,
      plantId: plantA,
      tentId: tentA,
      growId: growA,
    },
    attachments: { photo: false, video: false },
    historyCheckReason: "receipt_target_moved",
    historyReviewTarget: { growId: growB, tentId: tentB, plantId: plantB },
  };
}

function sheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey={`plant:${plantA}`} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  rpc.mockReset();
});
afterEach(cleanup);

describe("Note receipt_target_moved history review after reload", () => {
  it("links to the verified destination restored from the journal, not the draft target", () => {
    window.sessionStorage.setItem(noteKey, JSON.stringify(movedNoteRecord()));
    sheet();
    const href = screen.getByTestId("qlv2-history-review-link").getAttribute("href")!;
    expect(href).toContain(growB);
    expect(href).toContain(`plantId=${plantB}`);
    expect(href).not.toContain(plantA);
    expect(href).not.toContain(growA);
    expect(screen.getByTestId("qlv2-save")).toBeDisabled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
