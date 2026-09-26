/**
 * A Feed save the server explicitly rejects during validation
 * (`{ ok: false, reason: "invalid_typed_payload" }`) wrote nothing, so the
 * grower must be able to correct it. Before this fix the rejection was
 * treated like an ambiguous transport failure: every input locked, Retry
 * resent the same invalid payload forever, and the pending entry came back
 * after reload (QA 2026-09-24, BUG-002).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import type { QuickLogFeedingEventRpcArgs } from "@/lib/writeFeedingTypedEvent";

const owner = vi.hoisted(() => ({ id: "owner-a" }));
const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: owner.id } }) }));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-a", name: "Plant A", grow_id: "grow-a", tent_id: "tent-a" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-a", name: "Tent A", grow_id: "grow-a" }] }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-a", name: "Grow A" }] }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

const storageKey = `verdant:quick-log:pending-feeding:v1:owner-a`;

function sheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey="plant:plant-a" />
    </QueryClientProvider>,
  );
}

function fill(ph: string) {
  fireEvent.click(screen.getByRole("button", { name: /^Feed$/ }));
  fireEvent.change(screen.getByLabelText("Nutrient line"), { target: { value: "QA-line" } });
  fireEvent.change(screen.getByLabelText("Product 1 name"), {
    target: { value: "QA Product A" },
  });
  fireEvent.change(screen.getByLabelText("Product 1 amount"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Applied volume (ml)"), { target: { value: "750" } });
  fireEvent.change(screen.getByLabelText("pH"), { target: { value: ph } });
}

/** Leave a pending Feed in sessionStorage exactly as a pre-fix build would have. */
async function seedPendingFeedWithPh(ph: number) {
  rpc.mockResolvedValueOnce({ data: null, error: new Error("reply lost") });
  const first = sheet();
  fill("6.2");
  fireEvent.click(screen.getByTestId("qlv2-save"));
  await waitFor(() => expect(screen.getByTestId("qlv2-exact-retry-lock")).toBeVisible());
  const stored = JSON.parse(window.sessionStorage.getItem(storageKey)!);
  stored.payload.ph = ph;
  window.sessionStorage.setItem(storageKey, JSON.stringify(stored));
  first.unmount();
  rpc.mockReset();
  return stored.payload.idempotency_key as string;
}

beforeEach(() => {
  owner.id = "owner-a";
  window.sessionStorage.clear();
  rpc.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("Feed save rejected by server validation", () => {
  it("names an out-of-range pH before any RPC and keeps the form editable", async () => {
    sheet();
    fill("15");
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toHaveTextContent(
        "Feed pH must be between 0 and 14.",
      ),
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qlv2-exact-retry-lock")).toBeNull();
    expect(screen.getByLabelText("pH")).not.toBeDisabled();
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("releases a restored pending Feed when the server answers invalid_typed_payload", async () => {
    const rejectedKey = await seedPendingFeedWithPh(15);
    rpc.mockResolvedValueOnce({
      data: { ok: false, reason: "invalid_typed_payload" },
      error: null,
    });
    sheet();
    expect(screen.getByTestId("qlv2-exact-retry-lock")).toBeVisible();
    expect(screen.getByLabelText("pH")).toBeDisabled();

    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toHaveTextContent(
        "Feed pH must be between 0 and 14.",
      ),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect((rpc.mock.calls[0][1] as QuickLogFeedingEventRpcArgs).p_feed).toMatchObject({ ph: 15 });
    expect(screen.queryByTestId("qlv2-exact-retry-lock")).toBeNull();
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
    const phInput = screen.getByLabelText("pH");
    expect(phInput).not.toBeDisabled();
    expect(phInput).toHaveValue("15");

    // Correct the value: the new save is a new logical submission.
    rpc.mockResolvedValueOnce({
      data: { ok: true, grow_event_id: "0f0c5a0e-7b5c-4b3a-9d55-0d3c4b1e2a11", reused: false },
      error: null,
    });
    fireEvent.change(phInput, { target: { value: "6.2" } });
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(screen.getByTestId("qlv2-post-save")).toBeVisible());
    expect(rpc).toHaveBeenCalledTimes(2);
    const corrected = rpc.mock.calls[1][1] as QuickLogFeedingEventRpcArgs;
    expect(corrected.p_feed).toMatchObject({ ph: 6.2 });
    expect(corrected.p_idempotency_key).not.toBe(rejectedKey);
  });

  it("uses the generic rejection copy when no field is outside the mirrored bounds", async () => {
    await seedPendingFeedWithPh(6.2);
    rpc.mockResolvedValueOnce({
      data: { ok: false, reason: "invalid_typed_payload" },
      error: null,
    });
    sheet();
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() =>
      expect(screen.getByTestId("qlv2-error")).toHaveTextContent(
        "Verdant did not save this feeding because a value is outside the accepted range.",
      ),
    );
    expect(screen.queryByTestId("qlv2-exact-retry-lock")).toBeNull();
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("keeps the exact-retry lock for rejections that are not definitive", async () => {
    await seedPendingFeedWithPh(6.2);
    rpc.mockResolvedValueOnce({
      data: { ok: false, reason: "idempotency_key_conflict" },
      error: null,
    });
    sheet();
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("qlv2-exact-retry-lock")).toBeVisible());
    expect(screen.getByLabelText("pH")).toBeDisabled();
    expect(window.sessionStorage.getItem(storageKey)).not.toBeNull();
  });
});
