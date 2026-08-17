import { describe, expect, it } from "vitest";
import { buildSafeQuickLogRpcDiagnostic } from "../../e2e/lib/quickLogSmokeRpcDiagnostics";

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
});
