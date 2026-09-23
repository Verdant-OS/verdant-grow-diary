import { describe, expect, it } from "vitest";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";
import { buildDashboardEmptyEnvironmentViewModel as build } from "@/lib/dashboardEmptyEnvironmentViewModel";

const snapshot = {
  ...EMPTY_SNAPSHOT,
  source: "manual" as const,
  tent_id: "tent-a",
  ts: "2026-09-01T12:00:00Z",
  temp: 25,
};
const input = {
  scoped: true,
  state: { status: "ok" as const, snapshot },
  selectedTents: [
    { id: "tent-a", name: "Veg Tent" },
    { id: "tent-b", name: "Flower Tent" },
  ],
};

describe("Dashboard sensor-history empty view model", () => {
  it("names only the tent that supplied the saved evidence", () => {
    const model = build(input);
    expect(model.kind).toBe("evidence");
    expect(model.description).toContain("Veg Tent");
    expect(model.description).not.toContain("Flower Tent");
    expect(model.description).not.toMatch(/healthy|current|live/i);
  });
  it("is deterministic without a current-clock dependency", () => {
    expect(build(input)).toEqual(build(input));
  });
  it.each([null, undefined])("keeps missing state %s unresolved", (state) => {
    expect(build({ ...input, state }).kind).toBe("pending");
  });
  it.each([null, undefined, []])(
    "does not invent a tent for a missing tent list",
    (selectedTents) => {
      expect(build({ ...input, selectedTents }).kind).toBe("empty");
    },
  );
  it.each([null, "another-tent"])(
    "does not attribute %s evidence to the selected tents",
    (tent_id) => {
      expect(
        build({ ...input, state: { status: "ok", snapshot: { ...snapshot, tent_id } } }).kind,
      ).toBe("empty");
    },
  );
  it("does not treat an all-null diary blob as a saved reading", () => {
    expect(
      build({ ...input, state: { status: "ok", snapshot: { ...snapshot, temp: null } } }).kind,
    ).toBe("empty");
  });
  it("does not treat NaN as evidence", () => {
    expect(
      build({ ...input, state: { status: "ok", snapshot: { ...snapshot, temp: Number.NaN } } })
        .kind,
    ).toBe("empty");
  });
  it("preserves a finite zero value", () => {
    expect(
      build({ ...input, state: { status: "ok", snapshot: { ...snapshot, temp: 0 } } }).kind,
    ).toBe("evidence");
  });
  it("uses the existing paused-read language without confirming cached evidence", () => {
    const model = build({ ...input, state: { ...input.state, isPaused: true } });
    expect(model.kind).toBe("pending");
    expect(model.description).toContain("Waiting for connection");
    expect(model.description).toContain("unconfirmed");
  });
  it("keeps a failed read unavailable even if it carries a prior snapshot", () => {
    expect(build({ ...input, state: { ...input.state, status: "unavailable" } }).kind).toBe(
      "error",
    );
  });
  it("does not await a grow query that is intentionally disabled on the account Dashboard", () => {
    expect(build({ ...input, scoped: false, state: undefined }).kind).toBe("empty");
  });
});
