import { describe, expect, test } from "claude-code/testing";

import { cacheLabel, shouldWarn } from "./clock";

const min = (m: number) => m * 60_000;

describe("cacheLabel", () => {
  test("fresh turn is warm with 60m left", () => expect(cacheLabel(0)).toBe("cache warm ~60m"));
  test("17m idle leaves 43m", () => expect(cacheLabel(min(17))).toBe("cache warm ~43m"));
  test("52m idle warns", () => expect(cacheLabel(min(52))).toContain("cold in ~8m"));
  test("61m idle is cold", () => expect(cacheLabel(min(61))).toBe("cache likely cold (idle 61m)"));
  test("negative clock skew clamps to warm", () =>
    expect(cacheLabel(-5000)).toBe("cache warm ~60m"));
});

describe("shouldWarn", () => {
  test("warns once in the 50–60m window", () => {
    expect(shouldWarn(min(49), false)).toBe(false);
    expect(shouldWarn(min(50), false)).toBe(true);
    expect(shouldWarn(min(55), true)).toBe(false);
    expect(shouldWarn(min(61), false)).toBe(false);
  });
});
