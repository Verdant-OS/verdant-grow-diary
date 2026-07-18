import { describe, expect, it } from "vitest";
import { isNavigationItemActive } from "@/lib/navigationActiveRules";

describe("isNavigationItemActive", () => {
  it("matches an exact route and normal child routes", () => {
    expect(isNavigationItemActive("/plants", { to: "/plants" })).toBe(true);
    expect(isNavigationItemActive("/plants/plant-1", { to: "/plants" })).toBe(true);
  });

  it("honors exact matching when end is enabled", () => {
    expect(isNavigationItemActive("/", { to: "/", end: true })).toBe(true);
    expect(isNavigationItemActive("/settings", { to: "/", end: true })).toBe(false);
  });

  it("activates the root Dashboard item for the exact /dashboard alias", () => {
    const dashboard = { to: "/", end: true, aliases: ["/dashboard"] } as const;

    expect(isNavigationItemActive("/dashboard", dashboard)).toBe(true);
    expect(isNavigationItemActive("/dashboard/other", dashboard)).toBe(false);
  });

  it("lets a reserved operator child route override its grower parent", () => {
    const sensors = {
      to: "/sensors",
      excludedPaths: ["/sensors/ecowitt-audit"],
    } as const;

    expect(isNavigationItemActive("/sensors", sensors)).toBe(true);
    expect(isNavigationItemActive("/sensors/history", sensors)).toBe(true);
    expect(isNavigationItemActive("/sensors/ecowitt-audit", sensors)).toBe(false);
    expect(isNavigationItemActive("/sensors/ecowitt-audit/detail", sensors)).toBe(false);
  });

  it("is deterministic for repeated inputs", () => {
    const item = { to: "/sensors", excludedPaths: ["/sensors/ecowitt-audit"] } as const;
    const results = Array.from({ length: 10 }, () =>
      isNavigationItemActive("/sensors/ecowitt-audit", item),
    );

    expect(new Set(results)).toEqual(new Set([false]));
  });
});
