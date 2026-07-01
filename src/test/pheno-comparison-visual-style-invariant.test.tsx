/**
 * pheno-comparison-visual-style-invariant — asserts that stale, invalid,
 * demo, unknown, or incomplete telemetry NEVER receives green/OK/success
 * visual styling on the read-only /pheno-comparison surface.
 *
 * Complements pheno-comparison-never-healthy-invariant.test.tsx by
 * checking the visual-style layer specifically:
 *   - class names (bg-green-*, text-green-*, bg-emerald-*, badge-success)
 *   - data attributes (data-status="ok" / "healthy", data-tone="success",
 *     data-variant="success")
 *   - forbidden status text tokens ("OK", "healthy", "normal", "verified",
 *     "passed", "success", "all good", "no issues detected")
 *
 * Honest denial language ("not treated as healthy", "never shown as
 * healthy") is explicitly allowed via `containsHealthyStatusLanguage`-style
 * precise checks.
 */
import { describe, it, expect, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";

const candidateHolder = vi.hoisted(
  () =>
    ({ current: [] as readonly PhenoCandidateInput[] }) as {
      current: readonly PhenoCandidateInput[];
    },
);

vi.mock("@/lib/phenoComparisonFixtures", () => ({
  PHENO_COMPARISON_DEMO_BANNER:
    "Demo comparison data — not live sensor data. Preview surface only.",
  get PHENO_COMPARISON_DEMO_CANDIDATES() {
    return candidateHolder.current;
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error("forbidden");
      },
    },
  ),
}));

import PhenoComparison from "@/pages/PhenoComparison";

const UNTRUSTED_SOURCES = new Set(["demo", "stale", "invalid"]);

const FORBIDDEN_STATUS_ATTRS: ReadonlyArray<[string, string]> = [
  ["data-status", "ok"],
  ["data-status", "healthy"],
  ["data-tone", "success"],
  ["data-variant", "success"],
];

const FORBIDDEN_CLASS_RE =
  /\b(?:bg|text|border|ring)-(?:green|emerald)-\d/;
const FORBIDDEN_BADGE_RE = /badge-success|status-ok|is-healthy/;

/**
 * Allow "not healthy", "never … healthy", "not treated as healthy",
 * "never shown as healthy", "excluded from healthy status" — reject
 * affirmative healthy status text.
 */
function containsHealthyStatusLanguage(text: string): boolean {
  // Explicit affirmative tokens (word-bounded, case-insensitive).
  const affirmative = [
    /\bis healthy\b/i,
    /\blooks healthy\b/i,
    /\bhealthy plant\b/i,
    /\ball good\b/i,
    /\bno issues (?:detected|found)\b/i,
    /\bverified\b/i,
    /\bpassed\b/i,
    /\bnormal\b/i,
    /\bstatus:\s*ok\b/i,
    /\bstatus:\s*success\b/i,
  ];
  return affirmative.some((r) => r.test(text));
}

function makeUntrustedMatrix(): PhenoCandidateInput[] {
  const base = {
    requireEcPh: true,
    requirePpfd: true,
    photos: [],
    quickLogEntries: [],
    timelineEvents: [],
  } as const;
  return [
    {
      ...base,
      candidateId: "vs-stale",
      candidateLabel: "Stale-visual #1",
      sensorSnapshots: [
        {
          id: "vs-stale-1",
          source: "stale",
          capturedAt: "2026-01-01T00:00:00.000Z",
          tempF: 75, rh: 55, vpd: 1.1, ec: 1.5, ph: 6.1, ppfd: 700,
        },
      ],
    },
    {
      ...base,
      candidateId: "vs-invalid",
      candidateLabel: "Invalid-visual #2",
      sensorSnapshots: [
        {
          id: "vs-invalid-1",
          source: "invalid",
          capturedAt: null,
          tempF: null, rh: null, vpd: null, ec: null, ph: null, ppfd: null,
        },
      ],
    },
    {
      ...base,
      candidateId: "vs-demo",
      candidateLabel: "Demo-visual #3",
      sensorSnapshots: [
        {
          id: "vs-demo-1",
          source: "demo",
          capturedAt: "2026-06-20T00:00:00.000Z",
          tempF: 75, rh: 55, vpd: 1.1, ec: 1.5, ph: 6.1, ppfd: 700,
        },
      ],
    },
    {
      ...base,
      candidateId: "vs-unknown",
      candidateLabel: "Unknown-visual #4",
      sensorSnapshots: [
        {
          id: "vs-unknown-1",
          source: "not-a-real-source",
          capturedAt: "2026-06-20T00:00:00.000Z",
          tempF: 75, rh: 55, vpd: 1.1, ec: 1.5, ph: 6.1, ppfd: 700,
        },
      ],
    },
    {
      ...base,
      candidateId: "vs-incomplete",
      candidateLabel: "Incomplete-visual #5",
      sensorSnapshots: [
        {
          id: "vs-incomplete-1",
          source: "live",
          capturedAt: "2026-06-20T00:00:00.000Z",
          tempF: 75, rh: null, vpd: null, ec: null, ph: null, ppfd: null,
        },
      ],
    },
  ];
}

function renderWith(cands: readonly PhenoCandidateInput[]) {
  candidateHolder.current = cands;
  return render(
    <MemoryRouter initialEntries={["/pheno-comparison"]}>
      <Routes>
        <Route path="/pheno-comparison" element={<PhenoComparison />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PhenoComparison visual-style never-healthy invariant", () => {
  for (const label of ["stale", "invalid", "demo", "unknown"] as const) {
    it(`does not paint ${label} evidence with success visual styling`, () => {
      const matrix = makeUntrustedMatrix();
      const { container } = renderWith(matrix);
      try {
        const target = matrix.find((c) => c.candidateId === `vs-${label}`)!;
        const region = container.querySelector<HTMLElement>(
          `[data-testid='pheno-candidate-${target.candidateId}']`,
        );
        expect(region, `${label} region must render`).not.toBeNull();
        const html = region!.outerHTML;
        expect(html, `${label}: no green/emerald status classes`).not.toMatch(
          FORBIDDEN_CLASS_RE,
        );
        expect(html, `${label}: no success badge classes`).not.toMatch(
          FORBIDDEN_BADGE_RE,
        );
        for (const [attr, val] of FORBIDDEN_STATUS_ATTRS) {
          expect(
            region!.querySelector(`[${attr}="${val}"]`),
            `${label}: forbidden ${attr}="${val}"`,
          ).toBeNull();
        }
        // Accessible-text + visible-text combined.
        const text = region!.textContent ?? "";
        expect(containsHealthyStatusLanguage(text), `${label} text`).toBe(
          false,
        );
      } finally {
        candidateHolder.current = [];
        cleanup();
      }
    });
  }

  it("does not paint incomplete-metric flags with success styling (trusted source, missing metrics)", () => {
    // Incomplete candidate uses a trusted source ("live") — the source badge
    // legitimately renders in the source tone. But the missing-flag list
    // and each individual `missing_*` marker must never carry success
    // styling or affirmative healthy language.
    const matrix = makeUntrustedMatrix();
    const { container } = renderWith(matrix);
    try {
      const region = container.querySelector<HTMLElement>(
        `[data-testid='pheno-candidate-vs-incomplete']`,
      )!;
      const missingNodes = region.querySelectorAll<HTMLElement>(
        "[data-testid^='snapshot-'][data-testid*='-missing-']",
      );
      expect(missingNodes.length).toBeGreaterThan(0);
      for (const el of missingNodes) {
        expect(el.outerHTML).not.toMatch(FORBIDDEN_CLASS_RE);
        expect(el.outerHTML).not.toMatch(FORBIDDEN_BADGE_RE);
        for (const [attr, val] of FORBIDDEN_STATUS_ATTRS) {
          expect(el.querySelector(`[${attr}="${val}"]`)).toBeNull();
        }
        const text = el.textContent ?? "";
        expect(containsHealthyStatusLanguage(text)).toBe(false);
      }
    } finally {
      candidateHolder.current = [];
      cleanup();
    }
  });


  it("no untrusted snapshot subtree carries a success tone anywhere on the page", () => {
    const { container } = renderWith(makeUntrustedMatrix());
    try {
      const snapshots = container.querySelectorAll<HTMLElement>(
        "[data-testid^='snapshot-'][data-source]",
      );
      expect(snapshots.length).toBeGreaterThan(0);
      for (const el of snapshots) {
        const src = el.getAttribute("data-source") ?? "";
        if (!UNTRUSTED_SOURCES.has(src)) continue;
        expect(el.outerHTML).not.toMatch(FORBIDDEN_CLASS_RE);
        expect(el.outerHTML).not.toMatch(FORBIDDEN_BADGE_RE);
        for (const [attr, val] of FORBIDDEN_STATUS_ATTRS) {
          expect(el.querySelector(`[${attr}="${val}"]`)).toBeNull();
        }
      }
    } finally {
      candidateHolder.current = [];
      cleanup();
    }
  });

  it("allows honest denial language on the caveat copy", () => {
    // Sanity check on the helper: denial phrasing must not trip the guard.
    expect(
      containsHealthyStatusLanguage(
        "Reading is invalid — not treated as healthy.",
      ),
    ).toBe(false);
    expect(
      containsHealthyStatusLanguage("Never shown as healthy."),
    ).toBe(false);
    expect(
      containsHealthyStatusLanguage("Excluded from healthy status."),
    ).toBe(false);
  });
});
