import { describe, expect, it } from "vitest";
import { buildSensorSnapshotReadState } from "@/lib/sensorSnapshotReadStateRules";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";

describe("current snapshot read evidence", () => {
  const snapshot = Object.freeze({
    ...EMPTY_SNAPSHOT,
    source: "manual" as const,
    temp: 24,
    ts: "2026-09-16T12:00:00.000Z",
  });
  it.each([null, undefined])("keeps absent state %s unresolved", (state) => {
    expect(buildSensorSnapshotReadState(state).confirmedSnapshot).toBeNull();
    expect(buildSensorSnapshotReadState(state).pendingNotice).toMatch(/Loading/);
  });
  it.each(["idle", "loading", "unavailable"] as const)(
    "does not confirm evidence during %s",
    (status) => {
      expect(buildSensorSnapshotReadState({ status, snapshot }).confirmedSnapshot).toBeNull();
    },
  );
  it("describes a first fetch as loading rather than last loaded during isFetching", () => {
    const result = buildSensorSnapshotReadState({
      status: "ok",
      snapshot: EMPTY_SNAPSHOT,
      isFetching: true,
    });
    expect(result.confirmedSnapshot).toBeNull();
    expect(result.pendingNotice).toBe("Loading sensor data…");
    expect(result.pendingNotice).not.toContain("Last loaded readings");
  });

  it.each(["isPaused", "isFetching"] as const)(
    "keeps cached data out of current evidence during %s",
    (flag) => {
      const state = Object.freeze({ status: "ok" as const, snapshot, [flag]: true });
      const result = buildSensorSnapshotReadState(state);
      expect(result.confirmedSnapshot).toBeNull();
      expect(result.pendingNotice).toContain("Last loaded readings");
      expect(buildSensorSnapshotReadState(state)).toEqual(result);
      expect(state.snapshot).toBe(snapshot);
      expect(state.snapshot.ts).toBe("2026-09-16T12:00:00.000Z");
    },
  );
  it("does not describe cached empty data as loaded readings during a paused retry", () => {
    const result = buildSensorSnapshotReadState({
      status: "ok",
      snapshot: EMPTY_SNAPSHOT,
      isPaused: true,
    });
    expect(result.confirmedSnapshot).toBeNull();
    expect(result.pendingNotice).toContain("Waiting for connection");
    expect(result.pendingNotice).not.toContain("Last loaded readings");
  });
  it("keeps a failed read unavailable even when old values are present", () => {
    expect(
      buildSensorSnapshotReadState({ status: "unavailable", snapshot, isPaused: true }),
    ).toEqual({ confirmedSnapshot: null, pendingNotice: null });
  });
  it("returns completed evidence without changing original source, identity or time", () => {
    expect(buildSensorSnapshotReadState({ status: "ok", snapshot })).toEqual({
      confirmedSnapshot: snapshot,
      pendingNotice: null,
    });
    expect(buildSensorSnapshotReadState({ status: "ok", snapshot }).confirmedSnapshot).toBe(
      snapshot,
    );
  });
  it("retains a confirmed empty response as completed evidence", () => {
    expect(buildSensorSnapshotReadState({ status: "ok", snapshot: EMPTY_SNAPSHOT })).toEqual({
      confirmedSnapshot: EMPTY_SNAPSHOT,
      pendingNotice: null,
    });
  });
});
