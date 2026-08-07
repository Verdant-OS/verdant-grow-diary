/**
 * Tests for useAddAiDoctorSessionSuggestionToActionQueue.
 *
 * Covers:
 *   - Builds draft + inserts one pending_approval ai_doctor action.
 *   - Omits user_id from insert payload.
 *   - Omits target_device from insert payload.
 *   - Probes existing open action_queue rows before insert.
 *   - Matching existing open row skips duplicate insert.
 *   - Terminal-status existing row does not block insert.
 *   - Different session token does not block insert.
 *   - RLS / insert error rejects the mutation.
 *   - Ineligible draft causes no DB write.
 *   - Static safety scan of the hook source.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useAddAiDoctorSessionSuggestionToActionQueue } from "@/hooks/useAddAiDoctorSessionSuggestionToActionQueue";
import type {
  AiDoctorSessionLike,
  AiDoctorSuggestedActionLike,
} from "@/lib/aiDoctorSessionToActionQueueRules";

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------
type Call = { table: string; payload?: unknown };
const insertCalls: Call[] = [];
const selectChainCalls: Array<{
  table: string;
  filters: Record<string, unknown>;
  inFilters: Record<string, unknown>;
  likeFilters: Record<string, unknown>;
}> = [];

let nextProbeRows: unknown[] = [];
let nextProbeError: { message: string } | null = null;
let nextInsertResult: { id: string; grow_id: string } | null = { id: "aq-1", grow_id: "grow-1" };
let nextInsertError: { message: string; code?: string } | null = null;

const forbidden = {
  update: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  functionsInvoke: vi.fn(),
};

const rpcCalls: Array<{ name: string; args: unknown }> = [];
let nextCreateRpcResult: {
  data: unknown;
  error: { message: string; code?: string } | null;
} = {
  data: {
    ok: true,
    action_queue_id: "aq-1",
    grow_id: "grow-1",
    status: "pending_approval",
    event_id: "ev-1",
    reused: false,
  },
  error: null,
};

vi.mock("@/integrations/supabase/client", () => {
  const insertBuilder = (table: string, payload: unknown) => {
    insertCalls.push({ table, payload });
    const promise = Promise.resolve({
      data: table === "action_queue" && nextInsertResult ? nextInsertResult : null,
      error: nextInsertError,
    });
    // Allow chained .select(...).single()
    return {
      select: () => ({
        single: () => promise,
      }),
      then: promise.then.bind(promise),
    } as unknown;
  };

  const selectBuilder = (table: string) => {
    const state = {
      table,
      filters: {} as Record<string, unknown>,
      inFilters: {} as Record<string, unknown>,
      likeFilters: {} as Record<string, unknown>,
    };
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        state.filters[col] = val;
        return chain;
      },
      in(col: string, vals: unknown) {
        state.inFilters[col] = vals;
        return chain;
      },
      like(col: string, val: unknown) {
        state.likeFilters[col] = val;
        return chain;
      },
      limit(_n: number) {
        selectChainCalls.push(state);
        return Promise.resolve({
          data: nextProbeError ? null : nextProbeRows,
          error: nextProbeError,
        });
      },
    };
    return chain;
  };

  const tableBuilder = (table: string) => ({
    insert: (payload: unknown) => insertBuilder(table, payload),
    update: (...args: unknown[]) => {
      forbidden.update(...args);
      return Promise.resolve({ data: null, error: null });
    },
    upsert: (...args: unknown[]) => {
      forbidden.upsert(...args);
      return Promise.resolve({ data: null, error: null });
    },
    delete: (...args: unknown[]) => {
      forbidden.delete(...args);
      return Promise.resolve({ data: null, error: null });
    },
    select: (_cols: string) => selectBuilder(table),
  });

  return {
    supabase: {
      from: (table: string) => tableBuilder(table),
      rpc: (name: string, args: unknown) => {
        rpcCalls.push({ name, args });
        if (name === "action_queue_create") {
          return Promise.resolve(nextCreateRpcResult);
        }
        return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
      },
      functions: {
        invoke: (...args: unknown[]) => {
          forbidden.functionsInvoke(...args);
          return Promise.resolve({ data: null, error: null });
        },
      },
    },
  };
});

function wrap() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return {
    client,
    Wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children),
  };
}

const session: AiDoctorSessionLike = {
  id: "sess-123",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
  diagnosis: { riskLevel: "medium" },
};

const action: AiDoctorSuggestedActionLike = {
  type: "task",
  title: "Add a daily photo",
  detail: "Capture a top-down photo each day to track recovery.",
  priority: "medium",
  reason: "Need visual baseline before changing inputs.",
  approvalRequired: true,
};

beforeEach(() => {
  insertCalls.length = 0;
  selectChainCalls.length = 0;
  rpcCalls.length = 0;
  nextProbeRows = [];
  nextProbeError = null;
  nextInsertResult = { id: "aq-1", grow_id: "grow-1" };
  nextInsertError = null;
  nextCreateRpcResult = {
    data: {
      ok: true,
      action_queue_id: "aq-1",
      grow_id: "grow-1",
      status: "pending_approval",
      event_id: "ev-1",
      reused: false,
    },
    error: null,
  };
  Object.values(forbidden).forEach((fn) => fn.mockClear());
});

// ---------------------------------------------------------------------------
// Mutation behaviour
// ---------------------------------------------------------------------------
describe("useAddAiDoctorSessionSuggestionToActionQueue", () => {
  it("creates one pending_approval ai_doctor action via action_queue_create", async () => {
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useAddAiDoctorSessionSuggestionToActionQueue(), {
      wrapper: Wrapper,
    });
    const r = await result.current.mutateAsync({ session, action });
    expect(r).toEqual({ status: "inserted", actionQueueId: "aq-1" });

    // Atomic RPC — no client action_queue / events inserts.
    expect(insertCalls.filter((c) => c.table === "action_queue")).toHaveLength(0);
    expect(insertCalls.filter((c) => c.table === "action_queue_events")).toHaveLength(0);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("action_queue_create");
    const payload = rpcCalls[0].args as Record<string, unknown>;
    expect(payload.p_source).toBe("ai_doctor");
    expect(payload.p_target_metric).toBe("general");
    expect(payload.p_grow_id).toBe("grow-1");
    expect(payload.p_tent_id).toBe("tent-1");
    expect(payload.p_plant_id).toBe("plant-1");
    expect(payload.p_dedupe_key).toBe("ai_doctor_session:sess-123");
    expect(String(payload.p_reason)).toContain("[session:sess-123]");
  });

  it("omits user_id and target_device from the create RPC args", async () => {
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useAddAiDoctorSessionSuggestionToActionQueue(), {
      wrapper: Wrapper,
    });
    await result.current.mutateAsync({ session, action });
    const payload = rpcCalls[0].args as Record<string, unknown>;
    expect("user_id" in payload).toBe(false);
    expect("p_user_id" in payload).toBe(false);
    expect("target_device" in payload).toBe(false);
    expect("p_target_device" in payload).toBe(false);
  });

  it("probes existing open action_queue rows before create", async () => {
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useAddAiDoctorSessionSuggestionToActionQueue(), {
      wrapper: Wrapper,
    });
    await result.current.mutateAsync({ session, action });
    expect(selectChainCalls.length).toBe(1);
    const probe = selectChainCalls[0];
    expect(probe.table).toBe("action_queue");
    expect(probe.filters.grow_id).toBe("grow-1");
    expect(probe.filters.source).toBe("ai_doctor");
    expect(probe.inFilters.status).toEqual(["pending_approval", "approved", "simulated"]);
    expect(probe.likeFilters.reason).toBe("%[session:sess-123]%");
  });

  it("skips create when a matching open row exists", async () => {
    nextProbeRows = [
      {
        id: "aq-existing",
        grow_id: "grow-1",
        source: "ai_doctor",
        status: "pending_approval",
        reason: "x [session:sess-123]",
        suggested_change: "Add a daily photo — …",
      },
    ];
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useAddAiDoctorSessionSuggestionToActionQueue(), {
      wrapper: Wrapper,
    });
    const r = await result.current.mutateAsync({ session, action });
    expect(r).toEqual({ status: "duplicate_skipped", existingActionQueueId: "aq-existing" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("does not skip when only terminal-status rows exist", async () => {
    nextProbeRows = [
      {
        id: "aq-old",
        grow_id: "grow-1",
        source: "ai_doctor",
        status: "rejected",
        reason: "[session:sess-123]",
        suggested_change: "Add a daily photo",
      },
    ];
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useAddAiDoctorSessionSuggestionToActionQueue(), {
      wrapper: Wrapper,
    });
    const r = await result.current.mutateAsync({ session, action });
    expect(r.status).toBe("inserted");
    expect(rpcCalls).toHaveLength(1);
  });

  it("does not skip when an open row carries a different session token", async () => {
    nextProbeRows = [
      {
        id: "aq-other",
        grow_id: "grow-1",
        source: "ai_doctor",
        status: "pending_approval",
        reason: "[session:other-session]",
        suggested_change: "Add a daily photo",
      },
    ];
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useAddAiDoctorSessionSuggestionToActionQueue(), {
      wrapper: Wrapper,
    });
    const r = await result.current.mutateAsync({ session, action });
    expect(r.status).toBe("inserted");
    expect(rpcCalls).toHaveLength(1);
  });

  it("surfaces create RPC errors without a client audit event", async () => {
    nextCreateRpcResult = {
      data: null,
      error: { message: "new row violates row-level security policy", code: "42501" },
    };
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useAddAiDoctorSessionSuggestionToActionQueue(), {
      wrapper: Wrapper,
    });
    await expect(result.current.mutateAsync({ session, action })).rejects.toThrow();
    expect(insertCalls.find((c) => c.table === "action_queue_events")).toBeUndefined();
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it("returns ineligible and performs no DB write when draft is invalid", async () => {
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useAddAiDoctorSessionSuggestionToActionQueue(), {
      wrapper: Wrapper,
    });
    const r = await result.current.mutateAsync({
      session: { ...session, grow_id: null },
      action,
    });
    expect(r).toEqual({ status: "ineligible", reason: "missing_grow_id" });
    expect(insertCalls.length).toBe(0);
    expect(rpcCalls.length).toBe(0);
    expect(selectChainCalls.length).toBe(0);
  });

  it("never calls update/upsert/delete/functions.invoke", async () => {
    const { Wrapper } = wrap();
    const { result } = renderHook(() => useAddAiDoctorSessionSuggestionToActionQueue(), {
      wrapper: Wrapper,
    });
    await result.current.mutateAsync({ session, action });
    expect(forbidden.update).not.toHaveBeenCalled();
    expect(forbidden.upsert).not.toHaveBeenCalled();
    expect(forbidden.delete).not.toHaveBeenCalled();
    expect(forbidden.functionsInvoke).not.toHaveBeenCalled();
    // Only the create RPC is allowed.
    expect(rpcCalls.map((c) => c.name)).toEqual(["action_queue_create"]);
  });
});

// ---------------------------------------------------------------------------
// Static safety scan
// ---------------------------------------------------------------------------
const HOOK_SRC = readFileSync(
  resolve(__dirname, "../hooks/useAddAiDoctorSessionSuggestionToActionQueue.ts"),
  "utf8",
);

describe("useAddAiDoctorSessionSuggestionToActionQueue — safety scan", () => {
  it("uses createActionQueueItem (atomic create RPC) and never direct event inserts", () => {
    expect(HOOK_SRC).toMatch(/createActionQueueItem/);
    expect(HOOK_SRC).toMatch(/buildAiDoctorSessionDedupeKey/);
    expect(HOOK_SRC).not.toMatch(/from\(["']action_queue_events["']\)/);
    expect(HOOK_SRC).not.toMatch(/\.update\(/);
    expect(HOOK_SRC).not.toMatch(/\.upsert\(/);
    expect(HOOK_SRC).not.toMatch(/\.delete\(/);
  });
  it("contains no functions.invoke / service_role", () => {
    expect(HOOK_SRC).not.toMatch(/functions\.invoke/);
    expect(HOOK_SRC.toLowerCase()).not.toContain("service_role");
  });
  it("does not write to alerts / tasks / sensor_readings / grows / plants / tents", () => {
    for (const tbl of [
      "alerts",
      "tasks",
      "sensor_readings",
      "grows",
      "plants",
      "tents",
      "alert_events",
    ]) {
      expect(HOOK_SRC).not.toMatch(new RegExp(`from\\(["']${tbl}["']\\)`));
    }
  });
  it("never assigns target_device or user_id in a write payload", () => {
    expect(HOOK_SRC).not.toMatch(/target_device\s*:/);
    expect(HOOK_SRC).not.toMatch(/user_id\s*:/);
  });
  it("contains no automation / device-control markers", () => {
    const lower = HOOK_SRC.toLowerCase();
    for (const tok of [
      "mqtt",
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home-assistant",
      "home_assistant",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });
  it("pins source and status from the pure draft (server forces pending_approval)", () => {
    expect(HOOK_SRC).toMatch(/source:\s*draft\.source/);
    expect(HOOK_SRC).toMatch(/createActionQueueItem/);
  });
});
