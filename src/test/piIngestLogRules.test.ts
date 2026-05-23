/**
 * Tests for the pure pi-ingest log-shaping rules.
 * No Supabase, no Edge Function, no I/O, no writes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  shapePiIngestAttemptLog,
  hashOwnerUserId,
  redactPiIngestLogRecord,
  type PiIngestAttemptLogRecord,
} from "@/lib/piIngestLogRules";
import type { PiIngestPipelineResult } from "@/lib/piIngestPipeline";

const OWNER = "owner-uuid-1";
const BRIDGE = "pi-bridge-1";
const TENT = "tent-uuid-1";

function success(): PiIngestPipelineResult {
  return {
    ok: true,
    ownerUserId: OWNER,
    bridgeId: BRIDGE,
    tentId: TENT,
    readingDrafts: [],
    idempotencyKeys: [],
  };
}

describe("hashOwnerUserId", () => {
  it("is deterministic", () => {
    expect(hashOwnerUserId(OWNER)).toBe(hashOwnerUserId(OWNER));
  });
  it("differs for different inputs", () => {
    expect(hashOwnerUserId("a")).not.toBe(hashOwnerUserId("b"));
  });
  it("produces an oid_ prefixed hex fingerprint", () => {
    expect(hashOwnerUserId(OWNER)).toMatch(/^oid_[0-9a-f]{16}$/);
  });
  it("does not echo the input", () => {
    const h = hashOwnerUserId(OWNER);
    expect(h.includes(OWNER)).toBe(false);
  });
  it("throws on empty input", () => {
    expect(() => hashOwnerUserId("")).toThrow();
  });
});

describe("shapePiIngestAttemptLog — success", () => {
  it("produces a success record with hashed owner and no sensitive fields", () => {
    const log = shapePiIngestAttemptLog({
      result: success(),
      partitionSummary: { total: 3, toInsert: 2, duplicates: 1 },
    });
    expect(log).toEqual<PiIngestAttemptLogRecord>({
      event: "pi_ingest_attempt",
      stage: "success",
      ok: true,
      bridgeId: BRIDGE,
      tentId: TENT,
      ownerUserIdHash: hashOwnerUserId(OWNER),
      total: 3,
      toInsert: 2,
      duplicates: 1,
    });
    expect(JSON.stringify(log)).not.toContain(OWNER);
  });

  it("omits counts when no partition summary is provided", () => {
    const log = shapePiIngestAttemptLog({ result: success() });
    expect(log.total).toBeUndefined();
    expect(log.toInsert).toBeUndefined();
    expect(log.duplicates).toBeUndefined();
    expect(log.ok).toBe(true);
  });
});

describe("shapePiIngestAttemptLog — failure", () => {
  it("shapes an auth failure as 401-stage with rejectedCode", () => {
    const log = shapePiIngestAttemptLog({
      result: {
        ok: false,
        stage: "auth",
        issues: [{ stage: "auth", code: "bad_signature", message: "nope" }],
      },
    });
    expect(log.event).toBe("pi_ingest_attempt");
    expect(log.stage).toBe("auth");
    expect(log.ok).toBe(false);
    expect(log.rejectedCode).toBe("bad_signature");
    expect(log.retryAfterMs).toBeUndefined();
    expect(log.bridgeId).toBeUndefined();
    expect(log.tentId).toBeUndefined();
    expect(log.ownerUserIdHash).toBeUndefined();
  });

  it("propagates retryAfterMs from top-level for abuse_guard failures", () => {
    const log = shapePiIngestAttemptLog({
      result: {
        ok: false,
        stage: "abuse_guard",
        retryAfterMs: 4200,
        issues: [
          {
            stage: "abuse_guard",
            code: "rate_limited",
            message: "slow down",
            retryAfterMs: 4200,
          },
        ],
      },
    });
    expect(log.stage).toBe("abuse_guard");
    expect(log.rejectedCode).toBe("rate_limited");
    expect(log.retryAfterMs).toBe(4200);
  });

  it("falls back to issue.retryAfterMs when top-level is missing", () => {
    const log = shapePiIngestAttemptLog({
      result: {
        ok: false,
        stage: "abuse_guard",
        issues: [
          {
            stage: "abuse_guard",
            code: "rate_limited",
            message: "slow",
            retryAfterMs: 1500,
          },
        ],
      },
    });
    expect(log.retryAfterMs).toBe(1500);
  });

  it("derives a synthetic rejectedCode when issues are empty", () => {
    const log = shapePiIngestAttemptLog({
      result: { ok: false, stage: "envelope", issues: [] },
    });
    expect(log.rejectedCode).toBe("envelope_error");
  });
});

describe("redactPiIngestLogRecord", () => {
  it("strips known sensitive keys", () => {
    const out = redactPiIngestLogRecord({
      event: "pi_ingest_attempt",
      stage: "success",
      ok: true,
      bridgeId: BRIDGE,
      raw: { secret: "x" },
      raw_payload: { v: 1 },
      payload: "no",
      body: "no",
      signature: "abc",
      hmac: "abc",
      secret: "abc",
      bridgeSecret: "abc",
      bridge_secret: "abc",
      token: "abc",
      authorization: "Bearer x",
      value: 24.2,
      values: [1, 2],
      readings: [{ metric: "temperature_c", value: 24 }],
      command: "rm -rf /",
      target_device: "fan",
      device_command: "on",
    } as Record<string, unknown>);
    const str = JSON.stringify(out);
    for (const banned of [
      "secret",
      "signature",
      "hmac",
      "raw_payload",
      "Bearer",
      "rm -rf",
      "readings",
      "values",
    ]) {
      expect(str).not.toContain(banned);
    }
    expect(out.event).toBe("pi_ingest_attempt");
    expect(out.bridgeId).toBe(BRIDGE);
  });

  it("forces the event marker even if missing", () => {
    const out = redactPiIngestLogRecord({ stage: "auth", ok: false });
    expect(out.event).toBe("pi_ingest_attempt");
  });
});

describe("static safety", () => {
  const src = readFileSync(
    resolve(__dirname, "../lib/piIngestLogRules.ts"),
    "utf8",
  );
  it("does not import Supabase, React, or perform I/O", () => {
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/from\s+["']react/);
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/createClient/);
    expect(src).not.toMatch(/from\s+["']node:/);
  });
  it("only type-imports from pure pi-ingest modules", () => {
    expect(src).toMatch(/from\s+["']\.\/piIngestPipeline["']/);
    expect(src).toMatch(/from\s+["']\.\/piIngestInsertPlanRules["']/);
  });
});
