import { describe, expect, it } from "vitest";
import {
  resolveRootEntrySurface,
  ROOT_ENTRY_PRE_HYDRATION_SURFACE,
  shouldTrackRootLandingPageView,
} from "@/lib/rootEntryRules";

describe("root entry rules", () => {
  it("renders the public landing before hydration", () => {
    expect(ROOT_ENTRY_PRE_HYDRATION_SURFACE).toBe("landing");
  });

  it("keeps the public landing visible while auth is unresolved", () => {
    expect(resolveRootEntrySurface({ authLoading: true, hasAuthenticatedUser: false })).toBe(
      "landing",
    );
    expect(resolveRootEntrySurface({ authLoading: true, hasAuthenticatedUser: true })).toBe(
      "landing",
    );
  });

  it("tracks acquisition only after auth resolves signed out", () => {
    expect(shouldTrackRootLandingPageView({ authLoading: true, hasAuthenticatedUser: false })).toBe(
      false,
    );
    expect(shouldTrackRootLandingPageView({ authLoading: true, hasAuthenticatedUser: true })).toBe(
      false,
    );
    expect(shouldTrackRootLandingPageView({ authLoading: false, hasAuthenticatedUser: true })).toBe(
      false,
    );
    expect(
      shouldTrackRootLandingPageView({ authLoading: false, hasAuthenticatedUser: false }),
    ).toBe(true);
  });

  it("selects the public landing for a resolved signed-out session", () => {
    expect(resolveRootEntrySurface({ authLoading: false, hasAuthenticatedUser: false })).toBe(
      "landing",
    );
  });

  it("selects the private dashboard only for a resolved authenticated session", () => {
    expect(resolveRootEntrySurface({ authLoading: false, hasAuthenticatedUser: true })).toBe(
      "dashboard",
    );
  });

  it("is deterministic for identical inputs", () => {
    const input = { authLoading: false, hasAuthenticatedUser: false };
    expect(Array.from({ length: 10 }, () => resolveRootEntrySurface(input))).toEqual(
      Array(10).fill("landing"),
    );
  });
});
