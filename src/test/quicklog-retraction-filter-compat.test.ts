/**
 * retractionFilterCompat — pre-migration deploy-order safety (issue #786).
 *
 * The page-critical diary readers filter on retracted_at, which does not
 * exist until migration 20260811090000 is applied. These tests pin the
 * fallback contract: retry once without the filter on exactly the
 * missing-column error, and never mask any other failure.
 */
import { describe, expect, it } from "vitest";

import {
  isMissingRetractedColumnError,
  selectWithRetractionCompat,
} from "@/lib/quick-log/retractionFilterCompat";

const MISSING_COLUMN = {
  code: "42703",
  message: "column diary_entries.retracted_at does not exist",
};

describe("isMissingRetractedColumnError", () => {
  it("matches only the missing retracted_at column error", () => {
    expect(isMissingRetractedColumnError(MISSING_COLUMN)).toBe(true);
    expect(isMissingRetractedColumnError({ code: "42703", message: "column x missing" })).toBe(
      false,
    );
    expect(isMissingRetractedColumnError({ code: "500", message: "retracted_at broke" })).toBe(
      false,
    );
    expect(isMissingRetractedColumnError(null)).toBe(false);
    expect(isMissingRetractedColumnError(undefined)).toBe(false);
  });
});

describe("selectWithRetractionCompat", () => {
  it("returns the filtered result when it succeeds", async () => {
    const calls: boolean[] = [];
    const result = await selectWithRetractionCompat(async (withFilter) => {
      calls.push(withFilter);
      return { data: ["filtered"], error: null };
    });
    expect(calls).toEqual([true]);
    expect(result.data).toEqual(["filtered"]);
  });

  it("retries once without the filter on the missing-column error", async () => {
    const calls: boolean[] = [];
    const result = await selectWithRetractionCompat(async (withFilter) => {
      calls.push(withFilter);
      if (withFilter) return { data: null, error: MISSING_COLUMN };
      return { data: ["unfiltered"], error: null };
    });
    expect(calls).toEqual([true, false]);
    expect(result.data).toEqual(["unfiltered"]);
    expect(result.error).toBeNull();
  });

  it("does not mask other errors with a retry", async () => {
    const calls: boolean[] = [];
    const failure = { code: "PGRST301", message: "JWT expired" };
    const result = await selectWithRetractionCompat(async (withFilter) => {
      calls.push(withFilter);
      return { data: null, error: failure };
    });
    expect(calls).toEqual([true]);
    expect(result.error).toBe(failure);
  });

  it("surfaces the fallback's own error unchanged", async () => {
    const result = await selectWithRetractionCompat(async (withFilter) => {
      if (withFilter) return { data: null, error: MISSING_COLUMN };
      return { data: null, error: { code: "PGRST100", message: "boom" } };
    });
    expect(result.error).toEqual({ code: "PGRST100", message: "boom" });
  });
});
