/**
 * Note and Quick Log saves share one in-flight call and do not write the
 * same payload twice. Auth, storage, and the network are mocked.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: null, session: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
    storage: {
      from: () => ({
        upload: vi.fn(),
        remove: vi.fn(),
      }),
    },
  },
}));

import { useQuickLogActivitySave } from "@/hooks/useQuickLogActivitySave";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";
import type { QuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";

const EVENT_ID = "77777777-7777-4777-8777-000000000009";

function notePayload(
  key: string,
  occurredAt: string,
  note = "Leaves look pale",
): QuickLogV2SavePayload {
  return {
    p_target_type: "plant",
    p_target_id: "plant-1",
    p_action: "note",
    p_volume_ml: null,
    p_note: note,
    p_temperature_c: null,
    p_humidity_pct: null,
    p_vpd_kpa: null,
    p_occurred_at: occurredAt,
    p_idempotency_key: key,
  };
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }),
  });
});

describe("useQuickLogV2Save duplicate note guard", () => {
  it("keeps a second tap on the in-flight promise and does not write the same note again", async () => {
    let release: (value: {
      data: { ok: true; grow_event_id: string; reused: false };
      error: null;
    }) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    rpcMock.mockReturnValue(pending);
    const { result } = renderHook(() => useQuickLogV2Save());
    const first = result.current.save(
      notePayload("quicklog-v2-first-key1", "2026-10-31T04:00:00.000Z"),
    );
    const second = result.current.save(
      notePayload("quicklog-v2-second-key", "2026-10-31T04:01:00.000Z"),
    );
    expect(rpcMock).toHaveBeenCalledTimes(1);

    release({ data: { ok: true, grow_event_id: EVENT_ID, reused: false }, error: null });
    await Promise.all([first, second]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.saving).toBe(false);

    let third!: Awaited<typeof first>;
    await act(async () => {
      third = await result.current.save(
        notePayload("quicklog-v2-third-keyy", "2026-10-31T04:02:00.000Z"),
      );
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(third.ok).toBe(true);
    expect(third.reused).toBe(true);
    expect(third.growEventId).toBe(EVENT_ID);
  });

  it("retries a failed note and allows a different note", async () => {
    rpcMock
      .mockResolvedValueOnce({ data: { ok: false, reason: "save_failed" }, error: null })
      .mockResolvedValueOnce({
        data: { ok: true, grow_event_id: EVENT_ID, reused: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000010", reused: false },
        error: null,
      });
    const { result } = renderHook(() => useQuickLogV2Save());
    const same = notePayload("quicklog-v2-retry-key", "2026-10-31T04:00:00.000Z");
    await act(async () => {
      await result.current.save(same);
    });
    await act(async () => {
      await result.current.save(same);
    });
    await act(async () => {
      await result.current.save(
        notePayload("quicklog-v2-other-key", "2026-10-31T04:03:00.000Z", "Different note"),
      );
    });
    expect(rpcMock).toHaveBeenCalledTimes(3);
  });
});

describe("useQuickLogActivitySave duplicate note guard", () => {
  it("joins an in-flight note and still allows the same note after it commits", async () => {
    let release: (value: {
      data: { ok: true; grow_event_id: string; reused: false };
      error: null;
    }) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    rpcMock.mockReturnValueOnce(pending).mockResolvedValue({
      data: { ok: true, grow_event_id: EVENT_ID, reused: false },
      error: null,
    });
    const { result } = renderHook(() => useQuickLogActivitySave());
    const input = {
      activityId: "note" as const,
      growId: "grow-1",
      plantId: "plant-1",
      note: "QA note",
      idempotencyKey: "activity-note-key-1",
      occurredAt: "2026-10-31T04:00:00.000Z",
    };
    const first = result.current.save(input);
    const second = result.current.save({
      ...input,
      idempotencyKey: "activity-note-key-2",
      occurredAt: "2026-10-31T04:01:00.000Z",
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    release({ data: { ok: true, grow_event_id: EVENT_ID, reused: false }, error: null });
    await Promise.all([first, second]);
    await act(async () => {
      await result.current.save({
        ...input,
        idempotencyKey: "activity-note-key-3",
        occurredAt: "2026-10-31T04:02:00.000Z",
      });
    });
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[0][0]).toBe("quicklog_save_manual");
  });
});
