import { describe, it, expect } from "vitest";
import {
  parseActionQueueUrlState,
  serializeActionQueueUrlState,
  ACTION_QUEUE_URL_DEFAULTS,
  ACTION_QUEUE_URL_QUERY_MAX_LEN,
} from "@/lib/actionQueueUrlStateRules";

function sp(s: string): URLSearchParams {
  return new URLSearchParams(s);
}

describe("parseActionQueueUrlState", () => {
  it("returns defaults for empty/missing", () => {
    expect(parseActionQueueUrlState(sp(""))).toEqual(ACTION_QUEUE_URL_DEFAULTS);
    expect(parseActionQueueUrlState(null)).toEqual(ACTION_QUEUE_URL_DEFAULTS);
  });

  it("restores full state from URL", () => {
    const state = parseActionQueueUrlState(
      sp("q=humidity&status=rejected&trace=failed&page=2&pageSize=25"),
    );
    expect(state).toEqual({
      q: "humidity",
      status: "rejected",
      trace: "failed",
      page: 2,
      pageSize: 25,
    });
  });

  it("falls back safely on invalid values", () => {
    const state = parseActionQueueUrlState(
      sp("status=bogus&trace=zzz&page=-7&pageSize=999"),
    );
    expect(state.status).toBe("all");
    expect(state.trace).toBe("all");
    expect(state.page).toBe(1);
    expect(state.pageSize).toBe(25);
  });

  it("clips long queries and strips control chars", () => {
    const q = "a".repeat(500);
    const parsed = parseActionQueueUrlState(sp(`q=${q}\u0001bad`));
    expect(parsed.q.length).toBeLessThanOrEqual(ACTION_QUEUE_URL_QUERY_MAX_LEN);
    expect(parsed.q.includes("\u0001")).toBe(false);
  });
});

describe("serializeActionQueueUrlState", () => {
  it("omits keys that match defaults", () => {
    const out = serializeActionQueueUrlState(
      sp(""),
      ACTION_QUEUE_URL_DEFAULTS,
    );
    expect(out.toString()).toBe("");
  });

  it("preserves unrelated params on the base", () => {
    const out = serializeActionQueueUrlState(
      sp("growId=g-1&focus=aq-1"),
      { ...ACTION_QUEUE_URL_DEFAULTS, status: "approved" },
    );
    expect(out.get("growId")).toBe("g-1");
    expect(out.get("focus")).toBe("aq-1");
    expect(out.get("status")).toBe("approved");
  });

  it("round-trips full state deterministically", () => {
    const start = {
      q: "calmag",
      status: "approved" as const,
      trace: "failed" as const,
      page: 3,
      pageSize: 10 as const,
    };
    const out = serializeActionQueueUrlState(sp(""), start);
    const parsed = parseActionQueueUrlState(out);
    expect(parsed).toEqual(start);
  });

  it("never persists raw payload, service role, bridge tokens, or hidden metadata keys", () => {
    const out = serializeActionQueueUrlState(sp(""), {
      ...ACTION_QUEUE_URL_DEFAULTS,
      q: "anything",
      status: "rejected",
      trace: "failed",
      page: 2,
      pageSize: 25,
    });
    const allowed = new Set(["q", "status", "trace", "page", "pageSize"]);
    for (const [key] of out) {
      expect(allowed.has(key)).toBe(true);
    }
  });
});
