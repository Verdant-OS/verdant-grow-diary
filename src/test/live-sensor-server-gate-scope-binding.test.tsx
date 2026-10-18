/**
 * Codex P2 / Copilot at 73d7314c: the server preflight decision must be bound
 * to the tent it was evaluated for. Real-hook regressions with deferred,
 * out-of-order Edge responses — fixed-state mocks cannot catch these.
 *
 *  - Tent switch: the first render after a scope change must not report the
 *    previous tent's "allowed", and a late response for the old tent must not
 *    overwrite the current tent's decision.
 *  - Unscoped-then-scoped: an "allowed" for the unscoped (no tent) call must
 *    never count for the tent that resolves afterwards.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

type Deferred = {
  body: Record<string, unknown>;
  resolve: (v: { data: unknown; error: unknown }) => void;
};
const pending = vi.hoisted(() => ({ calls: [] as Deferred[] }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (_name: string, opts: { body: Record<string, unknown> }) =>
        new Promise((resolve) => {
          pending.calls.push({ body: opts.body, resolve });
        }),
    },
  },
}));

import { useLiveSensorServerGate } from "@/hooks/useLiveSensorServerGate";
import { canMountLiveSensorSetup } from "@/lib/entitlements/liveSensorSetupAccess";

const TENT_A = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";
const TENT_B = "6b2d7f10-3c4e-4d6f-9a01-2b3c4d5e6f70";

const ALLOW = { data: { ok: true, display_plan_id: "pro_monthly" }, error: null };
const DENY = { data: { ok: false, reason: "upgrade_required" }, error: null };

function renderGate(initialTent: string | null) {
  return renderHook(
    ({ tentId }: { tentId: string | null }) => {
      const gate = useLiveSensorServerGate("live_sensor_stream", { tentId });
      return {
        gate,
        mount: canMountLiveSensorSetup({
          serverGateState: gate.state,
          evaluatedTentId: gate.evaluatedTentId,
          activeTentId: tentId,
        }),
      };
    },
    { initialProps: { tentId: initialTent } },
  );
}

async function settle(call: Deferred, response: { data: unknown; error: unknown }) {
  await act(async () => {
    call.resolve(response);
    await Promise.resolve();
  });
}

beforeEach(() => {
  pending.calls = [];
});

describe("live-sensor server gate — decision bound to the evaluated tent", () => {
  it("mounts once the active tent's own preflight allows", async () => {
    const { result } = renderGate(TENT_A);
    expect(result.current.mount).toBe(false);
    await settle(pending.calls[0], ALLOW);
    expect(result.current.gate.evaluatedTentId).toBe(TENT_A);
    expect(result.current.mount).toBe(true);
  });

  it("tent switch: fails closed on the first render and while B's recheck is pending", async () => {
    const { result, rerender } = renderGate(TENT_A);
    await settle(pending.calls[0], ALLOW);
    expect(result.current.mount).toBe(true);

    rerender({ tentId: TENT_B });
    // Same render as the switch, before the effect resets state.
    expect(result.current.gate.state).toBe("loading");
    expect(result.current.mount).toBe(false);
    expect(pending.calls[1]?.body.tent_id).toBe(TENT_B);
    expect(result.current.mount).toBe(false);
  });

  it("tent switch: a late allowed for the old tent cannot overwrite B's denial", async () => {
    const { result, rerender } = renderGate(TENT_A);
    rerender({ tentId: TENT_B });
    const [callA, callB] = pending.calls;
    await settle(callB, DENY);
    expect(result.current.mount).toBe(false);
    await settle(callA, ALLOW);
    expect(result.current.gate.state).toBe("denied");
    expect(result.current.mount).toBe(false);
  });

  it("unscoped-then-scoped: an unscoped allowed never counts for the resolved tent", async () => {
    const { result, rerender } = renderGate(null);
    rerender({ tentId: TENT_A });
    const [unscoped, scoped] = pending.calls;
    expect(unscoped.body.tent_id).toBeUndefined();
    expect(scoped.body.tent_id).toBe(TENT_A);

    await settle(unscoped, ALLOW);
    expect(result.current.gate.state).toBe("loading");
    expect(result.current.mount).toBe(false);

    await settle(scoped, DENY);
    expect(result.current.mount).toBe(false);
  });

  // Codex P2 at 7a9fdc7e: A -> B -> A before B settles must not reuse the
  // first visit's A decision; only the fresh A preflight may count.
  it("revisiting a tent: A -> B -> A ignores the earlier A decision until a fresh check settles", async () => {
    const { result, rerender } = renderGate(TENT_A);
    await settle(pending.calls[0], ALLOW);
    expect(result.current.mount).toBe(true);

    rerender({ tentId: TENT_B });
    rerender({ tentId: TENT_A });
    // Back on A, the first visit's allowed is stale: pending, fail closed.
    expect(result.current.gate.state).toBe("loading");
    expect(result.current.mount).toBe(false);

    const freshA = pending.calls[2];
    expect(freshA?.body.tent_id).toBe(TENT_A);
    // B settling late (allowed) is superseded and cannot mount A or B.
    await settle(pending.calls[1], ALLOW);
    expect(result.current.mount).toBe(false);

    // Access revoked since the first visit: the fresh A check denies.
    await settle(freshA, DENY);
    expect(result.current.gate.state).toBe("denied");
    expect(result.current.mount).toBe(false);
  });

  it("revisiting a tent: a fresh A allowed mounts again", async () => {
    const { result, rerender } = renderGate(TENT_A);
    await settle(pending.calls[0], DENY);
    rerender({ tentId: TENT_B });
    rerender({ tentId: TENT_A });
    expect(result.current.gate.state).toBe("loading");
    await settle(pending.calls[2], ALLOW);
    expect(result.current.mount).toBe(true);
  });

  it("unscoped allowed on its own does not mount (no evaluated tent)", async () => {
    const { result } = renderGate(null);
    await settle(pending.calls[0], ALLOW);
    expect(result.current.gate.state).toBe("allowed");
    expect(result.current.mount).toBe(false);
  });
});

describe("canMountLiveSensorSetup — evaluated tent must match the active tent", () => {
  it("allows only allowed + matching non-null tent", () => {
    expect(
      canMountLiveSensorSetup({
        serverGateState: "allowed",
        evaluatedTentId: TENT_A,
        activeTentId: TENT_A,
      }),
    ).toBe(true);
  });

  it.each([
    ["mismatched tent", TENT_A, TENT_B],
    ["unscoped decision", null, TENT_A],
    ["no active tent", TENT_A, null],
    ["both null", null, null],
  ])("fails closed for %s", (_label, evaluated, active) => {
    expect(
      canMountLiveSensorSetup({
        serverGateState: "allowed",
        evaluatedTentId: evaluated,
        activeTentId: active,
      }),
    ).toBe(false);
  });
});
