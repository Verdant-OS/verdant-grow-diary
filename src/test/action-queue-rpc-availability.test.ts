import { describe, it, expect } from "vitest";
import {
  isMissingActionQueueTransitionRpcError,
  ACTION_QUEUE_TRANSITION_RPC_UNAVAILABLE_COPY,
} from "@/lib/actionQueueRpcAvailability";
import { safeActionQueueFailureCopy } from "@/lib/actionQueueFailureCopy";

describe("isMissingActionQueueTransitionRpcError", () => {
  it("detects PostgREST PGRST202 (schema cache miss)", () => {
    expect(
      isMissingActionQueueTransitionRpcError({
        code: "PGRST202",
        message: "Could not find the function public.action_queue_transition",
      }),
    ).toBe(true);
  });

  it("detects Postgres 42883 undefined_function", () => {
    expect(
      isMissingActionQueueTransitionRpcError({
        code: "42883",
        message: "function public.action_queue_transition(uuid, text) does not exist",
      }),
    ).toBe(true);
  });

  it("detects known error messages without a code", () => {
    expect(
      isMissingActionQueueTransitionRpcError({
        message: "Could not find the function public.action_queue_transition in the schema cache",
      }),
    ).toBe(true);
    expect(
      isMissingActionQueueTransitionRpcError({
        message: "No function matches the given name and argument types",
      }),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isMissingActionQueueTransitionRpcError(null)).toBe(false);
    expect(isMissingActionQueueTransitionRpcError(undefined)).toBe(false);
    expect(isMissingActionQueueTransitionRpcError({})).toBe(false);
    expect(
      isMissingActionQueueTransitionRpcError({
        code: "23505",
        message: "duplicate key value violates unique constraint",
      }),
    ).toBe(false);
    expect(
      isMissingActionQueueTransitionRpcError({
        code: "PGRST301",
        message: "JWT expired",
      }),
    ).toBe(false);
  });

  it("never throws on arbitrary input", () => {
    for (const input of ["string", 42, true, [], () => {}, Symbol("x")]) {
      expect(() => isMissingActionQueueTransitionRpcError(input)).not.toThrow();
    }
  });
});

describe("safeActionQueueFailureCopy rpc_missing reason", () => {
  it("returns friendly copy without echoing backend text", () => {
    const copy = safeActionQueueFailureCopy("transition", {
      ok: false,
      reason: "rpc_missing",
    });
    expect(copy).toMatch(/temporarily unavailable/i);
    expect(copy).not.toMatch(/action_queue_transition/);
    expect(copy).not.toMatch(/PGRST/);
  });

  it("banner copy never names the RPC or leaks provider codes", () => {
    const { title, body } = ACTION_QUEUE_TRANSITION_RPC_UNAVAILABLE_COPY;
    for (const text of [title, body]) {
      expect(text).not.toMatch(/action_queue_transition/);
      expect(text).not.toMatch(/PGRST|42883|postgrest/i);
    }
  });
});
