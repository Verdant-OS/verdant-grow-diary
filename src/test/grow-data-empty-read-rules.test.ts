/**
 * Empty-read classification is a pure rule. The presenter re-exports it;
 * this file imports the rule module directly.
 *
 * No Supabase writes, no AI calls, no Action Queue writes.
 */
import { describe, expect, it } from "vitest";
import { isSuccessfulEmptyGrowRead } from "@/lib/growDataEmptyReadRules";
import type { GrowDataSourceMeta } from "@/hooks/useGrowData";

function meta(sourceReason: string): GrowDataSourceMeta {
  return { isDemoData: false, dataSource: "unavailable", sourceReason };
}

describe("growDataEmptyReadRules", () => {
  it("is true only when every meta is a successful empty read", () => {
    expect(isSuccessfulEmptyGrowRead([meta("no-rows"), meta("no-rows")])).toBe(true);
    expect(isSuccessfulEmptyGrowRead([])).toBe(false);
    expect(isSuccessfulEmptyGrowRead([meta("no-rows"), meta("fetch-error")])).toBe(false);
    expect(isSuccessfulEmptyGrowRead([meta("test")])).toBe(false);
    expect(isSuccessfulEmptyGrowRead([meta("fetch-error")])).toBe(false);
  });
});
