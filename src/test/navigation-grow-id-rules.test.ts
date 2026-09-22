/**
 * resolveNavigationGrowId — pure fail-closed pins.
 *
 * Grow-scoped Labs and breeding flows depend on reading an explicit growId
 * from the current location only. These tests centralize edge cases that were
 * previously duplicated across Labs pheno/breeding pins.
 */
import { describe, expect, it } from "vitest";
import { resolveNavigationGrowId } from "@/lib/navigationGrowIdRules";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";

describe("resolveNavigationGrowId", () => {
  it("prefers /grows/:growId path over a conflicting query growId", () => {
    expect(
      resolveNavigationGrowId({
        pathname: `/grows/${GROW}/timeline`,
        search: "?growId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
    ).toBe(GROW);
  });

  it("decodes percent-encoded grow ids in the path", () => {
    const encoded = encodeURIComponent(GROW);
    expect(resolveNavigationGrowId({ pathname: `/grows/${encoded}`, search: "" })).toBe(GROW);
  });

  it("falls back to the raw path segment when decodeURIComponent throws", () => {
    const malformed = "%E0%A4%A";
    expect(resolveNavigationGrowId({ pathname: `/grows/${malformed}`, search: "" })).toBe(
      malformed,
    );
  });

  it("reads growId from query when the path is not grow-scoped", () => {
    expect(resolveNavigationGrowId({ pathname: "/breeding", search: `?growId=${GROW}` })).toBe(
      GROW,
    );
    expect(resolveNavigationGrowId({ pathname: "/pheno-hunts", search: `growId=${GROW}` })).toBe(
      GROW,
    );
  });

  it("fail-closed: blank path segments and blank query values return null", () => {
    expect(resolveNavigationGrowId({ pathname: "/grows/", search: "" })).toBeNull();
    expect(resolveNavigationGrowId({ pathname: "/grows/   ", search: "" })).toBeNull();
    expect(resolveNavigationGrowId({ pathname: "/pheno-hunts", search: "?growId=" })).toBeNull();
    expect(resolveNavigationGrowId({ pathname: "/pheno-hunts", search: "?growId=%20" })).toBeNull();
  });

  it("never invents a grow from unrelated routes", () => {
    expect(resolveNavigationGrowId({ pathname: "/dashboard", search: "" })).toBeNull();
    expect(resolveNavigationGrowId({ pathname: "/plants", search: "" })).toBeNull();
    expect(resolveNavigationGrowId({ pathname: "/grows", search: "" })).toBeNull();
  });
});
