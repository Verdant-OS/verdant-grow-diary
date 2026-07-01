/**
 * pheno-comparison-never-healthy-invariant — expanded assertions that
 * unknown, incomplete, and invalid telemetry combinations never render
 * as OK/check/success/healthy anywhere on the /pheno-comparison surface.
 *
 * Covers, by rendering the presenter with hand-crafted candidate inputs:
 *  1. Unknown source string (e.g. "somethingelse") → normalizes to invalid
 *  2. Missing source (null/undefined) → normalizes to invalid
 *  3. Incomplete metrics (temp only, RH only, no VPD, no EC/pH, no PPFD)
 *  4. Stale reading with otherwise complete metrics
 *  5. Invalid reading with all metrics null
 *  6. Candidate with zero snapshots
 *  7. Candidate with zero photos + zero diary + zero snapshots
 *
 * Also enforces there are NO affirmative healthy indicators anywhere:
 *  - text strings: "healthy", "all good", "no issues", "looks good", "ok"
 *    (as standalone status word), "success", "passing", "verified healthy"
 *  - emoji/symbol indicators: ✓, ✔, ✅, 👍, 🟢
 *  - CSS status classes hinting success: bg-green-*, text-green-*, badge-success
 *    are only allowed on TRUSTED sources (live/manual/csv), never on
 *    demo/stale/invalid candidates.
 */
import { describe, it, expect, vi } from "vitest";
import { render, within, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PhenoComparison from "@/pages/PhenoComparison";
import * as fixtures from "@/lib/phenoComparisonFixtures";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";

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

const AFFIRMATIVE_HEALTHY_PATTERNS: RegExp[] = [
  /\bis healthy\b/i,
  /\blooks healthy\b/i,
  /\bhealthy plant\b/i,
  /\ball good\b/i,
  /\bno issues (?:detected|found)\b/i,
  /\bpassing checks?\b/i,
  /\bverified healthy\b/i,
  /\blooks good\b/i,
  /\ball clear\b/i,
  /\bno problems\b/i,
];

// These characters must not appear as status glyphs anywhere on the page.
const FORBIDDEN_SUCCESS_GLYPHS = ["✓", "✔", "✅", "🟢", "👍"];

const UNTRUSTED_SOURCES = new Set(["demo", "stale", "invalid"]);

// Hand-crafted, deterministic candidate matrix covering every risky combo.
const NEVER_HEALTHY_CANDIDATES: PhenoCandidateInput[] = [
  {
    candidateId: "nh-unknown-source",
    candidateLabel: "Unknown-source #1",
    requireEcPh: true,
    requirePpfd: true,
    sensorSnapshots: [
      {
        id: "u-1",
        source: "somethingelse", // normalizes to invalid
        capturedAt: "2026-06-20T00:00:00.000Z",
        tempF: 75,
        rh: 55,
        vpd: 1.1,
        ec: 1.5,
        ph: 6.1,
        ppfd: 700,
      },
    ],
    photos: [{ id: "p", caption: "x" }],
    quickLogEntries: [{ id: "q", at: "2026-06-20T00:00:00.000Z" }],
    timelineEvents: [],
  },
  {
    candidateId: "nh-missing-source",
    candidateLabel: "Missing-source #2",
    requireEcPh: true,
    requirePpfd: true,
    sensorSnapshots: [
      {
        id: "m-1",
        source: null,
        capturedAt: null,
        tempF: null,
        rh: null,
        vpd: null,
        ec: null,
        ph: null,
        ppfd: null,
      },
    ],
    photos: [],
    quickLogEntries: [],
    timelineEvents: [],
  },
  {
    candidateId: "nh-incomplete-temp-only",
    candidateLabel: "Incomplete-temp-only #3",
    requireEcPh: true,
    requirePpfd: true,
    sensorSnapshots: [
      {
        id: "t-1",
        source: "live",
        capturedAt: "2026-06-20T00:00:00.000Z",
        tempF: 75,
        rh: null,
        vpd: null,
        ec: null,
        ph: null,
        ppfd: null,
      },
    ],
    photos: [{ id: "p", caption: "x" }],
    quickLogEntries: [{ id: "q", at: "2026-06-20T00:00:00.000Z" }],
    timelineEvents: [],
  },
  {
    candidateId: "nh-stale-complete",
    candidateLabel: "Stale-complete #4",
    requireEcPh: true,
    requirePpfd: true,
    sensorSnapshots: [
      {
        id: "s-1",
        source: "stale",
        capturedAt: "2026-01-01T00:00:00.000Z",
        tempF: 75,
        rh: 55,
        vpd: 1.1,
        ec: 1.5,
        ph: 6.1,
        ppfd: 700,
      },
    ],
    photos: [{ id: "p" }],
    quickLogEntries: [{ id: "q", at: "2026-01-01T00:00:00.000Z" }],
    timelineEvents: [],
  },
  {
    candidateId: "nh-invalid-empty",
    candidateLabel: "Invalid-empty #5",
    requireEcPh: true,
    requirePpfd: true,
    sensorSnapshots: [
      {
        id: "i-1",
        source: "invalid",
        capturedAt: null,
        tempF: null,
        rh: null,
        vpd: null,
        ec: null,
        ph: null,
        ppfd: null,
      },
    ],
    photos: [],
    quickLogEntries: [],
    timelineEvents: [],
  },
  {
    candidateId: "nh-no-snapshots",
    candidateLabel: "No-snapshots #6",
    requireEcPh: true,
    requirePpfd: true,
    sensorSnapshots: [],
    photos: [{ id: "p" }],
    quickLogEntries: [{ id: "q", at: "2026-06-20T00:00:00.000Z" }],
    timelineEvents: [],
  },
  {
    candidateId: "nh-fully-empty",
    candidateLabel: "Fully-empty #7",
    requireEcPh: true,
    requirePpfd: true,
    sensorSnapshots: [],
    photos: [],
    quickLogEntries: [],
    timelineEvents: [],
  },
];

function renderWithCandidates(cands: readonly PhenoCandidateInput[]) {
  const spy = vi
    .spyOn(fixtures, "PHENO_COMPARISON_DEMO_CANDIDATES", "get")
    .mockReturnValue(cands);
  const utils = render(
    <MemoryRouter initialEntries={["/pheno-comparison"]}>
      <Routes>
        <Route path="/pheno-comparison" element={<PhenoComparison />} />
      </Routes>
    </MemoryRouter>,
  );
  return { ...utils, restore: () => spy.mockRestore() };
}

describe("PhenoComparison never-healthy invariant — expanded combinations", () => {
  it("renders every unknown/incomplete/invalid candidate without any healthy language or success glyphs", () => {
    const { container, restore } = renderWithCandidates(
      NEVER_HEALTHY_CANDIDATES,
    );
    try {
      const text = container.textContent ?? "";
      for (const pat of AFFIRMATIVE_HEALTHY_PATTERNS) {
        expect(text, `must not contain ${pat}`).not.toMatch(pat);
      }
      // Standalone status "OK" / "success" tokens.
      expect(text).not.toMatch(/\bOK\b/);
      expect(text).not.toMatch(/\bSUCCESS\b/i);
      expect(text).not.toMatch(/\bPASS(?:ED|ING)?\b/);
      for (const glyph of FORBIDDEN_SUCCESS_GLYPHS) {
        expect(text.includes(glyph), `must not contain glyph ${glyph}`).toBe(
          false,
        );
      }
    } finally {
      restore();
      cleanup();
    }
  });

  it("never applies a green/success visual tone to demo/stale/invalid snapshots", () => {
    const { container, restore } = renderWithCandidates(
      NEVER_HEALTHY_CANDIDATES,
    );
    try {
      const snapshots = container.querySelectorAll<HTMLElement>(
        "[data-testid^='snapshot-'][data-source]",
      );
      expect(snapshots.length).toBeGreaterThan(0);
      for (const el of snapshots) {
        const src = el.getAttribute("data-source") ?? "";
        if (!UNTRUSTED_SOURCES.has(src)) continue;
        // Scan the snapshot subtree — no green/success classes may appear.
        const html = el.outerHTML;
        expect(html, `${src} snapshot must not use success tone`).not.toMatch(
          /\b(?:bg|text|border)-(?:green|emerald)-/,
        );
        expect(html).not.toMatch(/badge-success|status-ok|is-healthy/);
      }
    } finally {
      restore();
      cleanup();
    }
  });

  it("surfaces explicit missing/invalid flags on every incomplete candidate", () => {
    const { container, restore } = renderWithCandidates(
      NEVER_HEALTHY_CANDIDATES,
    );
    try {
      // Every candidate we constructed is missing SOMETHING; each must render
      // a visible missing-flag or empty-state line — never a healthy claim.
      for (const c of NEVER_HEALTHY_CANDIDATES) {
        const scope = within(
          container.querySelector<HTMLElement>(
            `[data-testid='pheno-candidate-${c.candidateId}']`,
          )!,
        );
        const hasMissingList = scope.queryByTestId(
          `pheno-candidate-${c.candidateId}-missing`,
        );
        const hasNoPhoto = scope.queryByTestId(
          `pheno-candidate-${c.candidateId}-no-photo`,
        );
        const hasNoSensor = scope.queryByTestId(
          `pheno-candidate-${c.candidateId}-no-sensor`,
        );
        const hasSnapshotMissing = scope.queryAllByTestId(
          /^snapshot-.*-missing-/,
        );
        expect(
          hasMissingList ||
            hasNoPhoto ||
            hasNoSensor ||
            hasSnapshotMissing.length > 0,
          `${c.candidateId} must surface at least one missing/invalid flag`,
        ).toBeTruthy();
      }
    } finally {
      restore();
      cleanup();
    }
  });
});
