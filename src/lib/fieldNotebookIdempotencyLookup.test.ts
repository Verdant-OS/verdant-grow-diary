import { beforeEach, describe, expect, it, vi } from "vitest";

const idempotencyMaybeSingle = vi.fn();
const eventMaybeSingle = vi.fn();
const idempotencySelect = vi.fn();
const idempotencyEq = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "quicklog_idempotency") {
        return {
          select: (columns: string) => {
            idempotencySelect(columns);
            return {
              eq: (column: string, value: string) => {
                idempotencyEq(column, value);
                return {
                  eq: (keyColumn: string, key: string) => {
                    idempotencyEq(keyColumn, key);
                    return { maybeSingle: idempotencyMaybeSingle };
                  },
                };
              },
            };
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: eventMaybeSingle }),
        }),
      };
    },
  },
}));

import { findNotebookEntryByIdempotencyKey } from "@/lib/fieldNotebookFindService";

const eventId = "11111111-1111-4111-8111-111111111111";

describe("findNotebookEntryByIdempotencyKey", () => {
  beforeEach(() => {
    idempotencyMaybeSingle.mockReset();
    eventMaybeSingle.mockReset();
  });

  it("reads grow_events by the id from a read-only idempotency select", async () => {
    idempotencyMaybeSingle.mockResolvedValue({ data: { grow_event_id: eventId }, error: null });
    eventMaybeSingle.mockResolvedValue({
      data: {
        id: eventId,
        tent_id: "flower",
        note: "observation A",
        occurred_at: "2025-01-08T15:24:00.000Z",
        event_type: "observation",
        source: "manual",
        is_deleted: false,
      },
      error: null,
    });
    const receipt = await findNotebookEntryByIdempotencyKey({
      userId: "user-1",
      idempotencyKey: "idem-1",
      tentId: "flower",
      tentName: "Flower Tent 2",
    });
    expect(idempotencySelect).toHaveBeenCalledWith("grow_event_id");
    expect(idempotencyEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(idempotencyEq).toHaveBeenCalledWith("idempotency_key", "idem-1");
    expect(receipt.availability).toBe("authoritative");
    expect(receipt.matchedEventId).toBe(eventId);
    if (receipt.availability === "authoritative") {
      expect(receipt.candidates[0]?.tentId).toBe("flower");
      expect(receipt.candidates[0]?.note).toBe("observation A");
    }
  });

  it("stays unavailable when the idempotency row is missing or the read fails", async () => {
    idempotencyMaybeSingle.mockResolvedValue({ data: null, error: null });
    const missing = await findNotebookEntryByIdempotencyKey({
      userId: "user-1",
      idempotencyKey: "idem-1",
      tentId: "flower",
      tentName: "Flower Tent 2",
    });
    expect(missing).toEqual({ availability: "unavailable" });

    idempotencyMaybeSingle.mockResolvedValue({ data: null, error: { message: "down" } });
    const failed = await findNotebookEntryByIdempotencyKey({
      userId: "user-1",
      idempotencyKey: "idem-1",
      tentId: "flower",
      tentName: "Flower Tent 2",
    });
    expect(failed).toEqual({ availability: "unavailable" });
  });
});
