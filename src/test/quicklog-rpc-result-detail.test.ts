/**
 * Regression: the Quick Log dual-timestamp harness reported RPC failures as a
 * bare "null" (JSON.stringify(result.data)), hiding the HTTP status and the
 * PostgREST/transport error. Two CI failures (#1867 @ 4108949a, #1877 @
 * cf27a127) were therefore misread as "the RPC returned null with no error".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyRpcResult,
  describeRpcResult,
  rpcResultDetail,
} from "../../scripts/lib/rpcResultDetail";

const HARNESS = readFileSync(
  resolve(__dirname, "../../scripts/run-quicklog-dual-timestamp-rls-harness.ts"),
  "utf8",
);

/** Every `check(...)` call in the harness, with balanced parentheses. */
function harnessCheckCalls(source: string): string[] {
  const calls: string[] = [];
  const opener = /(^|[^\w.])check\(/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source))) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") depth--;
    }
    calls.push(source.slice(start, i - 1));
  }
  return calls;
}

// The two anon checks assert the call is refused and intentionally print only
// error?.code; they are the only RPC checks allowed to skip the formatter.
const ANON_REFUSAL_CHECKS = [
  "anon has no EXECUTE on event RPC",
  "anon has no EXECUTE on manual RPC",
];

describe("describeRpcResult", () => {
  it("names an HTTP error that supabase-js resolves as data:null", () => {
    const out = JSON.parse(
      describeRpcResult({
        data: null,
        error: { code: "PGRST002", message: "schema cache", details: null, hint: null },
        status: 503,
        statusText: "Service Unavailable",
      }),
    );
    expect(out.kind).toBe("http_error");
    expect(out.status).toBe(503);
    expect(out.error.code).toBe("PGRST002");
    expect(out.data).toBeNull();
  });

  it("names a transport failure (status 0)", () => {
    const result = {
      data: null,
      error: { message: "TypeError: fetch failed", details: "x".repeat(2000), hint: "", code: "" },
      status: 0,
      statusText: "",
    };
    expect(classifyRpcResult(result)).toBe("transport_error");
    const out = JSON.parse(describeRpcResult(result));
    expect(out.error.message).toBe("TypeError: fetch failed");
    expect(String(out.error.details).length).toBeLessThanOrEqual(501);
  });

  it("flags postgrest-js's 404-empty-body rewrite to 204 / error:null", () => {
    expect(
      classifyRpcResult({ data: null, error: null, status: 204, statusText: "No Content" }),
    ).toBe("empty_body_204_or_rewritten_404");
  });

  it("caps data and object-valued error details at 500 chars", () => {
    const detail = rpcResultDetail({
      data: { blob: "y".repeat(5000) },
      error: { code: "X", message: "m", details: { nested: "z".repeat(5000) }, hint: null },
      status: 500,
    });
    expect(typeof detail.data).toBe("string");
    expect(String(detail.data).length).toBeLessThanOrEqual(501);
    expect(typeof detail.error?.details).toBe("string");
    expect(String(detail.error?.details).length).toBeLessThanOrEqual(501);
    // Small objects stay structured.
    expect(rpcResultDetail({ data: { ok: true }, error: null, status: 200 }).data).toEqual({
      ok: true,
    });
    expect(describeRpcResult({ data: { ok: true }, status: 200 })).toBe(
      JSON.stringify(rpcResultDetail({ data: { ok: true }, status: 200 })),
    );
  });

  it("reports a 200 with null data (SQL NULL or empty 2xx body) separately from errors", () => {
    expect(classifyRpcResult({ data: null, error: null, status: 200, statusText: "OK" })).toBe(
      "null_data_without_error",
    );
    expect(classifyRpcResult({ data: { ok: false }, error: null, status: 200 })).toBe("ok_data");
    expect(classifyRpcResult(undefined)).toBe("no_result");
  });
});

describe("dual-timestamp harness reports full RPC results", () => {
  it("imports the formatter", () => {
    expect(HARNESS).toMatch(
      /import \{ describeRpcResult, rpcResultDetail \} from "\.\/lib\/rpcResultDetail";/,
    );
  });

  it("never prints only result.data for an RPC check", () => {
    expect(HARNESS).not.toMatch(/JSON\.stringify\(\w+\.data\)/);
    // Also no raw `.data` inside an object detail such as JSON.stringify({ x: r.data }).
    expect(HARNESS).not.toMatch(/JSON\.stringify\(\{[^}]*\b\w+\.data\b/);
  });

  it("formats every check that inspects an RPC result's data or error", () => {
    const calls = harnessCheckCalls(HARNESS);
    expect(calls.length).toBeGreaterThan(40);
    const unformatted = calls
      .filter((call) => /\b\w+\.(data|error)\b/.test(call))
      .filter((call) => !ANON_REFUSAL_CHECKS.some((name) => call.includes(name)))
      .filter((call) => !/\b(describeRpcResult|rpcResultDetail)\(/.test(call))
      .map((call) => call.trim().split("\n")[0]);
    expect(unformatted).toEqual([]);
  });

  it("covers the three checks that failed intermittently in CI", () => {
    expect(HARNESS).toMatch(
      /preserves invalid_details for non-object JSON[\s\S]{0,300}describeRpcResult\(scalarManual\)/,
    );
    expect(HARNESS).toMatch(
      /response-loss witness Note is accepted[\s\S]{0,200}describeRpcResult\(witness\)/,
    );
    expect(HARNESS).toMatch(
      /response-loss witness setup failed: \$\{describeRpcResult\(witness\)\}/,
    );
    expect(HARNESS).toMatch(
      /no active diary receipt refuses reuse[\s\S]{0,700}describeRpcResult\(missingReceiptRetry\)/,
    );
  });
});
