import { describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/mcp/tools/_supabase", () => ({
  supabaseForUser: () => mockState.client,
  unauthenticated: () => ({
    content: [{ type: "text", text: "Not authenticated." }],
    isError: true,
  }),
}));

import listGrowsTool from "@/lib/mcp/tools/list-grows";

interface RecordedCall {
  method: "from" | "select" | "order" | "limit" | "eq";
  args: unknown[];
}

function recordingClient() {
  const calls: RecordedCall[] = [];
  const result = { data: [], error: null };
  const query = {
    select(...args: unknown[]) {
      calls.push({ method: "select", args });
      return query;
    },
    order(...args: unknown[]) {
      calls.push({ method: "order", args });
      return query;
    },
    limit(...args: unknown[]) {
      calls.push({ method: "limit", args });
      return query;
    },
    eq(...args: unknown[]) {
      calls.push({ method: "eq", args });
      return query;
    },
    then<TResult1 = typeof result, TResult2 = never>(
      onfulfilled?: ((value: typeof result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    },
  };
  const client = {
    from(...args: unknown[]) {
      calls.push({ method: "from", args });
      return query;
    },
  };
  return { client, calls };
}

type ExecutableTool = {
  handler: (
    input: { includeArchived?: boolean; limit?: number },
    context: { isAuthenticated: () => boolean },
  ) => Promise<unknown>;
};

const executableTool = listGrowsTool as unknown as ExecutableTool;

describe("list_grows resolved query ordering", () => {
  it("executes updated_at DESC, id DESC, limit, then active-only filtering", async () => {
    const { client, calls } = recordingClient();
    mockState.client = client;

    await executableTool.handler(
      { includeArchived: false, limit: 17 },
      { isAuthenticated: () => true },
    );

    expect(calls).toEqual([
      { method: "from", args: ["grows"] },
      {
        method: "select",
        args: ["id,name,stage,grow_type,is_archived,started_at,created_at,updated_at"],
      },
      { method: "order", args: ["updated_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: false }] },
      { method: "limit", args: [17] },
      { method: "eq", args: ["is_archived", false] },
    ]);
  });

  it("uses the default limit and omits the archive filter when requested", async () => {
    const { client, calls } = recordingClient();
    mockState.client = client;

    await executableTool.handler({ includeArchived: true }, { isAuthenticated: () => true });

    expect(calls).toEqual([
      { method: "from", args: ["grows"] },
      {
        method: "select",
        args: ["id,name,stage,grow_type,is_archived,started_at,created_at,updated_at"],
      },
      { method: "order", args: ["updated_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: false }] },
      { method: "limit", args: [25] },
    ]);
  });
});
