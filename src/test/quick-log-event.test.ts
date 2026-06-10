import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createQuickLogEvent,
  QUICK_LOG_EVENT_TYPE_MAP,
  type QuickLogEventType,
} from "@/lib/quick-log/createQuickLogEvent";

// ---------- per-table mock state ----------
type Result = { data: any; error: any };

const state = {
  grows: { data: { id: "grow-abc" }, error: null } as Result,
  plants: { data: { id: "plant-1", grow_id: "grow-abc", tent_id: "tent-1" }, error: null } as Result,
  sensorRows: { data: [] as any[], error: null } as Result,
  growEventInsert: { data: { id: "event-1" }, error: null } as Result,
  diaryInsert: { error: null } as { error: any },
  deleteResult: { error: null } as { error: any },
};

const calls = {
  grows: { select: vi.fn(), eq: vi.fn(), single: vi.fn() },
  plants: { select: vi.fn(), eq: vi.fn(), single: vi.fn() },
  sensor: { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() },
  growEvents: { insert: vi.fn(), select: vi.fn(), single: vi.fn(), delete: vi.fn(), eq: vi.fn() },
  diary: { insert: vi.fn() },
};

function growsBuilder() {
  const b: any = {};
  b.select = (...a: any[]) => { calls.grows.select(...a); return b; };
  b.eq = (...a: any[]) => { calls.grows.eq(...a); return b; };
  b.single = () => { calls.grows.single(); return Promise.resolve(state.grows); };
  return b;
}
function plantsBuilder() {
  const b: any = {};
  b.select = (...a: any[]) => { calls.plants.select(...a); return b; };
  b.eq = (...a: any[]) => { calls.plants.eq(...a); return b; };
  b.single = () => { calls.plants.single(); return Promise.resolve(state.plants); };
  return b;
}
function sensorBuilder() {
  const b: any = {};
  b.select = (...a: any[]) => { calls.sensor.select(...a); return b; };
  b.eq = (...a: any[]) => { calls.sensor.eq(...a); return b; };
  b.order = (...a: any[]) => { calls.sensor.order(...a); return b; };
  b.limit = (...a: any[]) => { calls.sensor.limit(...a); return Promise.resolve(state.sensorRows); };
  return b;
}
function growEventsBuilder() {
  const insertChain: any = {
    select: (...a: any[]) => { calls.growEvents.select(...a); return insertChain; },
    single: () => { calls.growEvents.single(); return Promise.resolve(state.growEventInsert); },
  };
  const deleteChain: any = {
    eq: (...a: any[]) => { calls.growEvents.eq(...a); return deleteChain; },
    then: (resolve: any) => resolve(state.deleteResult),
  };
  return {
    insert: (...a: any[]) => { calls.growEvents.insert(...a); return insertChain; },
    delete: (...a: any[]) => { calls.growEvents.delete(...a); return deleteChain; },
  };
}
function diaryBuilder() {
  return {
    insert: (...a: any[]) => {
      calls.diary.insert(...a);
      return Promise.resolve(state.diaryInsert);
    },
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: (table: string) => {
      switch (table) {
        case "grows": return growsBuilder();
        case "plants": return plantsBuilder();
        case "sensor_readings": return sensorBuilder();
        case "grow_events": return growEventsBuilder();
        case "diary_entries": return diaryBuilder();
        default: return {};
      }
    },
  },
}));

import { supabase } from "@/integrations/supabase/client";

function resetState() {
  state.grows = { data: { id: "grow-abc" }, error: null };
  state.plants = { data: { id: "plant-1", grow_id: "grow-abc", tent_id: "tent-1" }, error: null };
  state.sensorRows = { data: [], error: null };
  state.growEventInsert = { data: { id: "event-1" }, error: null };
  state.diaryInsert = { error: null };
  state.deleteResult = { error: null };
  for (const group of Object.values(calls)) {
    for (const fn of Object.values(group)) (fn as any).mockClear();
  }
}

describe("createQuickLogEvent — auth + ownership", () => {
  beforeEach(() => {
    resetState();
    (supabase.auth.getUser as any).mockResolvedValue({
      data: { user: { id: "user-123" } },
    });
  });

  it("rejects unauthenticated user", async () => {
    (supabase.auth.getUser as any).mockResolvedValue({ data: { user: null } });
    await expect(
      createQuickLogEvent({ growId: "grow-abc", eventType: "note" }),
    ).rejects.toThrow("Not authenticated");
    expect(calls.growEvents.insert).not.toHaveBeenCalled();
  });

  it("rejects grow not owned by user", async () => {
    state.grows = { data: null, error: { message: "not found" } };
    await expect(
      createQuickLogEvent({ growId: "grow-abc", eventType: "note" }),
    ).rejects.toThrow("Grow not found or not owned by current user");
    expect(calls.growEvents.insert).not.toHaveBeenCalled();
  });

  it("rejects plant from another grow", async () => {
    state.plants = {
      data: { id: "plant-x", grow_id: "other-grow", tent_id: "tent-1" },
      error: null,
    };
    await expect(
      createQuickLogEvent({
        growId: "grow-abc",
        tentId: "tent-1",
        plantId: "plant-x",
        eventType: "observe",
      }),
    ).rejects.toThrow("Plant does not belong to this grow");
    expect(calls.growEvents.insert).not.toHaveBeenCalled();
  });

  it("rejects plant from another tent", async () => {
    state.plants = {
      data: { id: "plant-1", grow_id: "grow-abc", tent_id: "tent-other" },
      error: null,
    };
    await expect(
      createQuickLogEvent({
        growId: "grow-abc",
        tentId: "tent-1",
        plantId: "plant-1",
        eventType: "observe",
      }),
    ).rejects.toThrow("Plant does not belong to this tent");
  });
});

describe("createQuickLogEvent — writes", () => {
  beforeEach(() => {
    resetState();
    (supabase.auth.getUser as any).mockResolvedValue({
      data: { user: { id: "user-123" } },
    });
  });

  it("saves a grow-level observation with no plant_id", async () => {
    const out = await createQuickLogEvent({
      growId: "grow-abc",
      eventType: "observe",
      note: "looking good",
    });
    expect(out).toEqual({ id: "event-1" });
    expect(calls.growEvents.insert).toHaveBeenCalledTimes(1);
    const arg = (calls.growEvents.insert.mock.calls[0] as any[])[0];
    expect(arg).toMatchObject({
      user_id: "user-123",
      grow_id: "grow-abc",
      tent_id: null,
      plant_id: null,
      event_type: "observation",
      source: "manual",
      note: "looking good",
    });
    // No tent → no sensor lookup, no diary write.
    expect(calls.sensor.limit).not.toHaveBeenCalled();
    expect(calls.diary.insert).not.toHaveBeenCalled();
  });

  it("saves a plant-linked watering event", async () => {
    await createQuickLogEvent({
      growId: "grow-abc",
      tentId: "tent-1",
      plantId: "plant-1",
      eventType: "water",
    });
    const arg = (calls.growEvents.insert.mock.calls[0] as any[])[0];
    expect(arg.plant_id).toBe("plant-1");
    expect(arg.tent_id).toBe("tent-1");
    expect(arg.event_type).toBe("watering");
  });

  it("maps every quick-log event type deterministically", async () => {
    const cases: [QuickLogEventType, string][] = [
      ["observe", "observation"],
      ["water", "watering"],
      ["feed", "feeding"],
      ["photo", "photo"],
      ["note", "note"],
    ];
    expect(QUICK_LOG_EVENT_TYPE_MAP).toEqual({
      observe: "observation",
      water: "watering",
      feed: "feeding",
      photo: "photo",
      note: "note",
    });
    for (const [ui, canonical] of cases) {
      resetState();
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: { id: "user-123" } },
      });
      await createQuickLogEvent({ growId: "grow-abc", eventType: ui });
      const arg = (calls.growEvents.insert.mock.calls[0] as any[])[0];
      expect(arg.event_type).toBe(canonical);
    }
  });

  it("does not embed a fake sensor snapshot when readings are absent", async () => {
    state.sensorRows = { data: [], error: null };
    await createQuickLogEvent({
      growId: "grow-abc",
      tentId: "tent-1",
      eventType: "observe",
    });
    // No snapshot + no photo → no diary write at all.
    expect(calls.diary.insert).not.toHaveBeenCalled();
  });

  it("preserves source + captured_at on real snapshots and never relabels as live", async () => {
    state.sensorRows = {
      data: [
        { metric: "temperature_c", value: 24.3, source: "csv", captured_at: "2026-06-09T12:00:00Z" },
        { metric: "humidity_pct", value: 55, source: "csv", captured_at: "2026-06-09T12:00:00Z" },
      ],
      error: null,
    };
    await createQuickLogEvent({
      growId: "grow-abc",
      tentId: "tent-1",
      eventType: "observe",
    });
    expect(calls.diary.insert).toHaveBeenCalledTimes(1);
    const diaryArg = (calls.diary.insert.mock.calls[0] as any[])[0];
    expect(diaryArg.details.sensor_snapshot).toEqual({
      source: "csv",
      captured_at: "2026-06-09T12:00:00Z",
      metrics: { temperature_c: 24.3, humidity_pct: 55 },
    });
    expect(diaryArg.details.linked_grow_event_id).toBe("event-1");
    // Source must NOT be upgraded to "live".
    expect(diaryArg.details.sensor_snapshot.source).not.toBe("live");
  });

  it("rolls back the grow_event and throws when diary insert fails", async () => {
    state.sensorRows = {
      data: [{ metric: "temperature_c", value: 24, source: "manual", captured_at: "2026-06-09T12:00:00Z" }],
      error: null,
    };
    state.diaryInsert = { error: { message: "boom" } };
    await expect(
      createQuickLogEvent({
        growId: "grow-abc",
        tentId: "tent-1",
        eventType: "observe",
      }),
    ).rejects.toThrow("Failed to save quick log details: boom");
    // Compensation delete fires with id + user_id scope.
    expect(calls.growEvents.delete).toHaveBeenCalledTimes(1);
    const eqCalls = calls.growEvents.eq.mock.calls.map((c) => c.slice(0, 2));
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        ["id", "event-1"],
        ["user_id", "user-123"],
      ]),
    );
  });

  it("throws and does not write diary when grow_events insert fails", async () => {
    state.growEventInsert = { data: null, error: { message: "db down" } };
    await expect(
      createQuickLogEvent({ growId: "grow-abc", eventType: "note" }),
    ).rejects.toThrow("Failed to save quick log: db down");
    expect(calls.diary.insert).not.toHaveBeenCalled();
  });
});
