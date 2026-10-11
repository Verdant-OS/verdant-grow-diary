/**
 * Daily Check activity/Water target carry.
 *
 * Pins the Golden Toad P1: Water must inherit plant or tent context already
 * on Daily Check, and must never invent a plant.
 */
import { describe, expect, it } from "vitest";

import { resolveDailyCheckActivityTarget } from "@/lib/dailyCheckWaterContextRules";

describe("resolveDailyCheckActivityTarget", () => {
  it("carries a selected plant and its assigned tent", () => {
    expect(
      resolveDailyCheckActivityTarget({
        plantId: "p1",
        plantAssignedTentId: "t2",
        standaloneTentId: "t1",
        firstSelectableTentId: "t1",
        routeTentId: "t2",
        plantResolutionStatus: "missing",
      }),
    ).toEqual({ plantId: "p1", tentId: "t2" });
  });

  it("keeps an untented selected plant without inventing a tent", () => {
    expect(
      resolveDailyCheckActivityTarget({
        plantId: "p-untented",
        plantAssignedTentId: "",
        standaloneTentId: "t1",
        firstSelectableTentId: "t1",
        routeTentId: "",
        plantResolutionStatus: "valid",
      }),
    ).toEqual({ plantId: "p-untented", tentId: null });
  });

  it("prefers an explicit standalone tent over the first selectable tent", () => {
    expect(
      resolveDailyCheckActivityTarget({
        plantId: null,
        plantAssignedTentId: null,
        standaloneTentId: "t2",
        firstSelectableTentId: "t1",
        routeTentId: "",
        plantResolutionStatus: "missing",
      }),
    ).toEqual({ plantId: null, tentId: "t2" });
  });

  it("carries the first selectable tent when no plant was requested", () => {
    expect(
      resolveDailyCheckActivityTarget({
        plantId: null,
        plantAssignedTentId: null,
        standaloneTentId: "",
        firstSelectableTentId: "t1",
        routeTentId: "",
        plantResolutionStatus: "missing",
      }),
    ).toEqual({ plantId: null, tentId: "t1" });
  });

  it("does not invent a tent when a requested plant was not honored", () => {
    expect(
      resolveDailyCheckActivityTarget({
        plantId: null,
        plantAssignedTentId: null,
        standaloneTentId: "t2",
        firstSelectableTentId: "t1",
        routeTentId: "",
        plantResolutionStatus: "unknown",
      }),
    ).toEqual({ plantId: null, tentId: null });
    expect(
      resolveDailyCheckActivityTarget({
        plantId: null,
        plantAssignedTentId: null,
        standaloneTentId: "t2",
        firstSelectableTentId: "t1",
        routeTentId: "",
        plantResolutionStatus: "out-of-scope",
      }),
    ).toEqual({ plantId: null, tentId: null });
  });

  it("fails closed when no plant or tent can be determined", () => {
    expect(
      resolveDailyCheckActivityTarget({
        plantId: "  ",
        plantAssignedTentId: null,
        standaloneTentId: null,
        firstSelectableTentId: null,
        routeTentId: null,
        plantResolutionStatus: "missing",
      }),
    ).toEqual({ plantId: null, tentId: null });
  });
});
