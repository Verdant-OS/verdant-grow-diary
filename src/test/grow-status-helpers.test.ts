/**
 * Pure helper tests for src/lib/growStatus.ts
 * No I/O, no React, no Supabase.
 */
import { describe, it, expect } from "vitest";
import {
  deriveStatus,
  rankRisk,
  mergeRecent,
  formatCount,
  UNAVAILABLE_STATUS,
} from "@/lib/growStatus";

const NOW = new Date("2026-05-20T12:00:00Z").getTime();
const DAY = 86400000;

describe("growStatus.rankRisk", () => {
  it("returns 'unknown' for null/undefined (failure)", () => {
    expect(rankRisk(null)).toBe("unknown");
    expect(rankRisk(undefined)).toBe("unknown");
  });
  it("returns 'none' for empty rows", () => {
    expect(rankRisk([])).toBe("none");
  });
  it("picks the highest of mixed risks", () => {
    expect(
      rankRisk([
        { risk_level: "low" },
        { risk_level: "critical" },
        { risk_level: "medium" },
      ]),
    ).toBe("critical");
    expect(rankRisk([{ risk_level: "high" }, { risk_level: "medium" }])).toBe("high");
    expect(rankRisk([{ risk_level: "medium" }, { risk_level: "low" }])).toBe("medium");
    expect(rankRisk([{ risk_level: "low" }])).toBe("low");
  });
  it("treats null risk_level as low", () => {
    expect(rankRisk([{ risk_level: null }])).toBe("low");
  });
});

describe("growStatus.deriveStatus", () => {
  it("high pending risk → needs_review", () => {
    const r = deriveStatus({ pending: 2, highestRisk: "high", lastDiaryAt: new Date(NOW).toISOString(), now: NOW });
    expect(r.level).toBe("needs_review");
    expect(r.reason).toMatch(/high/);
  });
  it("critical pending risk → needs_review", () => {
    const r = deriveStatus({ pending: 1, highestRisk: "critical", lastDiaryAt: null, now: NOW });
    expect(r.level).toBe("needs_review");
  });
  it("low/medium pending → watch", () => {
    expect(
      deriveStatus({ pending: 3, highestRisk: "medium", lastDiaryAt: new Date(NOW).toISOString(), now: NOW }).level,
    ).toBe("watch");
    expect(
      deriveStatus({ pending: 1, highestRisk: "low", lastDiaryAt: new Date(NOW).toISOString(), now: NOW }).level,
    ).toBe("watch");
  });
  it("no pending + recent diary → good", () => {
    const r = deriveStatus({
      pending: 0,
      highestRisk: "none",
      lastDiaryAt: new Date(NOW - 2 * DAY).toISOString(),
      now: NOW,
    });
    expect(r.level).toBe("good");
  });
  it("no pending + stale (>7d) diary → watch", () => {
    const r = deriveStatus({
      pending: 0,
      highestRisk: "none",
      lastDiaryAt: new Date(NOW - 10 * DAY).toISOString(),
      now: NOW,
    });
    expect(r.level).toBe("watch");
    expect(r.reason).toMatch(/10 days/);
  });
  it("no pending + no diary → watch", () => {
    const r = deriveStatus({ pending: 0, highestRisk: "none", lastDiaryAt: null, now: NOW });
    expect(r.level).toBe("watch");
    expect(r.reason).toMatch(/No diary/);
  });
  it("pending unavailable + risk unknown → unavailable", () => {
    const r = deriveStatus({ pending: "unavailable", highestRisk: "unknown", lastDiaryAt: null, now: NOW });
    expect(r.level).toBe("unavailable");
    expect(r.reason).toBe("Status unavailable");
  });
});

describe("growStatus.mergeRecent", () => {
  it("sorts newest-first by ts", () => {
    const a = { id: "a", kind: "diary" as const, ts: "2026-05-01T00:00:00Z", title: "a" };
    const b = { id: "b", kind: "diary" as const, ts: "2026-05-10T00:00:00Z", title: "b" };
    const c = { id: "c", kind: "action_event" as const, ts: "2026-05-05T00:00:00Z", title: "c" };
    expect(mergeRecent([a, b, c]).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
  it("does not mutate input", () => {
    const items = [
      { id: "a", kind: "diary" as const, ts: "2026-05-01T00:00:00Z", title: "a" },
      { id: "b", kind: "diary" as const, ts: "2026-05-10T00:00:00Z", title: "b" },
    ];
    mergeRecent(items);
    expect(items[0].id).toBe("a");
  });
});

describe("growStatus.formatCount + UNAVAILABLE_STATUS", () => {
  it("formats numbers and 'unavailable'", () => {
    expect(formatCount(5)).toBe("5");
    expect(formatCount(0)).toBe("0");
    expect(formatCount("unavailable")).toBe("Unavailable");
  });
  it("UNAVAILABLE_STATUS is a safe fallback", () => {
    expect(UNAVAILABLE_STATUS.level).toBe("unavailable");
    expect(UNAVAILABLE_STATUS.pending).toBe("unavailable");
    expect(UNAVAILABLE_STATUS.highestRisk).toBe("unknown");
    expect(UNAVAILABLE_STATUS.lastDiaryAt).toBeNull();
  });
});
