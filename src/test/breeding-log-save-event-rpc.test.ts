/**
 * Typed seam for `public.breeding_log_save_event`, plus the shared
 * missing/stale RPC classifier.
 *
 * Context: the RPC's migration (20260728163100) is merged but not yet applied
 * to every project, so it is absent from the generated Supabase types. Call
 * sites used to carry their own `as unknown as` cast, which erased the
 * argument AND result shapes and made "function not live yet" look identical
 * to a validation refusal. These tests pin the typed boundary and the
 * classification.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  BREEDING_LOG_EVENT_TYPES,
  BREEDING_LOG_SAVE_EVENT_COPY,
  BREEDING_LOG_SAVE_EVENT_REASONS,
  BREEDING_LOG_SAVE_EVENT_UNAVAILABLE_COPY,
  callBreedingLogSaveEvent,
  interpretBreedingLogSaveEventResponse,
  isBreedingLogEventType,
} from "@/lib/genetics/breedingLogSaveEventRpc";
import {
  classifySupabaseRpcError,
  isMissingOrStaleRpc,
  RPC_MISSING_OR_STALE_COPY,
} from "@/lib/supabaseRpcAvailability";

const ROOT = resolve(__dirname, "../..");
const MIGRATION = readFileSync(
  resolve(
    ROOT,
    "supabase/migrations/20260728163100_production_breeding_workflow_reconciliation.sql",
  ),
  "utf8",
);
const CONTAINER = readFileSync(
  resolve(ROOT, "src/components/genetics/BreedingLogContainer.tsx"),
  "utf8",
);

describe("classifySupabaseRpcError", () => {
  it("treats PostgREST/Postgres missing-object codes as missing_or_stale", () => {
    for (const code of ["PGRST202", "PGRST205", "42883", "42P01"]) {
      expect(classifySupabaseRpcError({ code, message: "x" }), code).toBe("missing_or_stale");
    }
    // Case-insensitive and whitespace tolerant.
    expect(classifySupabaseRpcError({ code: " pgrst202 " })).toBe("missing_or_stale");
  });

  it("recognizes the message forms when no structured code is carried", () => {
    for (const message of [
      "Could not find the function public.breeding_log_save_event(...) in the schema cache",
      "Could not find the table 'public.breeding_events' in the schema cache",
      "function public.breeding_log_save_event(text) does not exist",
      'relation "public.breeding_events" does not exist',
    ]) {
      expect(isMissingOrStaleRpc({ message }), message.slice(0, 30)).toBe(true);
    }
  });

  it("does not misclassify real failures as missing", () => {
    for (const error of [
      { code: "42501", message: "permission denied for function" },
      { code: "PGRST301", message: "JWT expired" },
      { message: "TypeError: Failed to fetch" },
      { message: "new row violates row-level security policy" },
    ]) {
      expect(classifySupabaseRpcError(error), error.message).toBe("other_error");
    }
  });

  it("returns ok for no error and never leaks backend text into the copy", () => {
    expect(classifySupabaseRpcError(null)).toBe("ok");
    expect(classifySupabaseRpcError(undefined)).toBe("ok");
    const copy = [
      RPC_MISSING_OR_STALE_COPY.title,
      RPC_MISSING_OR_STALE_COPY.body,
      ...RPC_MISSING_OR_STALE_COPY.nextActionSteps,
    ].join(" ");
    // Raw error codes and catalog internals must never reach the panel.
    // "schema cache" IS allowed: this is an operator surface and that is the
    // accurate, actionable term for the condition.
    expect(copy).not.toMatch(/PGRST\d|pg_catalog|42P01|42883|supabase_migrations/);
    // The next action must name the protected lane, never an ad-hoc console.
    expect(copy).toMatch(/protected apply lane/i);
    expect(copy).toMatch(/never an ad-hoc SQL console/i);
  });
});

describe("interpretBreedingLogSaveEventResponse", () => {
  it("maps a successful save", () => {
    expect(
      interpretBreedingLogSaveEventResponse({
        data: { ok: true, grow_event_id: "evt-1", reused: false },
        error: null,
      }),
    ).toEqual({ status: "saved", growEventId: "evt-1", reused: false });
  });

  it("preserves the idempotent-replay flag", () => {
    const outcome = interpretBreedingLogSaveEventResponse({
      data: { ok: true, grow_event_id: "evt-1", reused: true },
      error: null,
    });
    expect(outcome).toEqual({ status: "saved", growEventId: "evt-1", reused: true });
  });

  it("maps every known refusal reason without falling through to unknown", () => {
    for (const reason of BREEDING_LOG_SAVE_EVENT_REASONS) {
      expect(
        interpretBreedingLogSaveEventResponse({ data: { ok: false, reason }, error: null }),
        reason,
      ).toEqual({ status: "refused", reason });
    }
  });

  it("degrades an unrecognized reason safely instead of throwing", () => {
    expect(
      interpretBreedingLogSaveEventResponse({
        data: { ok: false, reason: "brand_new_reason" },
        error: null,
      }),
    ).toEqual({ status: "refused", reason: "unknown_reason" });
  });

  it("separates rpc_unavailable from a genuine failure", () => {
    expect(
      interpretBreedingLogSaveEventResponse({
        data: null,
        error: { code: "PGRST202", message: "Could not find the function" },
      }),
    ).toEqual({ status: "rpc_unavailable" });
    expect(
      interpretBreedingLogSaveEventResponse({
        data: null,
        error: { code: "42501", message: "permission denied" },
      }),
    ).toEqual({ status: "failed", message: "permission denied" });
  });

  it("fails closed on an unexpected payload shape — never reports a phantom save", () => {
    for (const data of [null, undefined, "nope", 42, { ok: true }]) {
      const outcome = interpretBreedingLogSaveEventResponse({ data, error: null });
      expect(outcome.status, JSON.stringify(data)).not.toBe("saved");
    }
  });
});

describe("callBreedingLogSaveEvent", () => {
  const args = {
    p_idempotency_key: "key-12345678",
    p_grow_id: "grow-1",
    p_plant_id: "plant-1",
    p_event_type: "pollination",
    p_tent_id: null,
    p_method: null,
    p_intensity: null,
    p_details: {},
  } as const;

  it("passes the exact RPC name and argument object through", async () => {
    const calls: Array<{ fn: string; args: unknown }> = [];
    const client = {
      rpc: async (fn: string, rpcArgs: unknown) => {
        calls.push({ fn, args: rpcArgs });
        return { data: { ok: true, grow_event_id: "evt-9" }, error: null };
      },
    };
    const outcome = await callBreedingLogSaveEvent(client as never, args);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("breeding_log_save_event");
    expect(calls[0].args).toEqual(args);
    expect(outcome).toEqual({ status: "saved", growEventId: "evt-9", reused: false });
    // The client never sends an identity claim — auth.uid() owns that.
    expect(Object.keys(calls[0].args as object)).not.toContain("p_user_id");
  });

  it("converts a thrown transport error into a typed failure", async () => {
    const client = {
      rpc: async () => {
        throw new Error("network down");
      },
    };
    expect(await callBreedingLogSaveEvent(client as never, args)).toEqual({
      status: "failed",
      message: "network down",
    });
  });
});

describe("contract stays in lockstep with the migration", () => {
  it("every typed reason actually appears in the RPC body", () => {
    for (const reason of BREEDING_LOG_SAVE_EVENT_REASONS) {
      expect(MIGRATION, reason).toContain(`'${reason}'`);
    }
  });

  it("every canonical event type is accepted by the RPC", () => {
    for (const eventType of BREEDING_LOG_EVENT_TYPES) {
      expect(MIGRATION, eventType).toContain(`'${eventType}'`);
    }
    expect(isBreedingLogEventType("pollination")).toBe(true);
    expect(isBreedingLogEventType("not_a_real_event")).toBe(false);
  });

  it("has grower-safe copy for every reason, leaking no backend text", () => {
    for (const reason of [...BREEDING_LOG_SAVE_EVENT_REASONS, "unknown_reason" as const]) {
      const copy = BREEDING_LOG_SAVE_EVENT_COPY[reason];
      expect(copy, reason).toBeTruthy();
      expect(copy, reason).not.toMatch(/PGRST|auth\.uid|jsonb|RPC|SQL/i);
    }
    expect(BREEDING_LOG_SAVE_EVENT_UNAVAILABLE_COPY).toMatch(/[Nn]othing was recorded/);
  });
});

describe("BreedingLogContainer uses the typed seam", () => {
  it("no longer carries a local rpc cast", () => {
    expect(CONTAINER).not.toMatch(/supabase\.rpc as unknown as/);
  });

  it("calls through the wrapper and handles the unavailable case", () => {
    expect(CONTAINER).toContain("callBreedingLogSaveEvent");
    expect(CONTAINER).toContain('outcome.status === "rpc_unavailable"');
    expect(CONTAINER).toContain("BREEDING_LOG_SAVE_EVENT_UNAVAILABLE_COPY");
  });
});
