/**
 * labResultsRules — pure rules coverage.
 *
 * The panel's honesty contract lives here: measured values are displayed as
 * entered, calculated totals use the stated decarb formula, nothing is ever
 * ranked across plants, and all grower-facing copy stays calm (banned-words
 * checked).
 */
import { describe, it, expect } from "vitest";
import {
  DECARB_FACTOR,
  LAB_RESULTS_ADD_LABEL,
  LAB_RESULTS_EMPTY_COPY,
  LAB_RESULTS_HEADING,
  LAB_RESULTS_HONESTY_NOTE,
  buildLabResultsView,
  calculateDecarbTotal,
  formatPercent,
  validateLabTestDraft,
  type LabTestDraft,
  type LabTestRow,
} from "@/lib/labResultsRules";
import { paywallCtaHasBannedWords } from "@/lib/paywallCtaViewModel";

const row = (overrides: Partial<LabTestRow>): LabTestRow => ({
  id: "t1",
  testedAt: "2026-08-01T00:00:00.000Z",
  createdAt: null,
  thcaPercent: null,
  thcPercent: null,
  cbdaPercent: null,
  cbdPercent: null,
  terpenes: {},
  labName: null,
  note: null,
  ...overrides,
});

const draft = (overrides: Partial<LabTestDraft>): LabTestDraft => ({
  testedAt: "2026-08-01",
  thcaPercent: "",
  thcPercent: "",
  cbdaPercent: "",
  cbdPercent: "",
  terpenes: [],
  labName: "",
  note: "",
  ...overrides,
});

const NOW = Date.parse("2026-08-12T00:00:00.000Z");

describe("calculateDecarbTotal", () => {
  it("returns null when neither part is present", () => {
    expect(calculateDecarbTotal(null, null)).toBeNull();
  });

  it("applies the decarb factor to the acid form only", () => {
    expect(calculateDecarbTotal(20, null)).toBeCloseTo(20 * DECARB_FACTOR);
    expect(calculateDecarbTotal(null, 1.5)).toBeCloseTo(1.5);
    expect(calculateDecarbTotal(24, 0.5)).toBeCloseTo(24 * DECARB_FACTOR + 0.5);
  });
});

describe("buildLabResultsView", () => {
  it("is empty-safe and surfaces the empty copy", () => {
    const view = buildLabResultsView([]);
    expect(view.hasAny).toBe(false);
    expect(view.count).toBe(0);
    expect(view.emptyCopy).toBe(LAB_RESULTS_EMPTY_COPY);
    expect(buildLabResultsView(null).hasAny).toBe(false);
    expect(buildLabResultsView(undefined).hasAny).toBe(false);
  });

  it("sorts newest first with undated rows last", () => {
    const view = buildLabResultsView([
      row({ id: "old", testedAt: "2026-06-01T00:00:00.000Z" }),
      row({ id: "undated", testedAt: null }),
      row({ id: "new", testedAt: "2026-08-01T00:00:00.000Z" }),
    ]);
    expect(view.cards.map((c) => c.id)).toEqual(["new", "old", "undated"]);
    expect(view.cards[2].dateLabel).toBe("Date not recorded");
  });

  it("breaks same-day ties deterministically: created_at desc, then id", () => {
    // Date-only entry gives every same-day test identical midnight tested_at.
    const sameDay = "2026-08-01T00:00:00.000Z";
    const view = buildLabResultsView([
      row({ id: "b", testedAt: sameDay, createdAt: "2026-08-01T09:00:00.000Z" }),
      row({ id: "a", testedAt: sameDay, createdAt: "2026-08-01T17:00:00.000Z" }),
      row({ id: "z", testedAt: sameDay, createdAt: null }),
      row({ id: "y", testedAt: sameDay, createdAt: null }),
    ]);
    // Newest created first; missing created_at sinks; id orders the rest.
    expect(view.cards.map((c) => c.id)).toEqual(["a", "b", "y", "z"]);
    // Input order must not matter.
    const reversed = buildLabResultsView([
      row({ id: "y", testedAt: sameDay, createdAt: null }),
      row({ id: "z", testedAt: sameDay, createdAt: null }),
      row({ id: "a", testedAt: sameDay, createdAt: "2026-08-01T17:00:00.000Z" }),
      row({ id: "b", testedAt: sameDay, createdAt: "2026-08-01T09:00:00.000Z" }),
    ]);
    expect(reversed.cards.map((c) => c.id)).toEqual(["a", "b", "y", "z"]);
  });

  it("formats the recorded date in UTC so the entered calendar date never shifts", () => {
    // Stored as midnight UTC by the validator; a grower west of UTC must
    // still see Aug 1, not Jul 31. (TZ=UTC in vitest; the timeZone: "UTC"
    // option is what guarantees this in real browsers — pinned statically.)
    const view = buildLabResultsView([row({ testedAt: "2026-08-01T00:00:00.000Z" })]);
    expect(view.cards[0].dateLabel).toContain("Aug 1, 2026");
  });

  it("shows only present cannabinoids and labels calculated totals", () => {
    const view = buildLabResultsView([row({ thcaPercent: 24, thcPercent: 0.5 })]);
    const card = view.cards[0];
    expect(card.cannabinoids.map((c) => c.label)).toEqual(["THCa", "THC"]);
    // 24 × 0.877 + 0.5 = 21.548 → rounded for display
    expect(card.totalThcLabel).toBe("21.55%");
    expect(card.totalCbdLabel).toBeNull();
  });

  it("drops invalid terpene entries and sorts by percentage descending", () => {
    const view = buildLabResultsView([
      row({
        terpenes: {
          myrcene: 0.8,
          limonene: 1.2,
          "": 5, // no name — dropped
          pinene: "high", // not a number — dropped
          caryophyllene: 200, // out of range — dropped
        },
      }),
    ]);
    expect(view.cards[0].terpenes.map((t) => t.name)).toEqual(["limonene", "myrcene"]);
  });

  it("treats a non-object terpenes payload as empty rather than crashing", () => {
    expect(buildLabResultsView([row({ terpenes: "oops" })]).cards[0].terpenes).toEqual([]);
    expect(buildLabResultsView([row({ terpenes: [1, 2] })]).cards[0].terpenes).toEqual([]);
  });

  it("trims lab name and note, collapsing blanks to null", () => {
    const view = buildLabResultsView([row({ labName: "  Green Labs  ", note: "   " })]);
    expect(view.cards[0].labName).toBe("Green Labs");
    expect(view.cards[0].note).toBeNull();
  });
});

describe("validateLabTestDraft", () => {
  it("requires a valid, non-future test date", () => {
    expect(validateLabTestDraft(draft({ testedAt: "" }), NOW).errors).toContain(
      "Test date is required.",
    );
    expect(
      validateLabTestDraft(draft({ testedAt: "2027-01-01", thcPercent: "1" }), NOW).errors,
    ).toContain("Test date cannot be in the future.");
  });

  it("rejects out-of-range percentages", () => {
    const result = validateLabTestDraft(draft({ thcaPercent: "120" }), NOW);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("THCa"))).toBe(true);
  });

  it("requires at least one measurement", () => {
    const result = validateLabTestDraft(draft({}), NOW);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Enter at least one measurement from the report.");
  });

  it("rejects duplicate terpene names instead of silently overwriting", () => {
    const result = validateLabTestDraft(
      draft({
        terpenes: [
          { name: "myrcene", percent: "0.8" },
          { name: " myrcene ", percent: "0.3" },
        ],
      }),
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Terpene "myrcene" is listed more than once.');
  });

  it("skips fully blank terpene rows but rejects half-filled ones", () => {
    const blankOk = validateLabTestDraft(
      draft({ thcPercent: "1", terpenes: [{ name: "", percent: "" }] }),
      NOW,
    );
    expect(blankOk.ok).toBe(true);

    const missingName = validateLabTestDraft(
      draft({ thcPercent: "1", terpenes: [{ name: "", percent: "0.5" }] }),
      NOW,
    );
    expect(missingName.errors).toContain("Each terpene needs a name.");

    const badValue = validateLabTestDraft(
      draft({ thcPercent: "1", terpenes: [{ name: "myrcene", percent: "abc" }] }),
      NOW,
    );
    expect(badValue.errors.some((e) => e.includes('"myrcene"'))).toBe(true);
  });

  it("produces a clean payload on the happy path", () => {
    const result = validateLabTestDraft(
      draft({
        testedAt: "2026-08-01",
        thcaPercent: "24",
        thcPercent: "0.5",
        terpenes: [{ name: " myrcene ", percent: "0.8" }],
        labName: "  Green Labs ",
        note: "  flower COA ",
      }),
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(result.payload).toEqual({
      tested_at: new Date(Date.parse("2026-08-01")).toISOString(),
      thca_percent: 24,
      thc_percent: 0.5,
      cbda_percent: null,
      cbd_percent: null,
      terpenes: { myrcene: 0.8 },
      lab_name: "Green Labs",
      note: "flower COA",
    });
  });
});

describe("copy stays calm", () => {
  it("no banned marketing words in any exported copy", () => {
    for (const copy of [
      LAB_RESULTS_HEADING,
      LAB_RESULTS_EMPTY_COPY,
      LAB_RESULTS_HONESTY_NOTE,
      LAB_RESULTS_ADD_LABEL,
    ]) {
      expect(paywallCtaHasBannedWords(copy), copy).toBe(false);
    }
  });
});

describe("formatPercent", () => {
  it("trims to at most two decimals", () => {
    expect(formatPercent(21.548)).toBe("21.55%");
    expect(formatPercent(24)).toBe("24%");
    expect(formatPercent(0.8)).toBe("0.8%");
  });
});
