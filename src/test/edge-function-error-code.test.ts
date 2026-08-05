/**
 * readEdgeFunctionErrorCode — the single reader for the sanitized
 * `{ error: "..." }` discriminator our edge functions return on non-2xx.
 *
 * Pinned against the real supabase-js failure shape: `FunctionsHttpError`
 * carries the raw `Response` on `.context`. `Response.body` is a
 * `ReadableStream`, so any extraction that treats `.context` as a
 * `{ status, body }` envelope reads `undefined` forever — the bug this
 * helper exists to prevent.
 */
import { describe, it, expect } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { readEdgeFunctionErrorCode } from "@/lib/edgeFunctionError";

function httpError(status: number, body: string): FunctionsHttpError {
  return new FunctionsHttpError(
    new Response(body, { status, headers: { "Content-Type": "application/json" } }),
  );
}

describe("readEdgeFunctionErrorCode", () => {
  it("reads the error code off a real FunctionsHttpError Response", async () => {
    const error = httpError(404, JSON.stringify({ error: "lifetime_only" }));
    await expect(readEdgeFunctionErrorCode(error)).resolves.toBe("lifetime_only");
  });

  it("clones the body, leaving the original readable for everyone else", async () => {
    const error = httpError(409, JSON.stringify({ error: "plan_sold_out" }));
    // Repeat reads only work because each call clones instead of consuming.
    await expect(readEdgeFunctionErrorCode(error)).resolves.toBe("plan_sold_out");
    await expect(readEdgeFunctionErrorCode(error)).resolves.toBe("plan_sold_out");
    expect((error.context as Response).bodyUsed).toBe(false);
    // ...and the caller's own read of the untouched original still works.
    await expect((error.context as Response).json()).resolves.toEqual({
      error: "plan_sold_out",
    });
  });

  it("degrades to null (never throws) once something else drained the body", async () => {
    const error = httpError(404, JSON.stringify({ error: "lifetime_only" }));
    await (error.context as Response).json(); // caller consumes it first
    // A disturbed Response cannot be cloned; that must not escape as a throw,
    // or callers lose their status-based fallbacks to a generic catch.
    await expect(readEdgeFunctionErrorCode(error)).resolves.toBeNull();
  });

  it("proves the raw Response.body is a stream, not a parsed envelope", async () => {
    const error = httpError(404, JSON.stringify({ error: "lifetime_only" }));
    const ctx = error.context as Response;
    // The shape that made the old extraction dead code: an object with no `error`.
    expect(typeof ctx.body).toBe("object");
    expect((ctx.body as unknown as { error?: unknown })?.error).toBeUndefined();
    // The helper reads through it anyway.
    await expect(readEdgeFunctionErrorCode(error)).resolves.toBe("lifetime_only");
  });

  it("returns null for a non-JSON body instead of throwing", async () => {
    const error = new FunctionsHttpError(
      new Response("<html>gateway error</html>", { status: 502 }),
    );
    await expect(readEdgeFunctionErrorCode(error)).resolves.toBeNull();
  });

  it("returns null for an empty body", async () => {
    await expect(readEdgeFunctionErrorCode(httpError(404, ""))).resolves.toBeNull();
  });

  it("returns null when the JSON body carries no string `error`", async () => {
    await expect(
      readEdgeFunctionErrorCode(httpError(500, JSON.stringify({ error: { nested: true } }))),
    ).resolves.toBeNull();
    await expect(
      readEdgeFunctionErrorCode(httpError(500, JSON.stringify({ message: "nope" }))),
    ).resolves.toBeNull();
  });

  it("returns null for errors with no usable context", async () => {
    await expect(readEdgeFunctionErrorCode(new Error("network down"))).resolves.toBeNull();
    await expect(readEdgeFunctionErrorCode(null)).resolves.toBeNull();
    await expect(readEdgeFunctionErrorCode(undefined)).resolves.toBeNull();
    await expect(readEdgeFunctionErrorCode({ context: { status: 404 } })).resolves.toBeNull();
  });
});
