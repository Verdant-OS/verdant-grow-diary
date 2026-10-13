import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDailyCheckSavedItems,
  resolveDailyCheckEntrySavedSource,
} from "@/lib/dailyCheckPostSubmitRules";

const ROOT = resolve(__dirname, "../..");
const DAILY_CHECK = readFileSync(resolve(ROOT, "src/pages/DailyCheck.tsx"), "utf8");
const PHOTO_SAVE = readFileSync(
  resolve(ROOT, "src/components/QuickLogAllActivitiesSection.tsx"),
  "utf8",
);

describe("resolveDailyCheckEntrySavedSource", () => {
  it("labels a confirmed photo save as photo", () => {
    expect(resolveDailyCheckEntrySavedSource({ activityId: "photo" })).toBe("photo");
    expect(
      buildDailyCheckSavedItems({
        source: resolveDailyCheckEntrySavedSource({ activityId: "photo" }),
        submittedAt: Date.parse("2026-10-10T09:15:03.000Z"),
      }),
    ).toEqual([{ key: "photo", label: "Photo" }]);
  });

  it("keeps a bare entry-created event labeled as a plant note", () => {
    expect(resolveDailyCheckEntrySavedSource(null)).toBe("note");
    expect(resolveDailyCheckEntrySavedSource({})).toBe("note");
    expect(resolveDailyCheckEntrySavedSource({ activityId: null })).toBe("note");
    expect(resolveDailyCheckEntrySavedSource({ activityId: "   " })).toBe("note");
    expect(resolveDailyCheckEntrySavedSource({ activityId: "not-a-real-activity" })).toBe("note");
    expect(
      buildDailyCheckSavedItems({
        source: resolveDailyCheckEntrySavedSource({}),
        submittedAt: Date.parse("2026-10-10T09:15:03.000Z"),
      })[0]?.label,
    ).toBe("Plant note");
  });

  it("is deterministic for the same detail", () => {
    const detail = { activityId: "photo" as const };
    expect(resolveDailyCheckEntrySavedSource(detail)).toBe(
      resolveDailyCheckEntrySavedSource(detail),
    );
  });
});

describe("Daily Check Log tab copy", () => {
  it("asks the page listener to use the activity id instead of always saying note", () => {
    expect(DAILY_CHECK).toMatch(/resolveDailyCheckEntrySavedSource\(detail\)/);
    expect(DAILY_CHECK).not.toMatch(/setLastSubmittedSource\("note"\)/);
  });

  it("keeps the step-slug list out of the painted page", () => {
    const stepListBlock = DAILY_CHECK.match(
      /<span[^>]*data-testid="daily-grow-check-step-list"[^>]*>/,
    )?.[0];
    expect(stepListBlock, "daily-grow-check-step-list span not found").toBeDefined();
    expect(stepListBlock).toMatch(/aria-hidden="true"/);
    expect(stepListBlock).toMatch(/className="hidden"/);
    expect(stepListBlock).toMatch(/\bhidden\b/);
    expect(stepListBlock).not.toMatch(/sr-only/);
  });

  it("stamps the photo diary success event with activityId photo", () => {
    const photoDispatch = PHOTO_SAVE.slice(PHOTO_SAVE.indexOf('eventType: "photo"'));
    expect(photoDispatch).toMatch(/activityId:\s*"photo"/);
  });
});
