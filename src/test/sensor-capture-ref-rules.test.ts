/**
 * sensorCaptureRefRules (#2303): capture identity for tent environment evidence.
 * Joins climate and VPD checks on record identity, not timestamp alone.
 */
import { describe, expect, it } from "vitest";
import {
  captureRefsKnown,
  diaryCaptureRef,
  rowCaptureRef,
  sensorCaptureRef,
  snapshotCaptureRef,
} from "@/lib/sensorCaptureRefRules";

const T = "2026-10-22T12:00:00.000Z";

describe("sensorCaptureRef", () => {
  it("names a sensor row by epoch ms and normalized source family", () => {
    expect(sensorCaptureRef(T, "live")).toBe(`sensor:${Date.parse(T)}:live`);
    expect(sensorCaptureRef(T, "manual")).toBe(`sensor:${Date.parse(T)}:manual`);
  });

  it("folds stale into the live family so one ingest stays one capture", () => {
    expect(sensorCaptureRef(T, "stale")).toBe(`sensor:${Date.parse(T)}:live`);
  });

  it("returns null without a timestamp, source, or parseable instant", () => {
    expect(sensorCaptureRef(null, "live")).toBeNull();
    expect(sensorCaptureRef(T, null)).toBeNull();
    expect(sensorCaptureRef(T, "")).toBeNull();
    expect(sensorCaptureRef("not-a-date", "live")).toBeNull();
  });
});

describe("rowCaptureRef", () => {
  it("prefers an explicit capture_ref on the row", () => {
    expect(rowCaptureRef({ capture_ref: "diary:entry-1", captured_at: T, source: "live" })).toBe(
      "diary:entry-1",
    );
  });

  it("derives from captured_at or ts when capture_ref is absent", () => {
    expect(rowCaptureRef({ captured_at: T, source: "csv" })).toBe(`sensor:${Date.parse(T)}:csv`);
    expect(rowCaptureRef({ ts: T, source: "demo" })).toBe(`sensor:${Date.parse(T)}:demo`);
  });
});

describe("diaryCaptureRef", () => {
  it("prefixes diary entry ids and rejects empty ids", () => {
    expect(diaryCaptureRef("abc")).toBe("diary:abc");
    expect(diaryCaptureRef(null)).toBeNull();
    expect(diaryCaptureRef("")).toBeNull();
  });
});

describe("snapshotCaptureRef", () => {
  it("uses the diary entry when present, else per-metric refs", () => {
    expect(
      snapshotCaptureRef(
        {
          diary_evidence_ref: { id: "d-1" },
          metric_refs: { temp: { captured_at: T, source: "live" } },
        },
        "temp",
      ),
    ).toBe("diary:d-1");
    expect(
      snapshotCaptureRef(
        { diary_capture_id: "d-2", metric_refs: { rh: { captured_at: T, source: "manual" } } },
        "rh",
      ),
    ).toBe("diary:d-2");
    expect(
      snapshotCaptureRef({ metric_refs: { vpd: { captured_at: T, source: "live" } } }, "vpd"),
    ).toBe(`sensor:${Date.parse(T)}:live`);
    expect(snapshotCaptureRef({}, "temp")).toBeNull();
  });
});

describe("captureRefsKnown", () => {
  it("is true only for a non-empty list with no null entries", () => {
    expect(captureRefsKnown(["diary:a"])).toBe(true);
    expect(captureRefsKnown([`sensor:${Date.parse(T)}:live`])).toBe(true);
    expect(captureRefsKnown([])).toBe(false);
    expect(captureRefsKnown(null)).toBe(false);
    expect(captureRefsKnown(["diary:a", null])).toBe(false);
  });
});
