import { describe, expect, it } from "vitest";
import { resolveRootEntrySurface } from "@/lib/rootEntryRules";

describe("root entry rules", () => {
  it("waits while auth state is unresolved, regardless of cached user state", () => {
    expect(resolveRootEntrySurface({ authLoading: true, hasAuthenticatedUser: false })).toBe(
      "loading",
    );
    expect(resolveRootEntrySurface({ authLoading: true, hasAuthenticatedUser: true })).toBe(
      "loading",
    );
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
