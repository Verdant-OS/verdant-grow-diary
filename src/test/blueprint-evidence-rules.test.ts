import { describe, expect, it } from "vitest";
import {
  resolveBlueprintReadState,
  resolveBlueprintSensorEvidence,
} from "@/lib/blueprintEvidenceRules";
import { buildBlueprintOverlayViewModel } from "@/lib/blueprintOverlayViewModel";

const now = Date.parse("2026-09-23T12:00:00Z");
describe("Blueprint evidence boundaries", () => {
  it.each([
    ["live", 15],
    ["manual", 1440],
  ])("uses the inclusive %s %i-minute boundary", (source, minutes) => {
    const snapshot = { source, ts: new Date(now - Number(minutes) * 60_000).toISOString() };
    expect(resolveBlueprintSensorEvidence(snapshot, { status: "ok" }, now).canScore).toBe(true);
    expect(resolveBlueprintSensorEvidence(snapshot, { status: "ok" }, now + 1).canScore).toBe(
      false,
    );
  });
  it.each([undefined, NaN, Infinity])("fails closed without a valid clock: %s", (clock) => {
    expect(
      resolveBlueprintSensorEvidence({ source: "live", ts: new Date(now).toISOString() }, {}, clock)
        .canScore,
    ).toBe(false);
  });
  it.each([null, undefined])("handles absent snapshots %s deterministically", (snapshot) => {
    const result = resolveBlueprintSensorEvidence(snapshot, {}, now);
    expect(result.canScore).toBe(false);
    expect(result).toEqual(resolveBlueprintSensorEvidence(snapshot, {}, now));
  });
  it("keeps successfully empty reads distinct from first-read pauses", () => {
    expect(resolveBlueprintReadState({ readStatus: "success" }, "Feeding")).toEqual({
      canScore: true,
      notice: null,
      retryable: false,
    });
    const pending = resolveBlueprintReadState({ status: "loading", isPaused: true }, "Sensor");
    expect(pending.canScore).toBe(false);
    expect(pending.notice).toContain("Waiting for connection");
  });
  it("does not mutate evidence, invent metrics, or count retained stale values as healthy", () => {
    const snapshot = Object.freeze({
      source: "live" as const,
      ts: "2026-09-21T12:00:00Z",
      temp: 25,
      rh: 75,
      vpd: 0.6,
      ppfd: null,
    });
    const input = Object.freeze({
      now,
      stage: "seedling",
      snapshot,
      latestFeeding: null,
      dli: null,
    });
    const first = buildBlueprintOverlayViewModel(input, "celsius");
    expect(first).toEqual(buildBlueprintOverlayViewModel(input, "celsius"));
    expect(first.summary).toEqual({ green: 0, amber: 0, red: 0, missing: 7 });
    expect(first.rows.find((row) => row.metricKey === "tempC")?.value).toBe(25);
    expect(first.rows.find((row) => row.metricKey === "ppfd")?.value).toBeNull();
    expect(first.rows.every((row) => !row.result.healthy)).toBe(true);
    expect(snapshot.temp).toBe(25);
  });
});
