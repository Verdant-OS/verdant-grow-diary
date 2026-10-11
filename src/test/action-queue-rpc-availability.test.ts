import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  isMissingActionQueueTransitionRpcError,
  areActionQueueTransitionMutationsBlocked,
  ACTION_QUEUE_TRANSITION_ATTEMPT_UNSAVED_COPY,
  ACTION_QUEUE_TRANSITION_RPC_TOAST_ID,
  ACTION_QUEUE_TRANSITION_RPC_UNAVAILABLE_COPY,
  settleActionQueueRpcAvailabilityOnCheckTimeout,
} from "@/lib/actionQueueRpcAvailability";
import { safeActionQueueFailureCopy } from "@/lib/actionQueueFailureCopy";

const ACTION_QUEUE_PAGE = readFileSync(resolve(__dirname, "../pages/ActionQueue.tsx"), "utf8");
const ACTION_DETAIL_PAGE = readFileSync(resolve(__dirname, "../pages/ActionDetail.tsx"), "utf8");

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

  it("detects additional PostgREST/SQL variants for renamed or removed functions", () => {
    const variants: unknown[] = [
      {
        code: "PGRST203",
        message:
          "Could not choose the best candidate function between: public.action_queue_transition(uuid,text), public.action_queue_transition_v2(uuid,text,jsonb)",
      },
      {
        message:
          "Searched for a function named public.action_queue_transition, but no matches were found in the schema cache.",
      },
      { message: "procedure public.action_queue_transition(uuid, text) does not exist" },
      { message: "Unknown function action_queue_transition" },
      // 404 with body payload from a raw fetch wrapper
      {
        status: 404,
        body: "Could not find the function public.action_queue_transition in the schema cache",
      },
      { statusCode: 404, message: "function public.action_queue_transition does not exist" },
      // nested wrapper shapes (fetch/Supabase clients often wrap the real error)
      {
        name: "FunctionsHttpError",
        cause: { code: "PGRST202", message: "Could not find the function" },
      },
      {
        error: {
          code: "42883",
          message: "function public.action_queue_transition(uuid,text) does not exist",
        },
      },
      { context: { data: { message: "no function matches the given name and argument types" } } },
      // 42P01 gated by RPC-name presence in details
      { code: "42P01", message: "relation missing", details: "action_queue_transition" },
    ];
    for (const v of variants) {
      expect(isMissingActionQueueTransitionRpcError(v)).toBe(true);
    }
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
    // 42P01 without RPC name context must NOT trigger the missing-RPC banner.
    expect(
      isMissingActionQueueTransitionRpcError({
        code: "42P01",
        message: 'relation "other_table" does not exist',
      }),
    ).toBe(false);
    // Generic 404 body without RPC signals must not trigger.
    expect(
      isMissingActionQueueTransitionRpcError({
        status: 404,
        body: "Not Found",
      }),
    ).toBe(false);
  });

  it("tolerates cyclic error graphs without stack overflow", () => {
    const a: Record<string, unknown> = { message: "unrelated" };
    const b: Record<string, unknown> = { cause: a };
    a.cause = b;
    expect(() => isMissingActionQueueTransitionRpcError(a)).not.toThrow();
    expect(isMissingActionQueueTransitionRpcError(a)).toBe(false);
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
    expect(copy).toMatch(/was not saved/i);
    expect(copy).not.toMatch(/no status was updated/i);
    expect(copy).not.toMatch(/queue is unchanged/i);
    expect(copy).not.toMatch(/action_queue_transition/);
    expect(copy).not.toMatch(/PGRST/);
  });

  it("banner copy never names the RPC, never claims a global freeze, and never leaks provider codes", () => {
    const { title, body, label } = ACTION_QUEUE_TRANSITION_RPC_UNAVAILABLE_COPY;
    for (const text of [title, body, label, ACTION_QUEUE_TRANSITION_ATTEMPT_UNSAVED_COPY]) {
      expect(text).not.toMatch(/action_queue_transition/);
      expect(text).not.toMatch(/PGRST|42883|postgrest/i);
      expect(text).not.toMatch(/no status was updated/i);
      expect(text).not.toMatch(/queue is unchanged/i);
    }
    expect(body).toMatch(/paused until you refresh the queue/i);
    expect(body).toMatch(/No new status will be saved from those buttons/i);
    expect(ACTION_QUEUE_TRANSITION_ATTEMPT_UNSAVED_COPY).toMatch(/That decision was not saved/i);
  });
});

describe("settleActionQueueRpcAvailabilityOnCheckTimeout", () => {
  it("does not paint a false outage: unknown + timedOut stays unknown", () => {
    expect(settleActionQueueRpcAvailabilityOnCheckTimeout("unknown", true)).toBe("unknown");
  });

  it("keeps unknown before any timer elapses", () => {
    expect(settleActionQueueRpcAvailabilityOnCheckTimeout("unknown", false)).toBe("unknown");
  });

  it("never overwrites a settled available or unavailable state", () => {
    expect(settleActionQueueRpcAvailabilityOnCheckTimeout("available", true)).toBe("available");
    expect(settleActionQueueRpcAvailabilityOnCheckTimeout("available", false)).toBe("available");
    expect(settleActionQueueRpcAvailabilityOnCheckTimeout("unavailable", true)).toBe("unavailable");
    expect(settleActionQueueRpcAvailabilityOnCheckTimeout("unavailable", false)).toBe(
      "unavailable",
    );
  });
});

describe("areActionQueueTransitionMutationsBlocked", () => {
  it("blocks only the proven unavailable state", () => {
    expect(areActionQueueTransitionMutationsBlocked("unavailable")).toBe(true);
    expect(areActionQueueTransitionMutationsBlocked("unknown")).toBe(false);
    expect(areActionQueueTransitionMutationsBlocked("available")).toBe(false);
  });
});

describe("ActionQueue list page does not invent an RPC outage", () => {
  it("does not auto-timeout unknown availability into unavailable", () => {
    expect(ACTION_QUEUE_PAGE).not.toMatch(/settleActionQueueRpcAvailabilityOnCheckTimeout/);
    expect(ACTION_QUEUE_PAGE).not.toMatch(/ACTION_QUEUE_RPC_AVAILABILITY_CHECK_TIMEOUT_MS/);
  });

  it("fail-closes approve/reject/simulate/cancel/complete while the unavailable banner is showing", () => {
    expect(ACTION_QUEUE_PAGE).toMatch(
      /const disabled = busyId === row\.id \|\| transitionMutationsBlocked/,
    );
    expect(ACTION_QUEUE_PAGE).toMatch(
      /if \(areActionQueueTransitionMutationsBlocked\(rpcAvailability\)\) \{/,
    );
    expect(ACTION_DETAIL_PAGE).toMatch(/const disabled = busy \|\| rpcUnavailable/);
    expect(ACTION_DETAIL_PAGE).toMatch(
      /if \(areActionQueueTransitionMutationsBlocked\(rpcAvailability\)\) \{/,
    );
    const queueRpcIdx = ACTION_QUEUE_PAGE.indexOf(
      "if (areActionQueueTransitionMutationsBlocked(rpcAvailability)) {",
    );
    const queueCallIdx = ACTION_QUEUE_PAGE.indexOf('"action_queue_transition"');
    expect(queueRpcIdx).toBeGreaterThan(-1);
    expect(queueCallIdx).toBeGreaterThan(queueRpcIdx);
  });

  it("dismisses the sticky outage toast after a successful mutation", () => {
    for (const page of [ACTION_QUEUE_PAGE, ACTION_DETAIL_PAGE]) {
      expect(page).toContain(`toast.dismiss(${"ACTION_QUEUE_TRANSITION_RPC_TOAST_ID"})`);
      expect(page).toContain("ACTION_QUEUE_TRANSITION_ATTEMPT_UNSAVED_COPY");
      expect(page).toContain("id: ACTION_QUEUE_TRANSITION_RPC_TOAST_ID");
    }
    expect(ACTION_QUEUE_TRANSITION_RPC_TOAST_ID).toBe("action-queue-transition-rpc-unavailable");
  });
});
