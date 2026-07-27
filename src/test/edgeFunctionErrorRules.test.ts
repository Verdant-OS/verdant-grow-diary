import { describe, it, expect } from "vitest";
import {
  describeEdgeError,
  describeEdgeErrorResponse,
  isEdgeErrorCode,
  EDGE_ERROR_CODES,
} from "@/lib/edgeFunctionErrorRules";

const VALID_UUID = "6b1c9d2e-1111-4a22-8bbb-abcdef012345";

describe("edgeFunctionErrorRules", () => {
  it("isEdgeErrorCode narrows only known codes", () => {
    for (const code of EDGE_ERROR_CODES) expect(isEdgeErrorCode(code)).toBe(true);
    expect(isEdgeErrorCode("nope")).toBe(false);
    expect(isEdgeErrorCode(undefined)).toBe(false);
  });

  it("maps auth codes to reauth, non-retryable", () => {
    for (const c of ["missing_bearer_token", "invalid_jwt"] as const) {
      const p = describeEdgeError({ error_code: c, request_id: VALID_UUID }, 401);
      expect(p.code).toBe(c);
      expect(p.requiresReauth).toBe(true);
      expect(p.retryable).toBe(false);
      expect(p.retry.kind).toBe("none");
      expect(p.requestId).toBe(VALID_UUID);
      expect(p.message).not.toMatch(/jwt|bearer/i);
    }
  });

  it("operator_role_required is forbidden, no reauth, no retry", () => {
    const p = describeEdgeError({ error_code: "operator_role_required" }, 403);
    expect(p.retryable).toBe(false);
    expect(p.requiresReauth).toBe(false);
  });

  it("query_failed / role_check_failed are auto-retryable with bounded attempts", () => {
    for (const c of ["query_failed", "role_check_failed"] as const) {
      const p = describeEdgeError({ error_code: c }, 503);
      expect(p.retry.kind).toBe("auto");
      if (p.retry.kind === "auto") {
        expect(p.retry.maxAttempts).toBeGreaterThan(0);
        expect(p.retry.afterMs).toBeGreaterThan(0);
      }
    }
  });

  it("env_missing is manual retry only", () => {
    const p = describeEdgeError({ error_code: "env_missing" }, 503);
    expect(p.retry.kind).toBe("manual");
    expect(p.retryable).toBe(true);
  });

  it("unknown / missing code falls back safely without leaking input", () => {
    const p = describeEdgeError({ error: "boom stack@server.ts:42", error_code: "🤷" }, 500);
    expect(p.code).toBe("unknown");
    expect(p.message).not.toMatch(/boom|server\.ts/);
    expect(p.requestId).toBeNull();
  });

  it("rejects malformed request_id values", () => {
    const p = describeEdgeError({ error_code: "query_failed", request_id: "not-a-uuid" });
    expect(p.requestId).toBeNull();
  });

  it("describeEdgeErrorResponse reads json body and falls back to header request_id", async () => {
    const res = new Response(JSON.stringify({ error_code: "query_failed" }), {
      status: 503,
      headers: { "content-type": "application/json", "x-request-id": VALID_UUID },
    });
    const p = await describeEdgeErrorResponse(res);
    expect(p.code).toBe("query_failed");
    expect(p.status).toBe(503);
    expect(p.requestId).toBe(VALID_UUID);
  });

  it("describeEdgeErrorResponse tolerates non-json bodies", async () => {
    const res = new Response("<html>gateway</html>", { status: 502 });
    const p = await describeEdgeErrorResponse(res);
    expect(p.code).toBe("unknown");
    expect(p.status).toBe(502);
  });
});
