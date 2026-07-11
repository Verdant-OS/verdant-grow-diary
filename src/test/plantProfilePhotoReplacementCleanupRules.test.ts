import { describe, it, expect } from "vitest";
import { evaluatePreviousPhotoCleanup } from "@/lib/plantProfilePhotoReplacementCleanupRules";

const USER = "user-1";
const PLANT = "plant-9";
const NEW_OK = `storage://diary-photos/${USER}/grow-2/plant-profiles/${PLANT}/new.jpg`;
const OLD_OK = `storage://diary-photos/${USER}/grow-2/plant-profiles/${PLANT}/old.jpg`;

function ev(prev: string | null, next = NEW_OK) {
  return evaluatePreviousPhotoCleanup({
    previousPhotoUrl: prev,
    newPhotoUrl: next,
    authenticatedUserId: USER,
    plantId: PLANT,
  });
}

describe("evaluatePreviousPhotoCleanup — ineligible cases", () => {
  it("null previous → no_previous_photo", () => {
    expect(ev(null)).toEqual({ eligible: false, reason: "no_previous_photo" });
  });
  it("blank previous → no_previous_photo", () => {
    expect(ev("   ")).toEqual({ eligible: false, reason: "no_previous_photo" });
  });
  it("http previous → legacy_reference", () => {
    expect(ev("http://example.com/x.jpg")).toEqual({
      eligible: false,
      reason: "legacy_reference",
    });
  });
  it("https previous → legacy_reference", () => {
    expect(ev("https://example.com/x.jpg")).toEqual({
      eligible: false,
      reason: "legacy_reference",
    });
  });
  it("data:image previous → legacy_reference", () => {
    expect(ev("data:image/png;base64,AAAA")).toEqual({
      eligible: false,
      reason: "legacy_reference",
    });
  });
  it("blob: previous → legacy_reference", () => {
    expect(ev("blob:https://app/abc")).toEqual({
      eligible: false,
      reason: "legacy_reference",
    });
  });
  it("identical previous and new → same_reference", () => {
    expect(ev(NEW_OK)).toEqual({ eligible: false, reason: "same_reference" });
  });
  it("malformed storage → malformed_reference", () => {
    expect(ev("storage://diary-photos/")).toEqual({
      eligible: false,
      reason: "malformed_reference",
    });
  });
  it("wrong bucket → wrong_bucket", () => {
    expect(
      ev(`storage://other-bucket/${USER}/g/plant-profiles/${PLANT}/x.jpg`),
    ).toEqual({ eligible: false, reason: "wrong_bucket" });
  });
  it("wrong owner → wrong_owner", () => {
    expect(
      ev(`storage://diary-photos/someone-else/g/plant-profiles/${PLANT}/x.jpg`),
    ).toEqual({ eligible: false, reason: "wrong_owner" });
  });
  it("wrong plant subfolder → wrong_plant_path", () => {
    expect(
      ev(`storage://diary-photos/${USER}/g/not-plant-profiles/${PLANT}/x.jpg`),
    ).toEqual({ eligible: false, reason: "wrong_plant_path" });
  });
  it("wrong plant id → wrong_plant_path", () => {
    expect(
      ev(`storage://diary-photos/${USER}/g/plant-profiles/other-plant/x.jpg`),
    ).toEqual({ eligible: false, reason: "wrong_plant_path" });
  });
  it("invalid new reference (not storage://) → malformed_reference", () => {
    expect(ev(OLD_OK, "https://cdn/x.jpg")).toEqual({
      eligible: false,
      reason: "malformed_reference",
    });
  });
});

describe("evaluatePreviousPhotoCleanup — eligible", () => {
  it("valid storage previous → eligible with parsed path (no bucket, no scheme)", () => {
    const r = ev(OLD_OK);
    expect(r).toEqual({
      eligible: true,
      objectPath: `${USER}/grow-2/plant-profiles/${PLANT}/old.jpg`,
    });
    if (r.eligible) {
      expect(r.objectPath.startsWith("storage://")).toBe(false);
      expect(r.objectPath.startsWith("diary-photos/")).toBe(false);
    }
  });
  it("is deterministic across calls", () => {
    expect(ev(OLD_OK)).toEqual(ev(OLD_OK));
  });
});
