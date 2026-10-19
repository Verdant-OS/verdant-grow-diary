/**
 * A client that cannot run the plants read is a failed read, not an active
 * plant. The service has no test-only path that lets such a save through.
 */
import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  from: ((_table: string) => {
    throw new Error("Unexpected table plants");
  }) as ((table: string) => unknown) | undefined,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    get from() {
      return harness.from;
    },
  },
}));

import { checkDailyCheckPlantArchiveBeforeSave } from "@/lib/dailyCheckPlantArchiveReadService";
import { DAILY_CHECK_PLANT_ARCHIVE_RETRY_MESSAGE } from "@/lib/dailyCheckPlantSelectionRules";

const RETRY = { block: true, message: DAILY_CHECK_PLANT_ARCHIVE_RETRY_MESSAGE };

describe("archive read when the client cannot read plants", () => {
  it("blocks when from(plants) is refused", async () => {
    harness.from = () => {
      throw new Error("Unexpected table plants");
    };
    await expect(checkDailyCheckPlantArchiveBeforeSave("plant-1")).resolves.toEqual(RETRY);
  });

  it("blocks when the client has no from()", async () => {
    harness.from = undefined;
    await expect(checkDailyCheckPlantArchiveBeforeSave("plant-1")).resolves.toEqual(RETRY);
  });

  it("blocks when the table exposes select only", async () => {
    harness.from = () => ({ select: () => ({ eq: () => ({}) }) });
    await expect(checkDailyCheckPlantArchiveBeforeSave("plant-1")).resolves.toEqual(RETRY);
  });
});
