import { describe, expect, it } from "vitest";
import { isMissingRpcError, MissingAuditRpcError } from "@/lib/rpcAvailability/missingRpcError";

describe("isMissingRpcError", () => {
  const rpc = "breeding_log_save_event";

  it("detects PGRST202 schema-cache miss for the named RPC", () => {
    expect(
      isMissingRpcError(
        {
          code: "PGRST202",
          message: `Could not find the function public.${rpc}(...) in the schema cache`,
        },
        rpc,
      ),
    ).toBe(true);
  });

  it("detects Postgres 42883 undefined_function for the named RPC", () => {
    expect(
      isMissingRpcError(
        { code: "42883", message: `function ${rpc}(uuid, uuid) does not exist` },
        rpc,
      ),
    ).toBe(true);
  });

  it("detects the missing-RPC message text without a code", () => {
    expect(
      isMissingRpcError({ message: `Could not find the function public.${rpc}(...)` }, rpc),
    ).toBe(true);
  });

  it("recurses into wrapper shapes (e.g. { error })", () => {
    expect(
      isMissingRpcError(
        {
          status: 404,
          error: {
            code: "PGRST202",
            message: `Could not find the function ${rpc}(...) in the schema cache`,
          },
        },
        rpc,
      ),
    ).toBe(true);
  });

  it("ignores unrelated RPC misses so it doesn't poison the fallback", () => {
    expect(
      isMissingRpcError(
        { code: "42883", message: "function some_other_rpc(uuid) does not exist" },
        rpc,
      ),
    ).toBe(false);
  });

  it("returns false for generic Supabase errors", () => {
    expect(isMissingRpcError({ code: "23505", message: "duplicate key value" }, rpc)).toBe(false);
  });

  it("returns false for non-object inputs and cyclic guards", () => {
    expect(isMissingRpcError(null, rpc)).toBe(false);
    expect(isMissingRpcError("string", rpc)).toBe(false);
    const cyclic: Record<string, unknown> = { code: "23505", message: "x" };
    cyclic.cause = cyclic;
    expect(isMissingRpcError(cyclic, rpc)).toBe(false);
  });
});

describe("MissingAuditRpcError", () => {
  it("preserves rpcName and cause for logging without leaking to UI copy", () => {
    const cause = { code: "PGRST202", message: "..." };
    const err = new MissingAuditRpcError("breeding_log_save_event", cause);
    expect(err.rpcName).toBe("breeding_log_save_event");
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("MissingAuditRpcError");
    expect(err.message).toContain("breeding_log_save_event");
  });
});
