/**
 * Regression: callBreedingLogSaveEvent must invoke supabase.rpc as a method.
 *
 * supabase-js implements rpc as `return this.rest.rpc(...)`. Extracting the
 * function (`const invoke = supabase.rpc; await invoke(...)`) leaves `this`
 * undefined and throws:
 *   Cannot read properties of undefined (reading 'rest')
 * That is the measured live toast on /breeding/log/new Log Event.
 *
 * This mock mirrors that contract: an unbound call throws the same TypeError;
 * a method call reaches rest.rpc and resolves.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const restRpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const client = {
    rest: {
      rpc: (...args: unknown[]) => restRpc(...args),
    },
    // Mimic SupabaseClient.rpc — must be a real method so `this` matters.
    rpc(this: { rest?: { rpc: typeof restRpc } }, fn: string, args: Record<string, unknown>) {
      return this.rest!.rpc(fn, args);
    },
  };
  return { supabase: client };
});

import { callBreedingLogSaveEvent } from "@/lib/genetics/breedingLogSaveEventRpc";

const BASE_ARGS = {
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  growId: "grow-1",
  plantId: "plant-1",
  eventType: "isolation_start" as const,
  tentId: "tent-1",
  method: null,
  intensity: null,
  details: {},
};

describe("callBreedingLogSaveEvent preserves supabase.rpc this-binding", () => {
  beforeEach(() => {
    restRpc.mockReset();
    restRpc.mockResolvedValue({
      data: { ok: true, grow_event_id: "event-1" },
      error: null,
    });
  });

  it("does not throw Cannot read properties of undefined (reading 'rest')", async () => {
    await expect(callBreedingLogSaveEvent(BASE_ARGS)).resolves.toMatchObject({
      ok: true,
      growEventId: "event-1",
    });
  });

  it("reaches the PostgREST rpc surface (proves this.rest was defined)", async () => {
    await callBreedingLogSaveEvent(BASE_ARGS);
    expect(restRpc).toHaveBeenCalledTimes(1);
    expect(restRpc).toHaveBeenCalledWith(
      "breeding_log_save_event",
      expect.objectContaining({
        p_grow_id: "grow-1",
        p_plant_id: "plant-1",
        p_event_type: "isolation_start",
      }),
    );
  });

  it("documents the unbound extract that caused the live crash", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    // Cast: generated Database types omit breeding_log_save_event; the mock is
    // an untyped method whose this-binding is what this case measures.
    const unbound = (
      supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => unknown;
      }
    ).rpc;
    expect(() => unbound("breeding_log_save_event", {})).toThrow(
      /Cannot read properties of undefined \(reading 'rest'\)/,
    );
  });
});
