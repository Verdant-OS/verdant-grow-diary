import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isTimelineSymptomEvidenceWindowComplete } from "@/lib/timelineSymptomEvidenceWindowCoverageRules";

const OBSERVED_AT = "2026-08-01T12:00:00.000Z";
const WINDOW_START = "2026-07-18T12:00:00.000Z";
const BEFORE_WINDOW_START = "2026-07-18T11:59:59.999Z";
const WITHIN_WINDOW = "2026-07-25T12:00:00.000Z";

function lane(
  timestamps: ReadonlyArray<unknown>,
  hasMore: boolean | null,
  coverageMode: "exhaustion_only" | "contiguous_newest_page" = "contiguous_newest_page",
): {
  timestamps: ReadonlyArray<unknown>;
  hasMore: boolean | null;
  coverageMode: "exhaustion_only" | "contiguous_newest_page";
} {
  return { timestamps, hasMore, coverageMode };
}

function complete(
  diary: ReturnType<typeof lane>,
  growEvents: ReturnType<typeof lane>,
  observationAt: unknown = OBSERVED_AT,
) {
  return isTimelineSymptomEvidenceWindowComplete({
    observationAt,
    lookbackDays: 14,
    sourceLanes: [diary, growEvents],
  });
}

describe("isTimelineSymptomEvidenceWindowComplete", () => {
  it("accepts known-exhausted source lanes even when an exact dataset has 100 newer rows", () => {
    const exactHundred = Array.from({ length: 100 }, (_, index) =>
      new Date(Date.parse(OBSERVED_AT) - index * 60_000).toISOString(),
    );

    expect(complete(lane(exactHundred, false), lane(exactHundred, false))).toBe(true);
  });

  it("accepts capped lanes with more rows when loaded history reaches the window start", () => {
    expect(
      complete(
        lane([OBSERVED_AT, WITHIN_WINDOW, BEFORE_WINDOW_START], true),
        lane([OBSERVED_AT, "2026-07-17T12:00:00.000Z"], true),
      ),
    ).toBe(true);
  });

  it("accepts unknown pagination or count only when each loaded lane covers the window", () => {
    expect(
      complete(
        lane([OBSERVED_AT, BEFORE_WINDOW_START], null),
        lane([WITHIN_WINDOW, BEFORE_WINDOW_START], null),
      ),
    ).toBe(true);
  });

  it("does not claim unknown or unexhausted coverage at an inclusive boundary tie", () => {
    expect(
      complete(
        lane([OBSERVED_AT, WINDOW_START], true),
        lane([OBSERVED_AT, BEFORE_WINDOW_START], null),
      ),
    ).toBe(false);
    expect(
      complete(
        lane([OBSERVED_AT, BEFORE_WINDOW_START], true),
        lane([OBSERVED_AT, WINDOW_START], null),
      ),
    ).toBe(false);
  });

  it("requires exact exhaustion for a source lane whose pagination is not proven contiguous", () => {
    expect(complete(lane([BEFORE_WINDOW_START], true, "exhaustion_only"), lane([], false))).toBe(
      false,
    );
    expect(complete(lane([BEFORE_WINDOW_START], null, "exhaustion_only"), lane([], false))).toBe(
      false,
    );
    expect(complete(lane([WITHIN_WINDOW], false, "exhaustion_only"), lane([], false))).toBe(true);
  });

  it("keeps the result limited when either source lane contains newer-only rows", () => {
    expect(
      complete(lane([OBSERVED_AT, WINDOW_START], true), lane([OBSERVED_AT, WITHIN_WINDOW], true)),
    ).toBe(false);
    expect(
      complete(lane([OBSERVED_AT, WITHIN_WINDOW], null), lane([OBSERVED_AT, WINDOW_START], null)),
    ).toBe(false);
  });

  it("treats an empty lane as complete only when exhaustion is known", () => {
    expect(complete(lane([], false), lane([], false))).toBe(true);
    expect(complete(lane([], null), lane([], false))).toBe(false);
    expect(complete(lane([], true), lane([], false))).toBe(false);
  });

  it("fails closed for null or invalid observation and source timestamps", () => {
    expect(complete(lane([], false), lane([], false), null)).toBe(false);
    expect(complete(lane([], false), lane([], false), "not-a-date")).toBe(false);
    expect(complete(lane([null], false), lane([], false))).toBe(false);
    expect(complete(lane(["not-a-date", WINDOW_START], true), lane([], false))).toBe(false);
  });

  it("rejects invalid lookback values and missing source lanes", () => {
    expect(
      isTimelineSymptomEvidenceWindowComplete({
        observationAt: OBSERVED_AT,
        lookbackDays: 0,
        sourceLanes: [lane([], false), lane([], false)],
      }),
    ).toBe(false);
    expect(
      isTimelineSymptomEvidenceWindowComplete({
        observationAt: OBSERVED_AT,
        lookbackDays: Number.NaN,
        sourceLanes: [],
      }),
    ).toBe(false);
  });

  it("is deterministic and does not mutate source timestamps", () => {
    const diaryTimestamps = [OBSERVED_AT, WINDOW_START];
    const growEventTimestamps = [WITHIN_WINDOW, BEFORE_WINDOW_START];
    const before = JSON.stringify([diaryTimestamps, growEventTimestamps]);
    const input = {
      observationAt: OBSERVED_AT,
      lookbackDays: 14,
      sourceLanes: [lane(diaryTimestamps, false), lane(growEventTimestamps, null)],
    } as const;

    expect(isTimelineSymptomEvidenceWindowComplete(input)).toBe(true);
    expect(isTimelineSymptomEvidenceWindowComplete(input)).toBe(true);
    expect(JSON.stringify([diaryTimestamps, growEventTimestamps])).toBe(before);
  });
});

describe("Timeline symptom-evidence coverage wiring", () => {
  it("derives per-symptom completeness from counted diary and grow-event source lanes", () => {
    const source = readFileSync(resolve(process.cwd(), "src/pages/Timeline.tsx"), "utf8");

    expect(source).toContain("isTimelineSymptomEvidenceWindowComplete({");
    expect(source).toContain("observationAt: entry.entry_at");
    expect(source).toContain("lookbackDays: SYMPTOM_EVIDENCE_LOOKBACK_DAYS");
    expect(source).toContain("const diaryEvidenceTimestamps = entries.map((row) => row.entry_at)");
    expect(source).toContain(
      "const growEventEvidenceTimestamps = growEvents.map((row) => row.occurred_at)",
    );
    expect(source).toMatch(/entriesTotal\s*>\s*entries\.length/);
    expect(source).toMatch(/growEventsTotal\s*>\s*growEvents\.length/);
    expect(source).toContain('coverageMode: "exhaustion_only"');
    expect(source).toContain('coverageMode: "contiguous_newest_page"');
    expect(source).toMatch(/\.select\(ROOT_ZONE_GROW_EVENT_SELECT,\s*\{\s*count:\s*"exact"\s*\}\)/);
  });

  it("returns an empty symptom map before touching old rows unless the exact current read succeeded", () => {
    const source = readFileSync(resolve(process.cwd(), "src/pages/Timeline.tsx"), "utf8");
    const gate = source.search(
      /if\s*\(\s*!activeReadKey\s*\|\|\s*coreRead\.status\s*!==\s*"success"\s*\|\|\s*coreRead\.readKey\s*!==\s*activeReadKey\s*\)/,
    );
    const evidenceBuild = source.indexOf("buildSymptomEvidenceTimelineRows({", gate);

    expect(gate).toBeGreaterThan(-1);
    expect(source.slice(gate, evidenceBuild)).toContain("return result");
    expect(evidenceBuild).toBeGreaterThan(gate);
  });
});
