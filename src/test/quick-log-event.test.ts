import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQuickLogEvent } from "@/lib/quick-log/createQuickLogEvent";

const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockGrowInsert = vi.fn(() => ({
  select: vi.fn(() => ({
    single: vi.fn(() => Promise.resolve({ data: { id: "event-1" }, error: null })),
  })),
}));
const mockDiaryInsert = vi.fn(() => ({ error: null }));

const mockFrom = vi.fn((table: string) => {
  if (table === "grows") {
    return { select: mockSelect };
  }
  if (table === "sensor_readings") {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      })),
    };
  }
  if (table === "grow_events") {
    return { insert: mockGrowInsert };
  }
  if (table === "diary_entries") {
    return { insert: mockDiaryInsert };
  }
  return {};
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: (table: string) => mockFrom(table),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ error: null })),
      })),
    },
  },
}));

import { supabase } from "@/integrations/supabase/client";

describe("createQuickLogEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.auth.getUser as any).mockResolvedValue({
      data: { user: { id: "user-123" } },
    });
    mockSingle.mockResolvedValue({ data: { id: "grow-abc" }, error: null });
  });

  it("throws if not authenticated", async () => {
    (supabase.auth.getUser as any).mockResolvedValue({ data: { user: null } });
    await expect(
      createQuickLogEvent({ growId: "grow-abc", eventType: "note" }),
    ).rejects.toThrow("Not authenticated");
  });

  it("throws if grow is not owned by user", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "not found" } });
    await expect(
      createQuickLogEvent({ growId: "grow-abc", eventType: "note" }),
    ).rejects.toThrow("Grow not found or not owned by current user");
  });

  it("inserts a basic grow_event for a note", async () => {
    await createQuickLogEvent({
      growId: "grow-abc",
      tentId: "tent-1",
      eventType: "note",
      note: "Looks healthy",
    });

    expect(mockGrowInsert).toHaveBeenCalledTimes(1);
    const callArg = (mockGrowInsert.mock.calls[0] as any[])[0];
    expect(callArg).toMatchObject({
      user_id: "user-123",
      grow_id: "grow-abc",
      tent_id: "tent-1",
      event_type: "note",
      source: "manual",
      note: "Looks healthy",
    });
  });

  it("maps water -> watering in grow_events", async () => {
    await createQuickLogEvent({ growId: "grow-abc", eventType: "water" });
    const callArg = (mockGrowInsert.mock.calls[0] as any[])[0];
    expect(callArg.event_type).toBe("watering");
  });

  it("maps observe -> observation in grow_events", async () => {
    await createQuickLogEvent({ growId: "grow-abc", eventType: "observe" });
    const callArg = (mockGrowInsert.mock.calls[0] as any[])[0];
    expect(callArg.event_type).toBe("observation");
  });
});
