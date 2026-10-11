/**
 * Regression: Action Queue transitions must invoke supabase.rpc as a method.
 *
 * supabase-js implements rpc as `return this.rest.rpc(...)`. Extracting the
 * function (`(supabase.rpc as ...)(name, args)`) leaves `this` undefined and
 * throws:
 *   Cannot read properties of undefined (reading 'rest')
 * That crash class was measured live on breeding Log Event (#1304) and deferred
 * for Action Queue / Action Detail transition call sites — this slice closes it.
 *
 * This mock mirrors that contract: an unbound call throws the same TypeError;
 * a method call on the client reaches rest.rpc and resolves.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const restRpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const client = {
    rest: {
      rpc: (...args: unknown[]) => restRpc(...args),
    },
    // Mimic SupabaseClient.rpc — must be a real method so `this` matters.
    rpc(this: { rest?: { rpc: typeof restRpc } }, fn: string, args: unknown) {
      return this.rest!.rpc(fn, args);
    },
  };
  return { supabase: client };
});

import { supabase } from "@/integrations/supabase/client";

const ROOT = resolve(__dirname, "../..");
const ACTION_QUEUE = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");
const ACTION_DETAIL = readFileSync(resolve(ROOT, "src/pages/ActionDetail.tsx"), "utf8");

type UntypedActionQueueRpcClient = {
  rpc: (fn: string, args: unknown) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** Production shape used by ActionQueue / ActionDetail after AQ_RPC_THIS_BOUND. */
async function invokeActionQueueTransitionBound(rpcArgs: Record<string, unknown>) {
  return (supabase as unknown as UntypedActionQueueRpcClient).rpc(
    "action_queue_transition",
    rpcArgs,
  );
}

const SAMPLE_ARGS = {
  p_action_queue_id: "11111111-1111-4111-8111-111111111111",
  p_transition: "approve",
  p_expected_status: "pending_approval",
  p_note: null,
};

describe("Action Queue transition preserves supabase.rpc this-binding", () => {
  beforeEach(() => {
    restRpc.mockReset();
    restRpc.mockResolvedValue({
      data: {
        ok: true,
        action_queue_id: SAMPLE_ARGS.p_action_queue_id,
        previous_status: "pending_approval",
        new_status: "approved",
        event_id: "22222222-2222-4222-8222-222222222222",
        transitioned_at: "2026-09-07T22:00:00.000Z",
        reused: false,
      },
      error: null,
    });
  });

  it("does not throw Cannot read properties of undefined (reading 'rest')", async () => {
    await expect(invokeActionQueueTransitionBound(SAMPLE_ARGS)).resolves.toMatchObject({
      data: expect.objectContaining({ ok: true }),
      error: null,
    });
  });

  it("reaches the PostgREST rpc surface (proves this.rest was defined)", async () => {
    await invokeActionQueueTransitionBound(SAMPLE_ARGS);
    expect(restRpc).toHaveBeenCalledTimes(1);
    expect(restRpc).toHaveBeenCalledWith(
      "action_queue_transition",
      expect.objectContaining({
        p_action_queue_id: SAMPLE_ARGS.p_action_queue_id,
        p_transition: "approve",
      }),
    );
  });

  it("documents the unbound extract that caused the live crash class", () => {
    const unbound = (
      supabase as unknown as {
        rpc: (fn: string, args: unknown) => unknown;
      }
    ).rpc;
    expect(() => unbound("action_queue_transition", SAMPLE_ARGS)).toThrow(
      /Cannot read properties of undefined \(reading 'rest'\)/,
    );
  });
});

describe("ActionQueue / ActionDetail call sites stay method-bound", () => {
  it.each([
    ["ActionQueue.tsx", ACTION_QUEUE],
    ["ActionDetail.tsx", ACTION_DETAIL],
  ] as const)("%s does not extract supabase.rpc into an unbound free function", (_label, src) => {
    // Forbidden: (supabase.rpc as unknown as (...))( "action_queue_transition", ...)
    expect(src).not.toMatch(
      /supabase\.rpc\s+as\s+unknown\s+as\s*\([\s\S]{0,200}?\)\s*=>\s*[\s\S]{0,200}?\)\s*\(\s*["']action_queue_transition["']/,
    );
  });

  it.each([
    ["ActionQueue.tsx", ACTION_QUEUE],
    ["ActionDetail.tsx", ACTION_DETAIL],
  ] as const)("%s calls rpc as a method on a cast client (this stays bound)", (_label, src) => {
    expect(src).toMatch(
      /\(\s*supabase\s+as\s+unknown\s+as\s+UntypedActionQueueRpcClient\s*\)\s*\.rpc\s*\(\s*["']action_queue_transition["']/,
    );
  });
});
