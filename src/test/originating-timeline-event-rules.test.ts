/**
 * originatingTimelineEventRules — pure normalization tests.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeOriginatingTimelineEvents,
  originatingTimelineEventLabel,
  isTrustedTimelineEventSource,
} from "@/lib/originatingTimelineEventRules";

describe("normalizeOriginatingTimelineEvents", () => {
  it("returns [] for null/undefined/non-array", () => {
    expect(normalizeOriginatingTimelineEvents(null)).toEqual([]);
    expect(normalizeOriginatingTimelineEvents(undefined)).toEqual([]);
    // @ts-expect-error invalid input on purpose
    expect(normalizeOriginatingTimelineEvents("nope")).toEqual([]);
  });

  it("drops entries without a usable id and trims ids", () => {
    const out = normalizeOriginatingTimelineEvents([
      { id: "  a  ", source: "manual" },
      { id: "", source: "manual" },
      { id: null, source: "manual" },
      // @ts-expect-error missing id on purpose
      { source: "manual" },
    ]);
    expect(out.map((e) => e.id)).toEqual(["a"]);
  });

  it("dedupes repeated ids (first occurrence wins)", () => {
    const out = normalizeOriginatingTimelineEvents([
      { id: "a", source: "manual", type: "first" },
      { id: "a", source: "demo", type: "second" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("first");
    expect(out[0].source).toBe("manual");
  });

  it("sorts by occurred_at asc, null last, then id", () => {
    const out = normalizeOriginatingTimelineEvents([
      { id: "c", occurred_at: null, source: "invalid" },
      { id: "b", occurred_at: "2026-01-02T00:00:00Z", source: "manual" },
      { id: "a", occurred_at: "2026-01-01T00:00:00Z", source: "manual" },
      { id: "d", occurred_at: "2026-01-01T00:00:00Z", source: "manual" },
    ]);
    expect(out.map((e) => e.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("normalizes unknown source labels to 'unknown'", () => {
    const out = normalizeOriginatingTimelineEvents([
      { id: "a", source: "ecowitt" },
      { id: "b", source: "" },
      { id: "c", source: null },
      { id: "d", source: "imported" },
    ]);
    expect(out.find((e) => e.id === "a")?.source).toBe("unknown");
    expect(out.find((e) => e.id === "b")?.source).toBe("unknown");
    expect(out.find((e) => e.id === "c")?.source).toBe("unknown");
    expect(out.find((e) => e.id === "d")?.source).toBe("imported");
  });
});

describe("isTrustedTimelineEventSource", () => {
  it("only live/manual/csv are trusted", () => {
    expect(isTrustedTimelineEventSource("live")).toBe(true);
    expect(isTrustedTimelineEventSource("manual")).toBe(true);
    expect(isTrustedTimelineEventSource("csv")).toBe(true);
    for (const s of ["demo", "stale", "invalid", "imported", "unknown"] as const) {
      expect(isTrustedTimelineEventSource(s)).toBe(false);
    }
  });
});

describe("originatingTimelineEventLabel", () => {
  it("renders labels and 'Unknown source' fallback", () => {
    expect(originatingTimelineEventLabel("live")).toBe("Live");
    expect(originatingTimelineEventLabel("imported")).toBe("Imported");
    expect(originatingTimelineEventLabel("unknown")).toBe("Unknown source");
  });
});
