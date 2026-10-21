import { describe, expect, expectTypeOf, it } from "vitest";
import { canReadCommunityPublication } from "@/lib/communityAccessRules";
import type { AccessFacts, AccessState } from "@/lib/communityTypes";

const approvedReader: AccessFacts = {
  isOwner: false,
  state: "approved",
  blocked: false,
  activeAccount: true,
  activeProfile: true,
  ownerActive: true,
  collectionActive: true,
  publicationActive: true,
  sourceValid: true,
};

const owner: AccessFacts = { ...approvedReader, isOwner: true, state: "absent" };

describe("canReadCommunityPublication", () => {
  it("allows a currently approved reader and the owner", () => {
    expect(canReadCommunityPublication(approvedReader)).toBe(true);
    expect(canReadCommunityPublication(owner)).toBe(true);
  });

  it("denies every non-approved state for a non-owner", () => {
    const denied: AccessState[] = ["absent", "pending", "declined", "revoked", "left"];
    for (const state of denied) {
      expect(canReadCommunityPublication({ ...approvedReader, state })).toBe(false);
    }
  });

  it("denies when any authority fact fails, for the reader and the owner alike", () => {
    const failing: Partial<AccessFacts>[] = [
      { blocked: true },
      { activeAccount: false },
      { activeProfile: false },
      { ownerActive: false },
      { collectionActive: false },
      { publicationActive: false },
      { sourceValid: false },
    ];
    for (const facts of failing) {
      expect(canReadCommunityPublication({ ...approvedReader, ...facts })).toBe(false);
      expect(canReadCommunityPublication({ ...owner, ...facts })).toBe(false);
    }
  });

  it("denies an approved reader when the owner is inactive or being deleted", () => {
    expect(canReadCommunityPublication({ ...approvedReader, ownerActive: false })).toBe(false);
  });

  it("never treats following as authority", () => {
    expectTypeOf<AccessFacts>().not.toHaveProperty("following");
    expect(Object.keys(approvedReader)).not.toContain("following");

    const followerWithoutApproval = {
      ...approvedReader,
      state: "absent",
      following: true,
    } as AccessFacts;
    expect(canReadCommunityPublication(followerWithoutApproval)).toBe(false);
  });

  it("treats only a strict true as an allowing fact", () => {
    const loose = { ...approvedReader, activeAccount: "yes" } as unknown as AccessFacts;
    expect(canReadCommunityPublication(loose)).toBe(false);
  });
});
