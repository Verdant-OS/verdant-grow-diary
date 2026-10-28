import { describe, expect, it } from "vitest";

import {
  addKnownPlant,
  buildHarvestCsv,
  buildHarvestTsv,
  clampHarvestRangeValue,
  countUniquePlants,
  createDefaultHarvestRanges,
  DEFAULT_HARVEST_RANGES,
  evaluateHarvestWindowStatus,
  HARVEST_WINDOW_CTA_HREF,
  HARVEST_WINDOW_FAQ,
  harvestCsvFilename,
  harvestWindowWebApplicationJsonLd,
  localIsoDate,
  projectAmberDate,
  sortHarvestChecks,
  summarizeHarvestPlants,
  validateTrichomePercentages,
  type HarvestCheck,
} from "@/lib/harvestWindowRules";

function check(partial: Partial<HarvestCheck>): HarvestCheck {
  return {
    id: 1,
    date: "2026-11-01",
    plant: "Plant A",
    clear: 20,
    cloudy: 70,
    amber: 10,
    pistils: "",
    photoNote: "",
    ...partial,
  };
}

describe("harvest window status (source self-tests 1–5)", () => {
  it("peak defaults: cloudy 80, amber 10 is in window", () => {
    expect(
      evaluateHarvestWindowStatus(
        check({ clear: 10, cloudy: 80, amber: 10 }),
        "peak",
        DEFAULT_HARVEST_RANGES,
      ),
    ).toBe("In window");
  });

  it("peak: cloudy 60, amber 0 is before window", () => {
    expect(
      evaluateHarvestWindowStatus(
        check({ clear: 40, cloudy: 60, amber: 0 }),
        "peak",
        DEFAULT_HARVEST_RANGES,
      ),
    ).toBe("Before window");
  });

  it("peak: amber 40 is past window", () => {
    expect(
      evaluateHarvestWindowStatus(
        check({ clear: 0, cloudy: 60, amber: 40 }),
        "peak",
        DEFAULT_HARVEST_RANGES,
      ),
    ).toBe("Past window");
  });

  it("energetic: cloudy 75, amber 5 is in window", () => {
    expect(
      evaluateHarvestWindowStatus(
        check({ clear: 20, cloudy: 75, amber: 5 }),
        "energetic",
        DEFAULT_HARVEST_RANGES,
      ),
    ).toBe("In window");
  });

  it("body: amber 40 in window, amber 55 past window", () => {
    expect(
      evaluateHarvestWindowStatus(
        check({ clear: 0, cloudy: 60, amber: 40 }),
        "body",
        DEFAULT_HARVEST_RANGES,
      ),
    ).toBe("In window");
    expect(
      evaluateHarvestWindowStatus(
        check({ clear: 0, cloudy: 45, amber: 55 }),
        "body",
        DEFAULT_HARVEST_RANGES,
      ),
    ).toBe("Past window");
  });

  it("treats the band edges as inclusive", () => {
    const ranges = DEFAULT_HARVEST_RANGES;
    expect(evaluateHarvestWindowStatus(check({ cloudy: 70, amber: 10 }), "peak", ranges)).toBe(
      "In window",
    );
    expect(evaluateHarvestWindowStatus(check({ cloudy: 70, amber: 30 }), "peak", ranges)).toBe(
      "In window",
    );
    expect(evaluateHarvestWindowStatus(check({ cloudy: 69, amber: 20 }), "peak", ranges)).toBe(
      "Before window",
    );
    expect(evaluateHarvestWindowStatus(check({ cloudy: 69, amber: 31 }), "peak", ranges)).toBe(
      "Past window",
    );
    expect(evaluateHarvestWindowStatus(check({ amber: 29 }), "body", ranges)).toBe("Before window");
  });

  it("uses edited ranges", () => {
    const ranges = createDefaultHarvestRanges();
    ranges.peak.amberMax = 40;
    expect(evaluateHarvestWindowStatus(check({ cloudy: 60, amber: 35 }), "peak", ranges)).toBe(
      "Before window",
    );
    expect(evaluateHarvestWindowStatus(check({ cloudy: 70, amber: 35 }), "peak", ranges)).toBe(
      "In window",
    );
  });

  it("createDefaultHarvestRanges returns an independent copy", () => {
    const ranges = createDefaultHarvestRanges();
    ranges.peak.amberMin = 99;
    expect(DEFAULT_HARVEST_RANGES.peak.amberMin).toBe(10);
  });
});

describe("validateTrichomePercentages (source self-test 6)", () => {
  it("rejects a 90% total and accepts 105% and 102%", () => {
    expect(validateTrichomePercentages(30, 30, 30).valid).toBe(false);
    expect(validateTrichomePercentages(35, 35, 35).valid).toBe(true);
    expect(validateTrichomePercentages(34, 34, 34).valid).toBe(true);
  });

  it("accepts 95 and rejects 94 and 106", () => {
    expect(validateTrichomePercentages(5, 85, 5).valid).toBe(true);
    expect(validateTrichomePercentages(4, 85, 5).valid).toBe(false);
    expect(validateTrichomePercentages(6, 95, 5).valid).toBe(false);
  });

  it("explains the total when it is off", () => {
    expect(validateTrichomePercentages(30, 30, 30)).toEqual({
      valid: false,
      reason:
        "Clear %, Cloudy % and Amber % currently total 90%. They must total 100% (±5% allowed for rough estimates, so 95% to 105%).",
    });
  });

  it("requires all three values", () => {
    for (const blank of ["", null, undefined]) {
      expect(validateTrichomePercentages(blank, 50, 50)).toEqual({
        valid: false,
        reason: "Please enter all three trichome percentages (Clear %, Cloudy %, and Amber %).",
      });
    }
  });

  it("rejects non-numbers and out-of-range values", () => {
    expect(validateTrichomePercentages("abc", 50, 50).valid).toBe(false);
    expect(validateTrichomePercentages(-5, 100, 5).valid).toBe(false);
    expect(validateTrichomePercentages(0, 101, 0).valid).toBe(false);
  });

  it("returns parsed numbers from strings", () => {
    expect(validateTrichomePercentages("10", "80", "10")).toEqual({
      valid: true,
      clear: 10,
      cloudy: 80,
      amber: 10,
      total: 100,
    });
  });
});

describe("projectAmberDate (source self-test 7)", () => {
  it("projects a rising amber trend to the window edge", () => {
    const result = projectAmberDate(
      [
        { date: "2026-11-01", amber: 4 },
        { date: "2026-11-06", amber: 14 },
      ],
      10,
    );
    expect(result.projectedDate).toBe("2026-11-04");
    expect(result.text).toBe(
      "At the pace you've logged, amber would reach the lower edge of your window around 2026-11-04. This is a rough projection from your own entries, not a prediction.",
    );
  });

  it("says a flat trend cannot be projected", () => {
    const result = projectAmberDate(
      [
        { date: "2026-11-01", amber: 8 },
        { date: "2026-11-06", amber: 8 },
      ],
      10,
    );
    expect(result).toEqual({
      hasProjection: true,
      projectedDate: null,
      text: "Not enough change yet to project.",
    });
  });

  it("needs two checks on different dates", () => {
    expect(projectAmberDate([{ date: "2026-11-01", amber: 4 }], 10).hasProjection).toBe(false);
    expect(
      projectAmberDate(
        [
          { date: "2026-11-01", amber: 4 },
          { date: "2026-11-01", amber: 9 },
        ],
        10,
      ).hasProjection,
    ).toBe(false);
    expect(projectAmberDate([], 10).hasProjection).toBe(false);
  });

  it("sorts by date and crosses a month end", () => {
    const result = projectAmberDate(
      [
        { date: "2026-12-02", amber: 12 },
        { date: "2026-11-28", amber: 4 },
      ],
      20,
    );
    expect(result.projectedDate).toBe("2026-12-06");
  });
});

describe("CSV and TSV export (source self-test 8)", () => {
  const ranges = createDefaultHarvestRanges();

  it("quotes a note with a comma, quote and newline", () => {
    const note = 'Top cola, "frosty" calyx\n60x loupe';
    const csv = buildHarvestCsv([check({ photoNote: note })], "peak", ranges);
    expect(csv).toContain('"Top cola, ""frosty"" calyx\n60x loupe"');
  });

  it("writes the source headers and one row per check", () => {
    const csv = buildHarvestCsv([check({})], "peak", ranges);
    const [header, row] = csv.split("\r\n");
    expect(header).toBe(
      "Target Effect,Target Cloudy Min %,Target Amber Min %,Target Amber Max %,Date,Plant,Clear %,Cloudy %,Amber %,Window Status,Pistil Notes,Photo Note",
    );
    expect(row).toBe("Peak / balanced,70,10,30,2026-11-01,Plant A,20,70,10,In window,,");
  });

  it("writes N/A for the body target's cloudy minimum", () => {
    const csv = buildHarvestCsv([check({ amber: 40 })], "body", ranges);
    expect(csv.split("\r\n")[1]).toMatch(/^Body \/ later,N\/A,30,50,/);
  });

  it("neutralizes spreadsheet formulas in grower text", () => {
    const csv = buildHarvestCsv(
      [check({ plant: "=HYPERLINK(1)", pistils: "@sum", photoNote: "-2+3" })],
      "peak",
      ranges,
    );
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("'@sum");
    expect(csv).toContain("'-2+3");
  });

  it("flattens tabs and newlines in the TSV", () => {
    const tsv = buildHarvestTsv([check({ pistils: "a\tb\nc" })], "peak", ranges);
    const lines = tsv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1].split("\t")[10]).toBe("a b c");
  });

  it("neutralizes spreadsheet formulas in the copied TSV without CSV quoting", () => {
    const tsv = buildHarvestTsv(
      [check({ plant: "=1+1", pistils: '@sum, "x"', photoNote: "-2+3" })],
      "peak",
      ranges,
    );
    const cells = tsv.split("\n")[1].split("\t");
    expect(cells[5]).toBe("'=1+1");
    expect(cells[10]).toBe('\'@sum, "x"');
    expect(cells[11]).toBe("'-2+3");
    expect(cells[6]).toBe("20");
  });

  it("names the file from an injected date", () => {
    expect(harvestCsvFilename("2026-10-28")).toBe("harvest-checks-2026-10-28.csv");
    expect(localIsoDate(new Date(2028, 1, 29, 23, 59))).toBe("2028-02-29");
  });
});

describe("plants, sorting and summaries", () => {
  it("sorts by plant (case-insensitive), then date, then id", () => {
    const sorted = sortHarvestChecks([
      check({ id: 3, plant: "plant b", date: "2026-11-02" }),
      check({ id: 2, plant: "Plant A", date: "2026-11-05" }),
      check({ id: 1, plant: "Plant A", date: "2026-11-05" }),
      check({ id: 4, plant: "Plant A", date: "2026-11-01" }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual([4, 1, 2, 3]);
  });

  it("counts plants and remembers names case-insensitively", () => {
    expect(
      countUniquePlants([check({ plant: "A" }), check({ plant: "a" }), check({ plant: "B" })]),
    ).toBe(2);
    expect(addKnownPlant(["Plant A"], "plant a")).toEqual(["Plant A"]);
    expect(addKnownPlant(["Plant A"], "Plant B")).toEqual(["Plant A", "Plant B"]);
  });

  it("clamps range inputs and falls back on invalid values", () => {
    expect(clampHarvestRangeValue("120", 30)).toBe(100);
    expect(clampHarvestRangeValue("-4", 30)).toBe(0);
    expect(clampHarvestRangeValue("abc", 30)).toBe(30);
    expect(clampHarvestRangeValue("", 30)).toBe(0);
    expect(clampHarvestRangeValue("25", 30)).toBe(25);
  });

  it("summarizes each plant's change and latest status with the source wording", () => {
    const summaries = summarizeHarvestPlants(
      [
        check({ id: 1, date: "2026-11-01", clear: 26, cloudy: 70, amber: 4 }),
        check({ id: 2, date: "2026-11-06", clear: 6, cloudy: 80, amber: 14 }),
      ],
      "peak",
      createDefaultHarvestRanges(),
    );
    expect(summaries).toEqual([
      {
        key: "plant a",
        heading: "Plant A (2 checks)",
        lines: [
          "Latest check (2026-11-06): In window — Clear 6%, Cloudy 80%, Amber 14%.",
          "Change between first and latest check: Amber +10 points over 2 checks; Cloudy +10 points over 2 checks.",
          "Your latest check is within the window you chose. Confirm on several bud sites before you harvest.",
        ],
      },
    ]);
  });

  it("projects only while the latest amber is still below the window's lower edge", () => {
    const ranges = createDefaultHarvestRanges();
    const rising = (first: number, latest: number) => [
      check({ id: 1, date: "2026-11-01", clear: 20, cloudy: 80 - first, amber: first }),
      check({ id: 2, date: "2026-11-05", clear: 20, cloudy: 80 - latest, amber: latest }),
    ];
    const energetic = summarizeHarvestPlants(rising(2, 6), "energetic", ranges)[0];
    expect(energetic.lines.some((line) => line.includes("would reach"))).toBe(false);
    const inPeak = summarizeHarvestPlants(rising(12, 20), "peak", ranges)[0];
    expect(inPeak.lines.some((line) => line.includes("would reach"))).toBe(false);
    const belowPeak = summarizeHarvestPlants(rising(4, 8), "peak", ranges)[0];
    expect(belowPeak.lines[3]).toBe(
      "At the pace you've logged, amber would reach the lower edge of your window around 2026-11-07. This is a rough projection from your own entries, not a prediction.",
    );
  });

  it("uses singular wording and no projection for one check", () => {
    const [summary] = summarizeHarvestPlants(
      [check({ amber: 0, cloudy: 60, clear: 40 })],
      "peak",
      createDefaultHarvestRanges(),
    );
    expect(summary.heading).toBe("Plant A (1 check)");
    expect(summary.lines).toHaveLength(3);
    expect(summary.lines[1]).toBe(
      "Change between first and latest check: Amber +0 points over 1 check; Cloudy +0 points over 1 check.",
    );
    expect(summary.lines[2]).toMatch(/^Your latest check is before the window/);
  });

  it("is deterministic", () => {
    const checks = [check({ id: 1 }), check({ id: 2, plant: "Plant B" })];
    const ranges = createDefaultHarvestRanges();
    expect(buildHarvestCsv(checks, "peak", ranges)).toBe(buildHarvestCsv(checks, "peak", ranges));
    expect(summarizeHarvestPlants(checks, "peak", ranges)).toEqual(
      summarizeHarvestPlants(checks, "peak", ranges),
    );
  });
});

describe("page metadata", () => {
  it("points every CTA at the signup URL for this guide", () => {
    expect(HARVEST_WINDOW_CTA_HREF).toBe(
      "/auth?mode=signup&utm_source=organic_guide&utm_medium=owned&utm_campaign=search_to_first_value&utm_content=when-to-harvest-cannabis",
    );
  });

  it("keeps the six source FAQ questions", () => {
    expect(HARVEST_WINDOW_FAQ.map((entry) => entry.question)).toEqual([
      "How can I tell if my buds are ready to harvest?",
      "What do clear, cloudy and amber trichomes mean?",
      "Is it better to harvest early or late?",
      "When should I harvest autoflowers?",
      "Should I flush before harvest?",
      "Does this tracker tell me exactly when to harvest?",
    ]);
  });

  it("builds a free WebApplication with no rating", () => {
    const jsonLd = harvestWindowWebApplicationJsonLd(
      "https://verdantgrowdiary.com/guides/when-to-harvest-cannabis",
    );
    expect(jsonLd.name).toBe("Harvest Window Tracker");
    expect(jsonLd.offers.price).toBe("0");
    expect(JSON.stringify(jsonLd)).not.toMatch(/aggregateRating|review/i);
  });
});
