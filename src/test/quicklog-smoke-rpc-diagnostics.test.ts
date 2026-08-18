import { describe, expect, it } from "vitest";
import {
  buildQuickLogKeyedAuditQueryUrl,
  buildQuickLogUnkeyedAuditQueryUrl,
  buildSafeQuickLogAuditDiagnostic,
  buildSafeQuickLogRpcDiagnostic,
  extractQuickLogAuditStartedAt,
  formatSafeQuickLogAuditDiagnostic,
  readSafeQuickLogIdempotencyKey,
  shouldReadQuickLogAuditDiagnostic,
} from "../../e2e/lib/quickLogSmokeRpcDiagnostics";

describe("Quick Log smoke RPC diagnostics", () => {
  it("keeps only an allowlisted PostgREST code from an error response", () => {
    const diagnostic = buildSafeQuickLogRpcDiagnostic(404, {
      code: "PGRST202",
      message: "Could not find a function containing a secret fixture id",
      details: "authorization bearer-secret",
      hint: "private schema detail",
    });

    expect(diagnostic).toEqual({
      httpStatus: 404,
      ok: null,
      code: "PGRST202",
      reason: null,
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(
      /secret|authorization|private|message|details|hint/i,
    );
  });

  it("keeps a known Quick Log reason but drops returned row identifiers", () => {
    const diagnostic = buildSafeQuickLogRpcDiagnostic(200, {
      ok: false,
      reason: "save_failed",
      grow_event_id: "00000000-0000-4000-8000-000000000001",
      environment_event_id: "00000000-0000-4000-8000-000000000002",
    });

    expect(diagnostic).toEqual({
      httpStatus: 200,
      ok: false,
      code: null,
      reason: "save_failed",
    });
    expect(JSON.stringify(diagnostic)).not.toContain("00000000");
  });

  it("drops attacker-controlled codes, reasons, and non-object response bodies", () => {
    expect(
      buildSafeQuickLogRpcDiagnostic(500, {
        code: "token=raw-secret",
        reason: "password-is-raw-secret",
        ok: "false",
      }),
    ).toEqual({ httpStatus: 500, ok: null, code: null, reason: null });

    expect(buildSafeQuickLogRpcDiagnostic(502, "raw upstream body")).toEqual({
      httpStatus: 502,
      ok: null,
      code: null,
      reason: null,
    });
  });

  it("normalizes invalid status values instead of reflecting arbitrary input", () => {
    expect(buildSafeQuickLogRpcDiagnostic(Number.NaN, null).httpStatus).toBe(0);
    expect(buildSafeQuickLogRpcDiagnostic(9999, null).httpStatus).toBe(0);
  });

  it("requests an owner-scoped audit receipt only for the generic save failure", () => {
    expect(
      shouldReadQuickLogAuditDiagnostic({
        httpStatus: 200,
        ok: false,
        code: null,
        reason: "save_failed",
      }),
    ).toBe(true);

    expect(
      shouldReadQuickLogAuditDiagnostic({
        httpStatus: 400,
        ok: null,
        code: "PGRST202",
        reason: null,
      }),
    ).toBe(false);

    const idempotencyKey = readSafeQuickLogIdempotencyKey({
      p_idempotency_key: "quicklog-v2-00000000-0000-4000-8000-000000000001",
      password: "raw-secret",
    });
    expect(idempotencyKey).toBe("quicklog-v2-00000000-0000-4000-8000-000000000001");
    expect(readSafeQuickLogIdempotencyKey({ p_idempotency_key: "unsafe key" })).toBeNull();

    const keyedUrl = new URL(
      buildQuickLogKeyedAuditQueryUrl(
        "https://project.supabase.co/rest/v1/rpc/quicklog_save_manual",
        idempotencyKey!,
      ),
    );

    expect(keyedUrl.origin).toBe("https://project.supabase.co");
    expect(keyedUrl.pathname).toBe("/rest/v1/quicklog_audit_events");
    expect(keyedUrl.searchParams.get("select")).toBe("status,reason,created_at");
    expect(keyedUrl.searchParams.get("idempotency_key")).toBe(`eq.${idempotencyKey}`);
    expect(keyedUrl.searchParams.get("order")).toBe("created_at.desc");
    expect(keyedUrl.searchParams.get("limit")).toBe("4");
    expect(keyedUrl.search).not.toMatch(/user_id|grow_event|target|note|password/i);

    const unkeyedUrl = new URL(
      buildQuickLogUnkeyedAuditQueryUrl(
        "https://project.supabase.co/rest/v1/rpc/quicklog_save_manual",
        "2026-08-18T00:02:30.000Z",
      ),
    );
    expect(unkeyedUrl.searchParams.get("select")).toBe("status,reason");
    expect(unkeyedUrl.searchParams.get("idempotency_key")).toBe("is.null");
    expect(unkeyedUrl.searchParams.get("status")).toBe("eq.save_failed");
    expect(unkeyedUrl.searchParams.get("created_at")).toBe("eq.2026-08-18T00:02:30.000Z");
    expect(unkeyedUrl.searchParams.get("limit")).toBe("4");
  });

  it("classifies a manual persistence SQLSTATE without serializing its correlation fields", () => {
    const keyedRows = [
      {
        status: "save_started",
        reason: null,
        created_at: "2026-08-18T00:02:30.000Z",
        id: "00000000-0000-4000-8000-000000000001",
        idempotency_key: "secret-key",
      },
    ];
    expect(extractQuickLogAuditStartedAt(keyedRows)).toBe("2026-08-18T00:02:30.000Z");

    const diagnostic = buildSafeQuickLogAuditDiagnostic(200, keyedRows, 200, [
      {
        status: "save_failed",
        reason: "42703",
        user_id: "00000000-0000-4000-8000-000000000002",
        grow_event_id: "00000000-0000-4000-8000-000000000003",
        raw_error: "private schema detail",
      },
    ]);

    expect(diagnostic).toEqual({
      keyedHttpStatus: 200,
      followupHttpStatus: 200,
      path: "manual_persist",
      status: "save_failed",
      sqlState: "42703",
      code: null,
    });
    expect(formatSafeQuickLogAuditDiagnostic(diagnostic)).toBe(
      "keyed_http_status=200, followup_http_status=200, path=manual_persist, status=save_failed, sqlstate=42703, code=none",
    );
    expect(JSON.stringify(diagnostic)).not.toMatch(
      /00000000|secret|private|raw_error|created_at|idempotency|header|url/i,
    );
  });

  it("classifies the exact keyed dual-timestamp failure without a follow-up read", () => {
    expect(
      buildSafeQuickLogAuditDiagnostic(200, [
        {
          status: "save_failed",
          reason: "dual_timestamp_persist_failed",
          created_at: "2026-08-18T00:02:30.000Z",
        },
      ]),
    ).toEqual({
      keyedHttpStatus: 200,
      followupHttpStatus: null,
      path: "dual_timestamp_persist",
      status: "save_failed",
      sqlState: null,
      code: null,
    });
  });

  it("fails closed for absent, ambiguous, malformed, and PostgREST audit responses", () => {
    expect(buildSafeQuickLogAuditDiagnostic(200, [])).toMatchObject({
      path: "unknown",
      status: null,
      sqlState: null,
    });
    expect(
      buildSafeQuickLogAuditDiagnostic(200, [
        { status: "attacker-controlled", reason: "password=secret" },
      ]),
    ).toMatchObject({ path: "unknown", status: null, sqlState: null });
    expect(
      buildSafeQuickLogAuditDiagnostic(404, {
        code: "PGRST205",
        message: "private schema message",
      }),
    ).toEqual({
      keyedHttpStatus: 404,
      followupHttpStatus: null,
      path: "unknown",
      status: null,
      sqlState: null,
      code: "PGRST205",
    });
  });
});
