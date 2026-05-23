/**
 * Tests for pure rate-limit and abuse-guard rules.
 * No Supabase, no Edge Function, no network, no writes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  evaluateBridgeAbuseGuard,
  evaluateBridgeBatchLimit,
  evaluateBridgeRateLimit,
} from "@/lib/piIngestRateLimitRules";

const BRIDGE = "pi-bridge-1";
const NOW = 1_700_000_000_000;
const WINDOW = 60_000; // 1 minute
const MAX_REQ = 5;
const MAX_BATCH = 50;

const tsAgo = (ms: number) => NOW - ms;

describe("evaluateBridgeRateLimit", () => {
  it("allows request below limit", () => {
    const r = evaluateBridgeRateLimit({
      bridgeId: BRIDGE,
      now: NOW,
      recentRequestTimestamps: [tsAgo(10_000), tsAgo(5_000)],
      windowMs: WINDOW,
      maxRequestsPerWindow: MAX_REQ,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.countInWindow).toBe(2);
      expect(r.remaining).toBe(3);
    }
  });

  it("denies request at limit and returns retryAfterMs", () => {
    const r = evaluateBridgeRateLimit({
      bridgeId: BRIDGE,
      now: NOW,
      recentRequestTimestamps: [
        tsAgo(50_000),
        tsAgo(40_000),
        tsAgo(30_000),
        tsAgo(20_000),
        tsAgo(10_000),
      ],
      windowMs: WINDOW,
      maxRequestsPerWindow: MAX_REQ,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect((r as any).code).toBe("rate_limited");
      // Oldest in-window is 50s ago; retry when it falls out of the window: 10s.
      expect((r as any).retryAfterMs).toBe(10_000);
    }
  });

  it("ignores timestamps outside the window", () => {
    const r = evaluateBridgeRateLimit({
      bridgeId: BRIDGE,
      now: NOW,
      recentRequestTimestamps: [
        tsAgo(WINDOW + 1_000), // outside
        tsAgo(WINDOW * 2),     // outside
        tsAgo(5_000),          // inside
      ],
      windowMs: WINDOW,
      maxRequestsPerWindow: MAX_REQ,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.countInWindow).toBe(1);
  });

  it("counts timestamps inside the window", () => {
    const r = evaluateBridgeRateLimit({
      bridgeId: BRIDGE,
      now: NOW,
      recentRequestTimestamps: [tsAgo(1), tsAgo(2), tsAgo(WINDOW - 1)],
      windowMs: WINDOW,
      maxRequestsPerWindow: MAX_REQ,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.countInWindow).toBe(3);
  });

  it("rejects missing bridgeId", () => {
    const r = evaluateBridgeRateLimit({
      bridgeId: "",
      now: NOW,
      recentRequestTimestamps: [],
      windowMs: WINDOW,
      maxRequestsPerWindow: MAX_REQ,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("missing_bridge_id");
  });

  it("rejects invalid now", () => {
    const r = evaluateBridgeRateLimit({
      bridgeId: BRIDGE,
      now: Number.NaN,
      recentRequestTimestamps: [],
      windowMs: WINDOW,
      maxRequestsPerWindow: MAX_REQ,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("invalid_now");
  });

  it("rejects invalid windowMs", () => {
    const r = evaluateBridgeRateLimit({
      bridgeId: BRIDGE,
      now: NOW,
      recentRequestTimestamps: [],
      windowMs: 0,
      maxRequestsPerWindow: MAX_REQ,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("invalid_window_ms");
  });

  it("rejects invalid maxRequestsPerWindow", () => {
    const r = evaluateBridgeRateLimit({
      bridgeId: BRIDGE,
      now: NOW,
      recentRequestTimestamps: [],
      windowMs: WINDOW,
      maxRequestsPerWindow: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("invalid_max_requests");
  });

  it("does not mutate the input timestamps array", () => {
    const ts = [tsAgo(10_000), tsAgo(5_000), tsAgo(WINDOW + 9_999)];
    const snapshot = [...ts];
    evaluateBridgeRateLimit({
      bridgeId: BRIDGE,
      now: NOW,
      recentRequestTimestamps: ts,
      windowMs: WINDOW,
      maxRequestsPerWindow: MAX_REQ,
    });
    expect(ts).toEqual(snapshot);
  });

  it("is deterministic for identical inputs", () => {
    const args = {
      bridgeId: BRIDGE,
      now: NOW,
      recentRequestTimestamps: [tsAgo(10_000), tsAgo(5_000)],
      windowMs: WINDOW,
      maxRequestsPerWindow: MAX_REQ,
    };
    expect(evaluateBridgeRateLimit(args)).toEqual(evaluateBridgeRateLimit(args));
  });
});

describe("evaluateBridgeBatchLimit", () => {
  it("allows valid batch size", () => {
    const r = evaluateBridgeBatchLimit({
      bridgeId: BRIDGE,
      readingCount: 10,
      maxReadingsPerBatch: MAX_BATCH,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects reading count 0", () => {
    const r = evaluateBridgeBatchLimit({
      bridgeId: BRIDGE,
      readingCount: 0,
      maxReadingsPerBatch: MAX_BATCH,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("invalid_reading_count");
  });

  it("rejects negative reading count", () => {
    const r = evaluateBridgeBatchLimit({
      bridgeId: BRIDGE,
      readingCount: -3,
      maxReadingsPerBatch: MAX_BATCH,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("invalid_reading_count");
  });

  it("rejects non-integer reading count", () => {
    const r = evaluateBridgeBatchLimit({
      bridgeId: BRIDGE,
      readingCount: 3.5,
      maxReadingsPerBatch: MAX_BATCH,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("invalid_reading_count");
  });

  it("rejects batch larger than max", () => {
    const r = evaluateBridgeBatchLimit({
      bridgeId: BRIDGE,
      readingCount: MAX_BATCH + 1,
      maxReadingsPerBatch: MAX_BATCH,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("batch_too_large");
  });

  it("rejects invalid maxReadingsPerBatch", () => {
    const r = evaluateBridgeBatchLimit({
      bridgeId: BRIDGE,
      readingCount: 10,
      maxReadingsPerBatch: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("invalid_max_readings_per_batch");
  });

  it("rejects missing bridgeId", () => {
    const r = evaluateBridgeBatchLimit({
      bridgeId: "",
      readingCount: 10,
      maxReadingsPerBatch: MAX_BATCH,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("missing_bridge_id");
  });
});

describe("evaluateBridgeAbuseGuard", () => {
  const baseAllow = {
    bridgeId: BRIDGE,
    now: NOW,
    recentRequestTimestamps: [tsAgo(10_000)],
    windowMs: WINDOW,
    maxRequestsPerWindow: MAX_REQ,
    readingCount: 10,
    maxReadingsPerBatch: MAX_BATCH,
  };

  it("allows when both checks pass", () => {
    const r = evaluateBridgeAbuseGuard(baseAllow);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.countInWindow).toBe(1);
      expect(r.remaining).toBe(MAX_REQ - 1);
      expect(r.readingCount).toBe(10);
    }
  });

  it("denies when rate-limited and includes retryAfterMs", () => {
    const r = evaluateBridgeAbuseGuard({
      ...baseAllow,
      recentRequestTimestamps: [
        tsAgo(50_000),
        tsAgo(40_000),
        tsAgo(30_000),
        tsAgo(20_000),
        tsAgo(10_000),
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect((r as any).failures.some((f) => f.code === "rate_limited")).toBe(true);
      expect((r as any).retryAfterMs).toBe(10_000);
    }
  });

  it("denies when batch is too large", () => {
    const r = evaluateBridgeAbuseGuard({
      ...baseAllow,
      readingCount: MAX_BATCH + 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as any).failures.some((f) => f.code === "batch_too_large")).toBe(true);
  });

  it("returns multiple failure reasons when both checks fail", () => {
    const r = evaluateBridgeAbuseGuard({
      ...baseAllow,
      recentRequestTimestamps: [
        tsAgo(50_000),
        tsAgo(40_000),
        tsAgo(30_000),
        tsAgo(20_000),
        tsAgo(10_000),
      ],
      readingCount: MAX_BATCH + 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const codes = (r as any).failures.map((f) => f.code);
      expect(codes).toContain("rate_limited");
      expect(codes).toContain("batch_too_large");
      expect((r as any).failures.length).toBeGreaterThanOrEqual(2);
      expect((r as any).retryAfterMs).toBe(10_000);
    }
  });
});

// ------------- Static safety -------------

const SRC = readFileSync(
  resolve(__dirname, "../lib/piIngestRateLimitRules.ts"),
  "utf8",
);

describe("piIngestRateLimitRules — static safety", () => {
  it("does not import Supabase or React", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/@supabase\/supabase-js/);
    expect(SRC).not.toMatch(/from\s+["']react["']/);
    expect(SRC).not.toMatch(/from\s+["']react\//);
  });

  it("does not perform DB calls or use Date.now()", () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/\.(from|insert|update|delete|upsert|rpc)\s*\(/);
    expect(SRC).not.toMatch(/\bDate\.now\s*\(/);
  });

  it("does not reference service_role or forbidden persistence surfaces", () => {
    expect(SRC).not.toMatch(/service_role/);
    expect(SRC).not.toMatch(/\baction_queue\b/);
    expect(SRC).not.toMatch(/\balerts\b/);
    expect(SRC).not.toMatch(/\balert_events\b/);
  });

  it("does not reference MQTT/Home Assistant/Pi bridge runtime or automation", () => {
    expect(SRC).not.toMatch(
      /\bmqtt\b|home[\s_-]?assistant|automation|device[\s_-]?control/i,
    );
  });
});
