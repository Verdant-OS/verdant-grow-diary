import { describe, expect, it } from "vitest";
import {
  listRecentDiaryEntriesForOwnedGrow,
  listRecentDiaryEntriesForOwnedTent,
} from "@/lib/operatorAccountReadModels";

interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

function recordingClient(options: { includeTent?: boolean } = {}) {
  const calls: RecordedCall[] = [];

  const client = {
    from(table: string) {
      calls.push({ table, method: "from", args: [] });

      if (table === "grows" || table === "tents") {
        const relation = {
          select(...args: unknown[]) {
            calls.push({ table, method: "select", args });
            return relation;
          },
          eq(...args: unknown[]) {
            calls.push({ table, method: "eq", args });
            return relation;
          },
          async maybeSingle() {
            calls.push({ table, method: "maybeSingle", args: [] });
            if (table === "tents" && !options.includeTent) return { data: null, error: null };
            return { data: { id: table === "grows" ? "grow-1" : "tent-1" }, error: null };
          },
        };
        return relation;
      }

      if (table !== "diary_entries") throw new Error(`Unexpected table: ${table}`);
      const diary = {
        select(...args: unknown[]) {
          calls.push({ table, method: "select", args });
          return diary;
        },
        eq(...args: unknown[]) {
          calls.push({ table, method: "eq", args });
          return diary;
        },
        is(...args: unknown[]) {
          calls.push({ table, method: "is", args });
          return diary;
        },
        order(...args: unknown[]) {
          calls.push({ table, method: "order", args });
          return diary;
        },
        async limit(...args: unknown[]) {
          calls.push({ table, method: "limit", args });
          return { data: [], error: null };
        },
      };
      return diary;
    },
  };

  return { client: client as never, calls };
}

function diaryQueryCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter(
    (call) => call.table === "diary_entries" && ["order", "limit"].includes(call.method),
  );
}

const EXPECTED_ORDER_AND_LIMIT: RecordedCall[] = [
  {
    table: "diary_entries",
    method: "order",
    args: ["entry_at", { ascending: false }],
  },
  {
    table: "diary_entries",
    method: "order",
    args: ["created_at", { ascending: false }],
  },
  {
    table: "diary_entries",
    method: "order",
    args: ["id", { ascending: false }],
  },
  { table: "diary_entries", method: "limit", args: [11] },
];

describe("MCP resolved diary ordering", () => {
  it("executes entry_at DESC, created_at DESC, id DESC for an owned grow", async () => {
    const { client, calls } = recordingClient();

    await expect(listRecentDiaryEntriesForOwnedGrow(client, "grow-1", 11)).resolves.toEqual({
      ok: true,
      data: { entries: [] },
    });
    expect(diaryQueryCalls(calls)).toEqual(EXPECTED_ORDER_AND_LIMIT);
  });

  it("executes the same exact sequence for an owned tent", async () => {
    const { client, calls } = recordingClient({ includeTent: true });

    await expect(
      listRecentDiaryEntriesForOwnedTent(client, "grow-1", "tent-1", 11),
    ).resolves.toEqual({ ok: true, data: { entries: [] } });
    expect(diaryQueryCalls(calls)).toEqual(EXPECTED_ORDER_AND_LIMIT);
  });
});
