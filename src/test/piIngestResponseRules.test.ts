import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  shapePiIngestFailureResponse,
  shapePiIngestResponse,
  shapePiIngestSuccessResponse,
} from "@/lib/piIngestResponseRules";
import type { PiIngestPipelineResult } from "@/lib/piIngestPipeline";

function failure(
  stage: PiIngestPipelineResult extends { ok: false; stage: infer S } ? S : never,
  code: string,
  message: string,
  extras: { retryAfterMs?: number; issueRetry?: number } = {},
): Extract<PiIngestPipelineResult, { ok: false }> {
  return {
    ok: false,
    stage,
    issues: [
      {
        stage,
        code,
        message,
        ...(extras.issueRetry !== undefined
          ? { retryAfterMs: extras.issueRetry }
          : {}),
      },
    ],
    ...(extras.retryAfterMs !== undefined
      ? { retryAfterMs: extras.retryAfterMs }
      : {}),
  };
}

describe("shapePiIngestSuccessResponse", () => {
  it("returns 200 with ok/inserted/rejected", () => {
    const r = shapePiIngestSuccessResponse({ inserted: 3, rejected: 0 });
    expect(r).toEqual({
      status: 200,
      headers: {},
      body: { ok: true, inserted: 3, rejected: 0 },
    });
  });

  it("defaults rejected to 0 when omitted", () => {
    const r = shapePiIngestSuccessResponse({ inserted: 5 });
    expect(r.body).toEqual({ ok: true, inserted: 5, rejected: 0 });
  });

  it("rejects non-integer inserted", () => {
    expect(() =>
      shapePiIngestSuccessResponse({ inserted: 1.5 }),
    ).toThrow(/inserted/);
    expect(() =>
      shapePiIngestSuccessResponse({ inserted: -1 }),
    ).toThrow(/inserted/);
  });

  it("rejects non-integer rejected", () => {
    expect(() =>
      shapePiIngestSuccessResponse({ inserted: 0, rejected: -1 }),
    ).toThrow(/rejected/);
  });
});

describe("shapePiIngestFailureResponse — status per stage", () => {
  it("auth -> 401", () => {
    const r = shapePiIngestFailureResponse(
      failure("auth", "invalid_signature", "bad sig"),
    );
    expect(r.status).toBe(401);
    expect(r.body).toEqual({
      ok: false,
      error: "invalid_signature",
      message: "bad sig",
    });
    expect(r.headers).toEqual({});
  });

  it("envelope -> 400", () => {
    expect(
      shapePiIngestFailureResponse(failure("envelope", "missing_tent_id", "x"))
        .status,
    ).toBe(400);
  });

  it("normalization -> 400", () => {
    expect(
      shapePiIngestFailureResponse(
        failure("normalization", "normalization_error", "x"),
      ).status,
    ).toBe(400);
  });

  it("batch_scope -> 400", () => {
    expect(
      shapePiIngestFailureResponse(failure("batch_scope", "unauthorized", "x"))
        .status,
    ).toBe(400);
  });

  it("abuse_guard -> 429 with Retry-After (top-level)", () => {
    const r = shapePiIngestFailureResponse(
      failure("abuse_guard", "rate_limited", "slow down", {
        retryAfterMs: 3200,
      }),
    );
    expect(r.status).toBe(429);
    expect(r.headers["Retry-After"]).toBe("4");
  });

  it("abuse_guard -> 429 falls back to issue.retryAfterMs", () => {
    const r = shapePiIngestFailureResponse(
      failure("abuse_guard", "rate_limited", "slow down", { issueRetry: 500 }),
    );
    expect(r.status).toBe(429);
    expect(r.headers["Retry-After"]).toBe("1");
  });

  it("abuse_guard -> 429 with no retry hint still includes Retry-After >= 1", () => {
    const r = shapePiIngestFailureResponse(
      failure("abuse_guard", "batch_too_large", "too big"),
    );
    expect(r.status).toBe(429);
    expect(r.headers["Retry-After"]).toBe("1");
  });

  it("failure body never includes inserted/rejected counts", () => {
    const r = shapePiIngestFailureResponse(
      failure("envelope", "missing_tent_id", "x"),
    );
    expect((r.body as Record<string, unknown>).inserted).toBeUndefined();
    expect((r.body as Record<string, unknown>).rejected).toBeUndefined();
  });
});

describe("shapePiIngestResponse — discriminated dispatch", () => {
  it("dispatches success to success shaper", () => {
    const r = shapePiIngestResponse({
      result: {
        ok: true,
        ownerUserId: "u",
        bridgeId: "b",
        tentId: "t",
        readingDrafts: [],
        idempotencyKeys: [],
      } as Extract<PiIngestPipelineResult, { ok: true }>,
      inserted: 2,
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, inserted: 2, rejected: 0 });
  });

  it("throws when success result is missing inserted count", () => {
    expect(() =>
      shapePiIngestResponse({
        result: {
          ok: true,
          ownerUserId: "u",
          bridgeId: "b",
          tentId: "t",
          readingDrafts: [],
          idempotencyKeys: [],
        } as Extract<PiIngestPipelineResult, { ok: true }>,
      }),
    ).toThrow(/inserted/);
  });

  it("dispatches failure to failure shaper", () => {
    const r = shapePiIngestResponse({
      result: failure("auth", "missing_bridge_id", "no bridge"),
    });
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ ok: false, error: "missing_bridge_id" });
  });
});

describe("piIngestResponseRules — static safety", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../lib/piIngestResponseRules.ts"),
    "utf8",
  );

  it("does not import supabase", () => {
    expect(SRC).not.toMatch(/@\/integrations\/supabase|@supabase\//);
  });

  it("does not import react", () => {
    expect(SRC).not.toMatch(/from\s+["']react["']/);
  });

  it("does not reference service_role", () => {
    expect(SRC).not.toMatch(/service_role/i);
  });

  it("does not perform fetch/network/io", () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  });

  it("is pure: no Date.now / no new Date() without input", () => {
    expect(SRC).not.toMatch(/Date\.now\s*\(/);
    expect(SRC).not.toMatch(/new\s+Date\s*\(\s*\)/);
  });
});
