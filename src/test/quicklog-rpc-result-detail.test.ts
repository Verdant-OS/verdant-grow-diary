/**
 * Regression: the Quick Log dual-timestamp harness reported RPC failures as a
 * bare "null" (JSON.stringify(result.data)), hiding the HTTP status and the
 * PostgREST/transport error. Two CI failures (#1867 @ 4108949a, #1877 @
 * cf27a127) were therefore misread as "the RPC returned null with no error".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyRpcResult, describeRpcResult } from "../../scripts/lib/rpcResultDetail";

const HARNESS = readFileSync(
  resolve(__dirname, "../../scripts/run-quicklog-dual-timestamp-rls-harness.ts"),
  "utf8",
);

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

  it("separates a genuine SQL NULL (200, null body) from errors", () => {
    expect(classifyRpcResult({ data: null, error: null, status: 200, statusText: "OK" })).toBe(
      "null_data_without_error",
    );
    expect(classifyRpcResult({ data: { ok: false }, error: null, status: 200 })).toBe("ok_data");
    expect(classifyRpcResult(undefined)).toBe("no_result");
  });
});

describe("dual-timestamp harness reports full RPC results", () => {
  it("imports the formatter", () => {
    expect(HARNESS).toMatch(/import \{ describeRpcResult \} from "\.\/lib\/rpcResultDetail";/);
  });

  it("never prints only result.data for an RPC check", () => {
    expect(HARNESS).not.toMatch(/JSON\.stringify\(\w+\.data\)/);
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
