/**
 * The Daily Check archive re-read fails closed. Only a row with a boolean
 * `is_archived` decides the save; every other outcome blocks with the retry
 * message.
 */
import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  maybeSingle: (() => Promise.resolve({ data: null, error: null })) as () => unknown,
  eqArgs: [] as unknown[][],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "plants") throw new Error(`unexpected table ${table}`);
      return {
        select: (columns: string) => {
          expect(columns).toBe("is_archived");
          return {
            eq: (...args: unknown[]) => {
              harness.eqArgs.push(args);
              return { maybeSingle: () => harness.maybeSingle() };
            },
          };
        },
      };
    },
  },
}));

import { checkDailyCheckPlantArchiveBeforeSave } from "@/lib/dailyCheckPlantArchiveReadService";
import {
  DAILY_CHECK_ARCHIVED_PLANT_SUBMIT_MESSAGE,
  DAILY_CHECK_PLANT_ARCHIVE_RETRY_MESSAGE,
} from "@/lib/dailyCheckPlantSelectionRules";

const RETRY = { block: true, message: DAILY_CHECK_PLANT_ARCHIVE_RETRY_MESSAGE };

describe("checkDailyCheckPlantArchiveBeforeSave", () => {
  it("allows an active plant and reads that exact plant", async () => {
    harness.eqArgs = [];
    harness.maybeSingle = () => Promise.resolve({ data: { is_archived: false }, error: null });
    await expect(checkDailyCheckPlantArchiveBeforeSave("plant-1")).resolves.toEqual({
      block: false,
    });
    expect(harness.eqArgs).toEqual([["id", "plant-1"]]);
  });

  it("blocks an archived plant", async () => {
    harness.maybeSingle = () => Promise.resolve({ data: { is_archived: true }, error: null });
    await expect(checkDailyCheckPlantArchiveBeforeSave("plant-1")).resolves.toEqual({
      block: true,
      message: DAILY_CHECK_ARCHIVED_PLANT_SUBMIT_MESSAGE,
    });
  });

  it.each([
    ["a rejected read", () => Promise.reject(new Error("network"))],
    [
      "a thrown read",
      () => {
        throw new Error("network");
      },
    ],
    ["an error result", () => Promise.resolve({ data: null, error: { message: "unavailable" } })],
    ["a missing row", () => Promise.resolve({ data: null, error: null })],
    ["a non-boolean flag", () => Promise.resolve({ data: { is_archived: "false" }, error: null })],
  ])("blocks on %s", async (_label, read) => {
    harness.maybeSingle = read;
    await expect(checkDailyCheckPlantArchiveBeforeSave("plant-1")).resolves.toEqual(RETRY);
  });
});
