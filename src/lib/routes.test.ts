/**
 * Unit tests for the shared route builders.
 */
import { describe, it, expect } from "vitest";
import {
  actionDetailPath,
  actionsPath,
  growDetailPath,
  logsPath,
  plantsPath,
  tentsPath,
  timelinePath,
} from "@/lib/routes";

describe("route builders — base paths", () => {
  it("growDetailPath builds /grows/:id", () => {
    expect(growDetailPath("abc")).toBe("/grows/abc");
  });
  it("actionDetailPath builds /actions/:id", () => {
    expect(actionDetailPath("xyz")).toBe("/actions/xyz");
  });
  it("scoped list paths return the bare route when no growId is provided", () => {
    expect(logsPath()).toBe("/logs");
    expect(timelinePath()).toBe("/timeline");
    expect(plantsPath()).toBe("/plants");
    expect(tentsPath()).toBe("/tents");
    expect(actionsPath()).toBe("/actions");
  });
  it("scoped list paths add ?growId=:id when provided", () => {
    expect(logsPath("g1")).toBe("/logs?growId=g1");
    expect(timelinePath("g1")).toBe("/timeline?growId=g1");
    expect(plantsPath("g1")).toBe("/plants?growId=g1");
    expect(tentsPath("g1")).toBe("/tents?growId=g1");
    expect(actionsPath("g1")).toBe("/actions?growId=g1");
  });
  it("scoped list paths treat null/empty growId as 'no scope'", () => {
    expect(logsPath(null)).toBe("/logs");
    expect(logsPath("")).toBe("/logs");
  });
});

describe("route builders — URL-encode IDs safely", () => {
  it("encodes unsafe characters in growId query param", () => {
    expect(plantsPath("a b&c=1")).toBe("/plants?growId=a%20b%26c%3D1");
    expect(actionsPath("foo/bar")).toBe("/actions?growId=foo%2Fbar");
  });
  it("encodes unsafe characters in dynamic path segments", () => {
    expect(growDetailPath("a/b c")).toBe("/grows/a%2Fb%20c");
    expect(actionDetailPath("a?b")).toBe("/actions/a%3Fb");
  });
});

describe("route builders — preserve canonical URL shapes", () => {
  it("uuid-like growId yields the exact expected URL", () => {
    const g = "11111111-2222-3333-4444-555555555555";
    expect(logsPath(g)).toBe(`/logs?growId=${g}`);
    expect(plantsPath(g)).toBe(`/plants?growId=${g}`);
    expect(tentsPath(g)).toBe(`/tents?growId=${g}`);
    expect(actionsPath(g)).toBe(`/actions?growId=${g}`);
    expect(growDetailPath(g)).toBe(`/grows/${g}`);
  });
});
