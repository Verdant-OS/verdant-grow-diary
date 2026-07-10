/**
 * Static contract for the Pheno live paid-user smoke
 * (e2e/pheno-tracker-paid-user-smoke.spec.ts).
 *
 * The release-required assertions in Specs A, C3, D+E, and G must stay
 * AFFIRMATIVE: this suite fails if any of them regresses to an optional
 * pattern — an `if (await locator.count())` guard or a silent early
 * `return;` — or if a required selector/exact-copy assertion disappears.
 * It also pins the live-smoke checkpoint mapping to the spec's actual test
 * titles so a renamed test cannot silently turn a checkpoint PENDING.
 *
 * This does NOT ban count()/conditionals in Playwright generally — only in
 * the release-required scenarios of this one spec.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CHECKPOINT_TEST_MAP } from "../../scripts/e2e/pheno-live-smoke-report.mjs";

const SPEC_PATH = path.join(process.cwd(), "e2e/pheno-tracker-paid-user-smoke.spec.ts");
const source = fs.readFileSync(SPEC_PATH, "utf8");

/** Slice the spec source between two describe titles (end optional). */
function sliceBetween(startTitle: string, endTitle?: string): string {
  const start = source.indexOf(startTitle);
  expect(start, `describe "${startTitle}" must exist in the live smoke`).toBeGreaterThan(-1);
  const end = endTitle ? source.indexOf(endTitle) : source.length;
  expect(end, `describe "${endTitle}" must exist in the live smoke`).toBeGreaterThan(start);
  return source.slice(start, end);
}

const SLICES: Array<{ name: string; slice: string; requiredSelectors: string[] }> = [
  {
    name: "A. Free user gate",
    slice: sliceBetween("A. Free user gate", "B. CheckoutSuccess sanitizer"),
    requiredSelectors: [
      'getByTestId("pheno-tracker-upgrade-gate")',
      'getByTestId("pheno-tracker-upgrade-gate-upgrade-link")',
      'getByTestId("pheno-hunt-onboarding")',
      "/pricing?returnTo=%2Fpheno-hunts%2Fnew",
    ],
  },
  {
    name: "C3. Canceled/expired",
    slice: sliceBetween("C3. Canceled/expired blocked", "D–F. Missing-evidence hunt"),
    requiredSelectors: [
      'getByTestId("pheno-tracker-upgrade-gate")',
      'getByTestId("pheno-hunt-onboarding")',
    ],
  },
  {
    name: "D–F. Missing-evidence hunt",
    slice: sliceBetween("D–F. Missing-evidence hunt", "G. Comparison-ready hunt"),
    requiredSelectors: [
      'getByTestId("pheno-workspace-compare-action")',
      'getByTestId("pheno-workspace-compare-action-disabled")',
      'getByTestId("pheno-workspace-compare-action-reason")',
      'a[data-testid^="pheno-workspace-compare-action-next-step-"]',
      "DISABLED_REASON_BY_READINESS",
      "toBeAttached",
    ],
  },
  {
    name: "G. Comparison-ready hunt",
    slice: sliceBetween("G. Comparison-ready hunt", "I. Core one-tent regression"),
    requiredSelectors: [
      'getByTestId("pheno-workspace-compare-action-link")',
      'getByTestId("pheno-comparison-page")',
      'getByTestId("pheno-comparison-grid")',
      '[data-testid^="pheno-candidate-"]',
      'getByTestId("pheno-comparison-read-only-badge")',
      "-heading",
    ],
  },
];

describe("live smoke assertion contract — required assertions stay affirmative", () => {
  it.each(SLICES.map((s) => [s.name, s] as const))(
    "%s: no conditional count() guards or silent early returns",
    (_name, { slice }) => {
      // An `if (await ...)` in a release-required scenario means an assertion
      // can be skipped when the UI is absent — the exact vacuous-pass pattern
      // this contract exists to prevent.
      expect(slice).not.toMatch(/if\s*\(\s*await\b/);
      // A bare `return;` lets the test succeed without proving the scenario.
      expect(slice).not.toMatch(/^\s*return;\s*$/m);
    },
  );

  it.each(
    SLICES.flatMap((s) => s.requiredSelectors.map((sel) => [s.name, sel, s.slice] as const)),
  )("%s asserts %s", (_name, selector, slice) => {
    expect(slice).toContain(selector);
  });

  it("Spec A skips (never runs anonymously) when the Free session is absent", () => {
    const sliceA = SLICES[0].slice;
    expect(sliceA).toContain("test.skip(!FREE_SESSION.path");
  });

  it("pins the exact disabled-reason copy from the readiness view model", () => {
    for (const copy of [
      "Add the missing evidence before comparing candidates.",
      "Missing evidence",
      "Pending until harvest",
      "Pending until cure",
      "Compare candidates is disabled because this hunt is not comparison-ready yet.",
    ]) {
      expect(source, `exact copy "${copy}" must be pinned in the live smoke`).toContain(copy);
    }
  });

  it("the vacuous never-existing testid must not come back", () => {
    // "pheno-hunt-create-form" never existed in the product; asserting its
    // absence can never fail. The real onboarding root is
    // "pheno-hunt-onboarding".
    expect(source).not.toContain("pheno-hunt-create-form");
  });
});

describe("live smoke assertion contract — checkpoint mapping stays in sync", () => {
  const mapped = CHECKPOINT_TEST_MAP.filter(
    (c: { titles: string[] }) => c.titles.length > 0,
  ) as Array<{ id: number; label: string; titles: string[] }>;

  it.each(mapped.flatMap((c) => c.titles.map((t) => [c.id, c.label, t] as const)))(
    "checkpoint %i (%s) maps to a real test title fragment",
    (_id, _label, fragment) => {
      expect(
        source,
        `mapped fragment "${fragment}" must appear in the live smoke spec — renaming the test would silently turn its checkpoint PENDING`,
      ).toContain(fragment);
    },
  );

  it("checkpoint 6 keeps no automated mapping (manual/receipt policy unchanged)", () => {
    const six = CHECKPOINT_TEST_MAP.find((c: { id: number }) => c.id === 6) as {
      titles: string[];
    };
    expect(six.titles).toEqual([]);
  });

  it("checkpoints 1, 2, 8, 9, and 11 all have automated live proof mapped", () => {
    for (const id of [1, 2, 8, 9, 11]) {
      const entry = CHECKPOINT_TEST_MAP.find((c: { id: number }) => c.id === id) as {
        titles: string[];
      };
      expect(entry.titles.length, `checkpoint ${id} must map to live tests`).toBeGreaterThan(0);
    }
  });
});
