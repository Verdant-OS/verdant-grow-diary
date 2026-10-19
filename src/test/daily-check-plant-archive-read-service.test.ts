/**
 * A real plant-row reader that throws or rejects must block. A stub that
 * cannot read one row is not that reader and must not block.
 */
import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  from: (() => ({})) as (table: string) => unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => harness.from(table) },
}));

import { startSavedPlantArchiveDecision } from "@/lib/dailyCheckPlantArchiveReadService";
import { DAILY_CHECK_PLANT_ARCHIVE_RETRY_MESSAGE } from "@/lib/dailyCheckPlantSelectionRules";

describe("saved plant archive read", () => {
  it("blocks when a real reader throws while reading the row", async () => {
    const filter = {
      eq: () => filter,
      maybeSingle: () => Promise.reject(new Error("network")),
      limit: () => {
        throw new Error("network");
      },
    };
    harness.from = () => ({
      select: () => filter,
      update: () => ({}),
      delete: () => ({}),
      upsert: () => ({}),
    });

    const started = startSavedPlantArchiveDecision("plant-1");
    expect(started.ready).toBe(false);
    if (started.ready) return;
    await expect(started.pending).resolves.toEqual({
      block: true,
      message: DAILY_CHECK_PLANT_ARCHIVE_RETRY_MESSAGE,
    });
  });

  it("does not block a stub that cannot read one plant row", () => {
    const filter = {
      eq: () => filter,
      limit: async () => ({ data: [], error: null }),
    };
    harness.from = () => ({
      select: () => filter,
      update: () => ({}),
    });

    const started = startSavedPlantArchiveDecision("plant-1");
    expect(started.ready).toBe(true);
    if (!started.ready) return;
    expect(started.decision).toEqual({ block: false });
  });
});
