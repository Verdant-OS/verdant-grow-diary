import { describe, expect, it } from "vitest";

import { normalizeRouteError } from "@/lib/rootRouteErrorRules";

describe("normalizeRouteError", () => {
  it("returns the same Error instance when the route error is already an Error", () => {
    const original = new Error("loader blew up");
    expect(normalizeRouteError(original)).toBe(original);
  });

  it("wraps string throw values in an Error for reporters", () => {
    const normalized = normalizeRouteError("route failed");
    expect(normalized).toBeInstanceOf(Error);
    expect(normalized.message).toBe("route failed");
  });

  it("stringifies non-Error objects so reporting never receives unknown", () => {
    expect(normalizeRouteError({ code: "E_ROUTE" }).message).toBe("[object Object]");
    expect(normalizeRouteError(404).message).toBe("404");
    expect(normalizeRouteError(null).message).toBe("null");
    expect(normalizeRouteError(undefined).message).toBe("undefined");
  });
});
