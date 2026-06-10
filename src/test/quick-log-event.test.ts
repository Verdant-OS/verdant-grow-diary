import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQuickLogEvent } from "@/lib/quick-log/createQuickLogEvent";

const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockInsert = vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn() }) ) }));
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
              limit: vi.fn(() => ({
                then: vi.fn((cb: any) => cb({ data: [], error: null })),
              })),
            })),
          })),
        })),
      })),
    };
  }
  if (table === "grow_events") {
    return { insert: mockInsert };
  }
  if (table === "diary_entries") {
    return { insert: vi.fn(() => ({ error: null })) };
  }
  return {};
});

const mockStorage = {
  from: vi.fn(() => ({
    upload: vi.fn(() => Promise.resolve({ error: null })),
  })),
};

const mockAuthGetUser = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => mockAuthGetUser() },
    from: (table: string) => mockFrom(table),
    storage: mockStorage,
  },
}));

describe("createQuickLogEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
    });
    mockSingle.mockResolvedValue({ data: { id: "grow-abc" }, error: null });
    mockInsert.mockReturnValue({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: "event-1" }, error: null })),
      })),
    });
  });

  it("throws if not authenticated", async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
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
    const insertSpy = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: "event-1" }, error: null })),
      })),
    }));
    mockFrom.mockImplementation((table: string) => {
      if (table === "grows") return { select: () => ({ eq: () => ({ single: mockSingle }) }) };
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
      if (table === "grow_events") return { insert: insertSpy };
      if (table === "diary_entries") return { insert: vi.fn(() => ({ error: null })) };
      return {};
    });

    await createQuickLogEvent({
      growId: "grow-abc",
      tentId: "tent-1",
      eventType: "note",
      note: "Looks healthy",
    });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const callArg = insertSpy.mock.calls[0][0];
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
    const insertSpy = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: "event-2" }, error: null })),
      })),
    }));
    mockFrom.mockImplementation((table: string) => {
      if (table === "grows") return { select: () => ({ eq: () => ({ single: mockSingle }) }) };
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
      if (table === "grow_events") return { insert: insertSpy };
      if (table === "diary_entries") return { insert: vi.fn(() => ({ error: null })) };
      return {};
    });

    await createQuickLogEvent({ growId: "grow-abc", eventType: "water" });
    const callArg = insertSpy.mock.calls[0][0];
    expect(callArg.event_type).toBe("watering");
  });

  it("maps observe -> observation in grow_events", async () => {
    const insertSpy = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: "event-3" }, error: null })),
      })),
    }));
    mockFrom.mockImplementation((table: string) => {
      if (table === "grows") return { select: () => ({ eq: () => ({ single: mockSingle }) }) };
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
      if (table === "grow_events") return { insert: insertSpy };
      if (table === "diary_entries") return { insert: vi.fn(() => ({ error: null })) };
      return {};
    });

    await createQuickLogEvent({ growId: "grow-abc", eventType: "observe" });
    const callArg = insertSpy.mock.calls[0][0];
    expect(callArg.event_type).toBe("observation");
  });
});
