import { describe, expect, it } from "vitest";
import {
  classifyIngestTimestampFreshness,
  LIVE_INGEST_FRESHNESS_WINDOW_MS,
} from "../../supabase/functions/_shared/sensorIngestFreshness";

const NOW = new Date("2026-07-18T12:00:00.000Z");

describe("trusted sensor ingest freshness boundary", () => {
  it("keeps the exact 30-minute boundary fresh", () => {
    const capturedAt = new Date(NOW.getTime() - LIVE_INGEST_FRESHNESS_WINDOW_MS).toISOString();
    expect(classifyIngestTimestampFreshness(capturedAt, { now: NOW })).toBe("fresh");
  });

  it("classifies one millisecond beyond the boundary as stale", () => {
    const capturedAt = new Date(NOW.getTime() - LIVE_INGEST_FRESHNESS_WINDOW_MS - 1).toISOString();
    expect(classifyIngestTimestampFreshness(capturedAt, { now: NOW })).toBe("stale");
  });

  it.each([null, undefined, "", "not-a-date"])(
    "fails closed for invalid captured_at %#",
    (capturedAt) => {
      expect(classifyIngestTimestampFreshness(capturedAt, { now: NOW })).toBe("invalid");
    },
  );

  it("is deterministic for the same injected clock", () => {
    const capturedAt = "2026-07-18T11:29:59.999Z";
    expect(classifyIngestTimestampFreshness(capturedAt, { now: NOW })).toBe(
      classifyIngestTimestampFreshness(capturedAt, { now: NOW }),
    );
  });
});
