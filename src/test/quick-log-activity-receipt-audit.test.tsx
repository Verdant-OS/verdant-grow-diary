import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuickLogActivitySave } from "@/hooks/useQuickLogActivitySave";

const h = vi.hoisted(() => ({ rpc: vi.fn(), telemetry: vi.fn(), event: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc } }));
vi.mock("@/lib/quickLogSuccessTelemetry", () => ({ trackQuickLogSuccess: h.telemetry }));
beforeEach(() => {
  vi.clearAllMocks();
  window.addEventListener("verdant:entry-created", h.event);
});
afterEach(() => {
  cleanup();
  window.removeEventListener("verdant:entry-created", h.event);
});

const validId = "77777777-7777-4777-8777-000000000001";
const malformed = [
  { name: "missing ID", data: { ok: true } },
  { name: "null ID", data: { ok: true, grow_event_id: null } },
  { name: "blank ID", data: { ok: true, grow_event_id: " " } },
  { name: "object ID", data: { ok: true, grow_event_id: {} } },
  { name: "non-UUID ID", data: { ok: true, grow_event_id: "not-an-event-id" } },
  { name: "string false", data: { ok: "false", grow_event_id: validId } },
  { name: "numeric ok", data: { ok: 1, grow_event_id: validId } },
];

describe.each(["note", "training"] as const)("%s receipt audit", (activityId) => {
  it.each(malformed)("does not confirm $name", async ({ data }) => {
    h.rpc.mockResolvedValue({ data, error: null });
    const { result } = renderHook(() => useQuickLogActivitySave());
    let receipt;
    await act(async () => {
      receipt = await result.current.save({
        activityId,
        growId: "11111111-1111-4111-8111-111111111111",
        plantId: "33333333-3333-4333-8333-333333333333",
        idempotencyKey: "receipt-audit-logical-save",
        note: "Synthetic receipt audit",
      });
    });
    expect(receipt).toMatchObject({ ok: false });
    expect(h.telemetry).not.toHaveBeenCalled();
    expect(h.event).not.toHaveBeenCalled();
  });
  it("accepts a structured boolean success with a UUID receipt", async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, grow_event_id: validId }, error: null });
    const { result } = renderHook(() => useQuickLogActivitySave());
    let receipt;
    await act(async () => {
      receipt = await result.current.save({
        activityId,
        growId: "11111111-1111-4111-8111-111111111111",
        plantId: "33333333-3333-4333-8333-333333333333",
        idempotencyKey: "receipt-audit-logical-save",
        note: "Synthetic receipt audit",
      });
    });
    expect(receipt).toMatchObject({ ok: true, growEventId: validId });
    expect(h.event).toHaveBeenCalledTimes(1);
  });
});
