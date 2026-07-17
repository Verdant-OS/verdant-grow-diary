import { describe, expect, it } from "vitest";
import {
  PPM_500_PER_EC,
  resolveEcPpm500Pair,
  updateEcPpm500Pair,
} from "@/lib/ecPpm500PairRules";

describe("updateEcPpm500Pair", () => {
  it("applies PPM ÷ 500 = EC", () => {
    expect(PPM_500_PER_EC).toBe(500);
    expect(updateEcPpm500Pair("ppm", "1000")).toEqual({ ec: "2", ppm: "1000" });
  });

  it("applies EC × 500 = PPM", () => {
    expect(updateEcPpm500Pair("ec", "2")).toEqual({ ec: "2", ppm: "1000" });
    expect(updateEcPpm500Pair("ec", "1.4")).toEqual({ ec: "1.4", ppm: "700" });
  });

  it("clears both values when the edited field is cleared", () => {
    expect(updateEcPpm500Pair("ec", "  ")).toEqual({ ec: "", ppm: "" });
    expect(updateEcPpm500Pair("ppm", "")).toEqual({ ec: "", ppm: "" });
    expect(updateEcPpm500Pair("ec", null)).toEqual({ ec: "", ppm: "" });
  });

  it("preserves invalid source text but clears the derived value", () => {
    expect(updateEcPpm500Pair("ec", "abc")).toEqual({ ec: "abc", ppm: "" });
    expect(updateEcPpm500Pair("ppm", "-500")).toEqual({ ec: "", ppm: "-500" });
  });

  it("is deterministic for repeated decimal conversions", () => {
    const first = updateEcPpm500Pair("ppm", "617.25");
    expect(first).toEqual({ ec: "1.2345", ppm: "617.25" });
    expect(updateEcPpm500Pair("ppm", "617.25")).toEqual(first);
  });
});

describe("resolveEcPpm500Pair", () => {
  it("accepts empty, EC-only, PPM-only, and matching paired values", () => {
    expect(resolveEcPpm500Pair("", "")).toEqual({ status: "empty", ec: null });
    expect(resolveEcPpm500Pair(null, undefined)).toEqual({ status: "empty", ec: null });
    expect(resolveEcPpm500Pair("2", "")).toEqual({ status: "valid", ec: 2 });
    expect(resolveEcPpm500Pair("", "1000")).toEqual({ status: "valid", ec: 2 });
    expect(resolveEcPpm500Pair("2", "1000")).toEqual({ status: "valid", ec: 2 });
  });

  it("fails closed for invalid or mismatched values", () => {
    expect(resolveEcPpm500Pair("abc", "").status).toBe("invalid");
    expect(resolveEcPpm500Pair("2", "700").status).toBe("mismatch");
  });
});
