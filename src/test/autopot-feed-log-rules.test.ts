import { describe, expect, it } from "vitest";
import {
  AUTOPOT_DIFFERENT_UNITS,
  AUTOPOT_LOG_FAQ,
  GROW_EXAMPLE,
  autopotCsvFilename,
  autopotLocalIsoDate,
  buildAutopotCsv,
  buildAutopotEntry,
  buildAutopotTsv,
  computeAutopotEcDiff,
  computeAutopotPhDiff,
  computeAutopotRefillStats,
  countComparedAutopotEntries,
  describeAutopotTent,
  formatAutopotEcCell,
  formatAutopotPhCell,
  hasMixedAutopotUnits,
  parseAutopotIsoDate,
  sortAutopotEntries,
  sumAutopotGallons,
  summarizeAutopotTents,
  validateAutopotEntry,
  type AutopotRawEntry,
} from "@/lib/autopotFeedLogRules";

const BLANK: AutopotRawEntry = {
  date: "2026-10-28",
  tent: "",
  system: "AutoPot Classic",
  entryType: "Refill / top-up",
  volumeGal: "",
  waterTempF: "",
  mix: "",
  actualPh: "",
  actualEc: "",
  actualUnit: "mS/cm",
  plannedPh: "",
  plannedEc: "",
  plannedUnit: "mS/cm",
  note: "",
};

const entry = (id: number, partial: Partial<AutopotRawEntry>) =>
  buildAutopotEntry(id, { ...BLANK, ...partial });

describe("source self-tests", () => {
  it("1. signs the pH difference to two decimals", () => {
    expect(computeAutopotPhDiff("5.8", "5.83")).toBe("+0.03");
    expect(computeAutopotPhDiff("6.0", "5.75")).toBe("−0.25");
    expect(computeAutopotPhDiff("6", "6.00")).toBe("0.00");
    expect(computeAutopotPhDiff("", "6")).toBe("");
  });

  it("2. computes EC in the shared unit with the inputs' precision", () => {
    expect(computeAutopotEcDiff("1.2", "mS/cm", "1.35", "mS/cm")).toBe("+0.15 mS/cm");
    expect(computeAutopotEcDiff("600", "PPM (500 scale)", "580", "PPM (500 scale)")).toBe(
      "−20 PPM (500 scale)",
    );
    expect(computeAutopotEcDiff("1.2", "mS/cm", "1.20", "mS/cm")).toBe("0.00 mS/cm");
  });

  it("3. never converts between units", () => {
    expect(computeAutopotEcDiff("1.2", "mS/cm", "600", "PPM (500 scale)")).toBe(
      AUTOPOT_DIFFERENT_UNITS,
    );
    expect(computeAutopotEcDiff("1200", "µS/cm", "1.2", "mS/cm")).toBe(AUTOPOT_DIFFERENT_UNITS);
    expect(computeAutopotEcDiff("1.2", "", "1.3", "mS/cm")).toBe("");
  });

  it("4. rejects out-of-range pH, an EC without a unit, and negative volume", () => {
    expect(validateAutopotEntry({ date: "2026-10-28", actualPh: "15" })).toEqual({
      valid: false,
      error: "Actual pH must be between 0 and 14.",
    });
    expect(validateAutopotEntry({ date: "2026-10-28", actualEc: "1.2", actualUnit: "" })).toEqual({
      valid: false,
      error: "Please select the unit shown on your meter for Actual EC/PPM.",
    });
    expect(validateAutopotEntry({ date: "2026-10-28", volumeGal: "-1" })).toEqual({
      valid: false,
      error: "Volume added must be between 0 and 500 gallons (cannot be negative).",
    });
  });

  it("5. averages refill intervals and counts days since the last refill", () => {
    expect(
      computeAutopotRefillStats(["2026-10-20", "2026-10-24", "2026-10-30"], "2026-11-02"),
    ).toEqual({ daysSinceLast: 3, avgIntervalDays: "5.0" });
    expect(computeAutopotRefillStats(["2026-10-20"], "2026-10-20")).toEqual({
      daysSinceLast: 0,
      avgIntervalDays: null,
    });
    expect(computeAutopotRefillStats([], "2026-10-20")).toEqual({
      daysSinceLast: null,
      avgIntervalDays: null,
    });
  });

  it("6. sums gallons and rounds half-up to one decimal", () => {
    expect(sumAutopotGallons(["5", "2.5", "3.25"])).toBe("10.8");
    expect(sumAutopotGallons(["", "abc", "-2", "0"])).toBe("0.0");
  });

  it("7. warns when one tent mixes EC/PPM units", () => {
    expect(
      hasMixedAutopotUnits([
        { actualEc: "1.2", actualUnit: "mS/cm", plannedEc: "", plannedUnit: "" },
        { actualEc: "840", actualUnit: "PPM (700 scale)", plannedEc: "", plannedUnit: "" },
      ]),
    ).toBe(true);
    expect(
      hasMixedAutopotUnits([
        { actualEc: "1.2", actualUnit: "mS/cm", plannedEc: "1.1", plannedUnit: "mS/cm" },
      ]),
    ).toBe(false);
  });

  it("8. quotes a mix with a comma, quotes and a newline as one CSV field", () => {
    const csv = buildAutopotCsv([
      entry(1, { mix: 'Stash Bloom, "top dress"\nplain water in tank' }),
    ]);
    expect(csv).toContain('"Stash Bloom, ""top dress""\nplain water in tank"');
  });

  it("9. keeps the grow example null, so nothing from it can render or export", () => {
    expect(GROW_EXAMPLE).toBeNull();
  });
});

describe("validation", () => {
  it("checks the date, planned values, units and water temperature", () => {
    expect(validateAutopotEntry({ date: "2026-02-30" })).toMatchObject({ valid: false });
    expect(validateAutopotEntry({ date: "" })).toEqual({
      valid: false,
      error: "Please enter a valid date for this entry.",
    });
    expect(validateAutopotEntry({ date: "2026-10-28", plannedPh: "-1" })).toMatchObject({
      error: "Planned pH must be between 0 and 14.",
    });
    expect(validateAutopotEntry({ date: "2026-10-28", plannedEc: "1", plannedUnit: "" })).toEqual({
      valid: false,
      error: "Please select a unit for Planned EC/PPM.",
    });
    expect(
      validateAutopotEntry({ date: "2026-10-28", actualEc: "-3", actualUnit: "mS/cm" }),
    ).toEqual({ valid: false, error: "Actual EC/PPM must be 0 or greater." });
    expect(validateAutopotEntry({ date: "2026-10-28", waterTempF: "31" })).toEqual({
      valid: false,
      error: "Reservoir water temperature must be between 32°F and 120°F.",
    });
    expect(
      validateAutopotEntry({
        ...BLANK,
        volumeGal: "500",
        waterTempF: "120",
        actualPh: "0",
        actualEc: "476",
        actualUnit: "µS/cm",
      }),
    ).toEqual({ valid: true });
  });

  it("drops a unit whose reading is blank and trims text", () => {
    const e = entry(1, {
      tent: "  Flower tent ",
      actualEc: "",
      actualUnit: "mS/cm",
      plannedEc: "1.1",
    });
    expect(e).toMatchObject({ tent: "Flower tent", actualUnit: "", plannedUnit: "mS/cm" });
  });
});

describe("table cells, sort and summary", () => {
  it("formats pH and EC cells the way the source does", () => {
    expect(formatAutopotPhCell(entry(1, {}))).toBe("—");
    expect(formatAutopotPhCell(entry(1, { plannedPh: "5.8" }))).toBe("Planned: 5.8");
    expect(formatAutopotPhCell(entry(1, { actualPh: "5.83" }))).toBe("5.83");
    expect(formatAutopotPhCell(entry(1, { plannedPh: "5.8", actualPh: "5.83" }))).toBe(
      "5.8 → 5.83 (+0.03)",
    );
    expect(
      formatAutopotEcCell(
        entry(1, { plannedEc: "1.2", actualEc: "600", actualUnit: "PPM (500 scale)" }),
      ),
    ).toEqual({ text: "1.2 mS/cm → 600 PPM (500 scale)", differentUnits: true });
    expect(formatAutopotEcCell(entry(1, { plannedEc: "1.2", actualEc: "1.35" }))).toEqual({
      text: "1.2 mS/cm → 1.35 mS/cm (+0.15 mS/cm)",
      differentUnits: false,
    });
  });

  it("sorts newest date first with later entries first on a tie", () => {
    const sorted = sortAutopotEntries([
      entry(1, { date: "2026-10-20" }),
      entry(2, { date: "2026-10-28" }),
      entry(3, { date: "2026-10-28" }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it("groups tents case-insensitively, skips repots for refill intervals, and flags mixed units", () => {
    const entries = [
      entry(1, { date: "2026-10-01", tent: "Flower tent", entryType: "Repot (media mix)" }),
      entry(2, { date: "2026-10-20", tent: "Flower tent", volumeGal: "5" }),
      entry(3, { date: "2026-10-24", tent: "flower TENT", volumeGal: "2.5", actualEc: "1.2" }),
      entry(4, {
        date: "2026-10-30",
        tent: "Flower tent",
        volumeGal: "3.25",
        actualEc: "840",
        actualUnit: "PPM (700 scale)",
      }),
      entry(5, { date: "2026-10-30", volumeGal: "1" }),
    ];
    const tents = summarizeAutopotTents(entries, "2026-11-02");
    expect(tents.map((t) => t.name)).toEqual(["Flower tent", "Unassigned tent"]);
    expect(tents[0]).toEqual({
      name: "Flower tent",
      gallons: "10.8",
      entryCount: 4,
      daysSinceLast: 3,
      avgIntervalDays: "5.0",
      mixedUnits: true,
    });
    expect(describeAutopotTent(tents[1])).toBe(
      "1.0 gal added across 1 entry · Days since last refill: 3",
    );
    expect(countComparedAutopotEntries(entries)).toBe(0);
    expect(
      countComparedAutopotEntries([entry(1, { plannedPh: "5.8", actualPh: "5.9" }), entries[0]]),
    ).toBe(1);
  });
});

describe("exports", () => {
  it("writes the source CSV columns, newest first, with units only beside readings", () => {
    const csv = buildAutopotCsv([
      entry(1, { date: "2026-10-20", volumeGal: "5", plannedPh: "5.8", actualPh: "5.83" }),
      entry(2, {
        date: "2026-10-27",
        tent: "Flower tent",
        actualPh: "5.83",
        actualEc: "476",
        actualUnit: "µS/cm",
      }),
    ]).split("\r\n");
    expect(csv[0]).toBe(
      "Date,Tent,System,Type,Volume (gal),Mix,Planned pH,Actual pH,pH Diff,Planned EC/PPM,Planned Unit,Actual EC/PPM,Actual Unit,EC/PPM Diff,Water Temp (°F),Note",
    );
    expect(csv[1]).toBe(
      "2026-10-27,Flower tent,AutoPot Classic,Refill / top-up,,,,5.83,,,,476,µS/cm,,,",
    );
    expect(csv[2]).toBe("2026-10-20,,AutoPot Classic,Refill / top-up,5,,5.8,5.83,+0.03,,,,,,,");
    expect(buildAutopotCsv([]).split("\r\n")).toHaveLength(1);
  });

  it("writes the source TSV columns and guards formula cells", () => {
    const tsv = buildAutopotTsv([
      entry(1, {
        tent: "=cmd",
        mix: "Stash\tBlend\nweekly",
        plannedEc: "1.2",
        actualEc: "600",
        actualUnit: "PPM (500 scale)",
        waterTempF: "68",
      }),
    ]).split("\n");
    expect(tsv[0].split("\t")).toEqual([
      "Date",
      "Tent",
      "System",
      "Type",
      "Volume (gal)",
      "Mix",
      "pH (planned -> actual, diff)",
      "EC/PPM (planned -> actual, diff, unit)",
      "Water Temp (°F)",
      "Note",
    ]);
    expect(tsv[1].split("\t")).toEqual([
      "2026-10-28",
      "'=cmd",
      "AutoPot Classic",
      "Refill / top-up",
      "",
      "Stash Blend weekly",
      "—",
      "1.2 mS/cm -> 600 PPM (500 scale) (Different units — no comparison)",
      "68°F",
      "",
    ]);
  });

  it("names the CSV and formats the local date", () => {
    expect(autopotCsvFilename("2026-10-28")).toBe("autopot-feed-log-2026-10-28.csv");
    expect(autopotLocalIsoDate(new Date(2026, 9, 28, 23, 30))).toBe("2026-10-28");
    expect(parseAutopotIsoDate("2028-02-29")).not.toBeNull();
    expect(parseAutopotIsoDate("2027-02-29")).toBeNull();
  });

  it("FAQ has six entries", () => {
    expect(AUTOPOT_LOG_FAQ).toHaveLength(6);
  });
});
