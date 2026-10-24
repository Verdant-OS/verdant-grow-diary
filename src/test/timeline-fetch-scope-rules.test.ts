import { describe, expect, it } from "vitest";
import { resolveTimelineFetchScope } from "@/lib/timelinePageReadStateRules";

describe("resolveTimelineFetchScope", () => {
  it("prefers the URL grow while the grow list is still loading", () => {
    expect(
      resolveTimelineFetchScope({
        urlGrowId: "grow-url",
        storeGrowId: "grow-store",
        growsLoading: true,
        growsError: null,
        isValidScopedGrow: false,
      }),
    ).toEqual({ activeGrowId: "grow-url", hasInvalidScope: false });
  });

  it("falls back to the store grow when the URL omits a grow id", () => {
    expect(
      resolveTimelineFetchScope({
        urlGrowId: null,
        storeGrowId: "grow-store",
        growsLoading: false,
        growsError: null,
        isValidScopedGrow: true,
      }),
    ).toEqual({ activeGrowId: "grow-store", hasInvalidScope: false });
  });

  it("still starts a URL-scoped read when the grow list errors", () => {
    expect(
      resolveTimelineFetchScope({
        urlGrowId: "grow-url",
        storeGrowId: null,
        growsLoading: false,
        growsError: "unavailable",
        isValidScopedGrow: false,
      }),
    ).toEqual({ activeGrowId: "grow-url", hasInvalidScope: false });
  });

  it("marks a settled URL grow invalid when it is absent from the grow list", () => {
    expect(
      resolveTimelineFetchScope({
        urlGrowId: "missing",
        storeGrowId: "other",
        growsLoading: false,
        growsError: null,
        isValidScopedGrow: false,
      }),
    ).toEqual({ activeGrowId: null, hasInvalidScope: true });
  });
});
