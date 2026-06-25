/**
 * createQuickLogEvent — atomic RPC contract tests.
 *
 * The writer is now a thin client over `public.quicklog_save_event`. These
 * tests assert:
 *   - sensor snapshot is fetched (via the snapshot RPC) and passed to the
 *     save RPC verbatim, preserving source + captured_at
 *   - canonical event type mapping is applied
 *   - idempotency_key is forwarded
 *   - reused responses surface the same grow_event_id
 *   - reason codes are translated to user-meaningful errors
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createQuickLogEvent,
  QUICK_LOG_EVENT_TYPE_MAP,
  type QuickLogEventType,
} from "@/lib/quick-log/createQuickLogEvent";

type Result = { data: unknown; error: unknown };

const state = {
  saveRpc: {
    data: { ok: true, grow_event_id: "event-1", reused: false },
    error: null,
  } as Result,
  snapshotRpc: { data: null, error: null } as Result,
};

const rpcSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcSpy(fn, args);
      if (fn === "quicklog_save_event") return Promise.resolve(state.saveRpc);
      if (fn === "get_latest_tent_sensor_snapshot")
        return Promise.resolve(state.snapshotRpc);
      return Promise.resolve({ data: null, error: null });
    },
  },
}));

const baseInput = {
  growId: "grow-abc",
  idempotencyKey: "idem-key-abcdef-0001",
};

function getSaveCall() {
  const call = rpcSpy.mock.calls.find((c) => c[0] === "quicklog_save_event");
  return call ? (call[1] as Record<string, unknown>) : null;
}

beforeEach(() => {
  rpcSpy.mockClear();
  state.saveRpc = {
    data: { ok: true, grow_event_id: "event-1", reused: false },
    error: null,
  };
  state.snapshotRpc = { data: null, error: null };
});

describe("createQuickLogEvent — RPC contract", () => {
  it("forwards canonical event type, ids, note, and idempotency key", async () => {
    const out = await createQuickLogEvent({
      ...baseInput,
      tentId: "tent-1",
      plantId: "plant-1",
      eventType: "water",
      note: "  half gallon ",
    });
    expect(out).toEqual({ id: "event-1", reused: false });
    const args = getSaveCall();
    expect(args).toMatchObject({
      p_idempotency_key: baseInput.idempotencyKey,
      p_grow_id: "grow-abc",
      p_tent_id: "tent-1",
      p_plant_id: "plant-1",
      p_event_type: "watering",
      p_note: "  half gallon ",
      p_photo_url: null,
    });
  });

  it("maps every quick-log event type deterministically (note → observation)", async () => {
    const cases: [QuickLogEventType, string][] = [
      ["observe", "observation"],
      ["water", "watering"],
      ["feed", "feeding"],
      ["photo", "photo"],
      ["note", "observation"],
    ];
    expect(QUICK_LOG_EVENT_TYPE_MAP).toEqual({
      observe: "observation",
      water: "watering",
      feed: "feeding",
      photo: "photo",
      note: "observation",
    });
    for (const [ui, canonical] of cases) {
      rpcSpy.mockClear();
      await createQuickLogEvent({ ...baseInput, eventType: ui });
      expect(getSaveCall()?.p_event_type).toBe(canonical);
    }
  });

  it("attaches details.kind='note' (preserving original_event_type) only for note-style logs", async () => {
    await createQuickLogEvent({
      ...baseInput,
      eventType: "note",
      note: "leaves looking a bit droopy",
    });
    const noteCall = getSaveCall();
    expect(noteCall?.p_event_type).toBe("observation");
    expect(noteCall?.p_details).toEqual({
      kind: "note",
      original_event_type: "note",
    });
    // Note text must be preserved verbatim, not lost in mapping.
    expect(noteCall?.p_note).toBe("leaves looking a bit droopy");

    for (const ui of ["observe", "water", "feed", "photo"] as const) {
      rpcSpy.mockClear();
      await createQuickLogEvent({ ...baseInput, eventType: ui });
      expect(getSaveCall()?.p_details).toBeNull();
    }
  });

  it("translates invalid_event_type reason from the RPC", async () => {
    state.saveRpc = {
      data: { ok: false, reason: "invalid_event_type" },
      error: null,
    };
    await expect(
      createQuickLogEvent({ ...baseInput, eventType: "observe" }),
    ).rejects.toThrow(/invalid_event_type/);
  });

  it("note-style idempotency replay still returns the original event id", async () => {
    state.saveRpc = {
      data: { ok: true, grow_event_id: "event-1", reused: true },
      error: null,
    };
    const out = await createQuickLogEvent({
      ...baseInput,
      eventType: "note",
      note: "second click",
    });
    expect(out).toEqual({ id: "event-1", reused: true });
    expect(getSaveCall()?.p_event_type).toBe("observation");
  });

  it("does not fetch or send a snapshot when tentId is absent", async () => {
    await createQuickLogEvent({ ...baseInput, eventType: "observe" });
    expect(
      rpcSpy.mock.calls.some((c) => c[0] === "get_latest_tent_sensor_snapshot"),
    ).toBe(false);
    expect(getSaveCall()?.p_sensor_snapshot).toBeNull();
  });

  it("omits sensor snapshot when readings are absent (never fakes data)", async () => {
    state.snapshotRpc = { data: null, error: null };
    await createQuickLogEvent({
      ...baseInput,
      tentId: "tent-1",
      eventType: "observe",
    });
    expect(getSaveCall()?.p_sensor_snapshot).toBeNull();
  });

  it("preserves snapshot source + captured_at verbatim and never relabels to live", async () => {
    state.snapshotRpc = {
      data: {
        captured_at: "2026-06-09T12:00:00Z",
        source: "csv",
        temperature: 24.3,
        humidity: 55,
        vpd: null,
        soil_temp: null,
        soil_ec: null,
        ppfd: null,
      },
      error: null,
    };
    await createQuickLogEvent({
      ...baseInput,
      tentId: "tent-1",
      eventType: "observe",
    });
    const snap = getSaveCall()?.p_sensor_snapshot as {
      source: string;
      captured_at: string;
      metrics: Record<string, number>;
    };
    expect(snap.source).toBe("csv");
    expect(snap.source).not.toBe("live");
    expect(snap.captured_at).toBe("2026-06-09T12:00:00Z");
    expect(snap.metrics).toEqual({ temperature: 24.3, humidity: 55 });
  });

  it("returns reused=true when the RPC replays a duplicate save", async () => {
    state.saveRpc = {
      data: { ok: true, grow_event_id: "event-1", reused: true },
      error: null,
    };
    const out = await createQuickLogEvent({
      ...baseInput,
      eventType: "note",
    });
    expect(out).toEqual({ id: "event-1", reused: true });
  });

  it("translates not_authenticated reason", async () => {
    state.saveRpc = {
      data: { ok: false, reason: "not_authenticated" },
      error: null,
    };
    await expect(
      createQuickLogEvent({ ...baseInput, eventType: "note" }),
    ).rejects.toThrow("Not authenticated");
  });

  it("translates grow_not_owned reason", async () => {
    state.saveRpc = {
      data: { ok: false, reason: "grow_not_owned" },
      error: null,
    };
    await expect(
      createQuickLogEvent({ ...baseInput, eventType: "note" }),
    ).rejects.toThrow("Grow not found or not owned by current user");
  });

  it("translates plant_not_in_grow reason", async () => {
    state.saveRpc = {
      data: { ok: false, reason: "plant_not_in_grow" },
      error: null,
    };
    await expect(
      createQuickLogEvent({
        ...baseInput,
        tentId: "tent-1",
        plantId: "plant-x",
        eventType: "observe",
      }),
    ).rejects.toThrow("Plant does not belong to this grow");
  });

  it("translates plant_not_in_tent reason", async () => {
    state.saveRpc = {
      data: { ok: false, reason: "plant_not_in_tent" },
      error: null,
    };
    await expect(
      createQuickLogEvent({
        ...baseInput,
        tentId: "tent-1",
        plantId: "plant-1",
        eventType: "observe",
      }),
    ).rejects.toThrow("Plant does not belong to this tent");
  });

  it("rejects calls with a missing/short idempotency key", async () => {
    await expect(
      createQuickLogEvent({
        growId: "grow-abc",
        eventType: "note",
        idempotencyKey: "short",
      }),
    ).rejects.toThrow(/idempotency key/i);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("surfaces the underlying error message when the RPC errors out", async () => {
    state.saveRpc = { data: null, error: { message: "db down" } };
    await expect(
      createQuickLogEvent({ ...baseInput, eventType: "note" }),
    ).rejects.toThrow("Failed to save quick log: db down");
  });
});
