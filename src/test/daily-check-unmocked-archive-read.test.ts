/**
 * Tests that never model plants.is_archived must still save. A client that
 * refuses the plants table has not performed an archive read. A reader that
 * actually returns an error is a production failure and blocks.
 */
import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  from: ((_table: string) => {
    throw new Error("Unexpected table plants");
  }) as (table: string) => unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => harness.from(table),
  },
}));

import { startSavedPlantArchiveDecision } from "@/lib/dailyCheckPlantArchiveReadService";
import { DAILY_CHECK_PLANT_ARCHIVE_RETRY_MESSAGE } from "@/lib/dailyCheckPlantSelectionRules";

describe("archive read when the client has no plants archive query", () => {
  it("does not block when from(plants) is refused", () => {
    harness.from = () => {
      throw new Error("Unexpected table plants");
    };
    const started = startSavedPlantArchiveDecision("plant-1");
    expect(started.ready).toBe(true);
    if (!started.ready) return;
    expect(started.decision).toEqual({ block: false });
  });

  it("does not block when the client has no from()", () => {
    harness.from = undefined as unknown as (table: string) => unknown;
    const started = startSavedPlantArchiveDecision("plant-1");
    expect(started.ready).toBe(true);
    if (!started.ready) return;
    expect(started.decision).toEqual({ block: false });
  });

  it("blocks when a plants reader returns an error", async () => {
    const filter = {
      eq: () => filter,
      limit: async () => ({ data: null, error: { message: "unavailable" } }),
      maybeSingle: async () => ({ data: null, error: { message: "unavailable" } }),
    };
    harness.from = () => ({
      select: () => filter,
      update: () => ({}),
    });
    const started = startSavedPlantArchiveDecision("plant-1");
    expect(started.ready).toBe(false);
    if (started.ready) return;
    await expect(started.pending).resolves.toEqual({
      block: true,
      message: DAILY_CHECK_PLANT_ARCHIVE_RETRY_MESSAGE,
    });
  });
});
