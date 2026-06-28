/**
 * Post-Grow Report Print/Export Regression v1
 *
 * Locks in the printable HTML contract so future copy-only or presenter
 * edits cannot regress:
 *  - section labels (What changed / What was logged / Alerts reviewed /
 *    Actions reviewed / What to repeat next run / What to avoid next run)
 *  - grower-approved action-safety copy
 *  - source-honesty "missing data treated as missing, not healthy" copy
 *  - absence of raw payloads, secrets, fake-download or device-control claims
 *  - no "healthy" near stale/invalid/demo/unknown/csv
 */
import { describe, it, expect } from "vitest";

import {
  buildPostGrowReportPrintHtml,
  PRINT_DATA_SOURCE_NOTE,
  PRINT_SAFETY_NOTE,
  PRINT_SECTION_LABELS,
} from "@/lib/postGrowReportPrintRules";
import type { PostGrowLearningReportViewModel } from "@/lib/postGrowLearningReportRules";

function makeVm(
  over: Partial<PostGrowLearningReportViewModel> = {},
): PostGrowLearningReportViewModel {
  return {
    eligible: true,
    ineligibleReason: null,
    header: {
      growId: "g1",
      growName: "Test Grow",
      stageLabel: "Drying / Curing",
      archived: true,
      startedAt: "2026-01-01T00:00:00.000Z",
      harvestedAt: "2026-04-01T00:00:00.000Z",
      yieldGrams: 120,
    },
    executiveSummary: ["VPD held in band 78% of the run."],
    dataCompleteness: { score: 60, label: "Useful", present: [], missing: [] },
    environment: [
      { key: "temperature_c", label: "Temperature", unit: "°C", count: 10, avg: 24, min: 22, max: 26, stablePct: 80, sparkline: [] },
      { key: "humidity_pct", label: "Humidity", unit: "%", count: 9, avg: 55, min: 50, max: 60, stablePct: 70, sparkline: [] },
      { key: "vpd_kpa", label: "VPD", unit: "kPa", count: 0, avg: null, min: null, max: null, stablePct: null, sparkline: [] },
    ],
    postHarvest: { yieldGrams: 120, points: [], weightLossPct: null, rhStabilized: null },
    actionEffectiveness: { completedActions: 3, outcomeNotes: 1, observations: ["Topped on day 21"] },
    lesson: { entryId: null, text: "Smaller pots next time" },
    photos: [{ id: "p1", url: "x.jpg", capturedAt: "2026-03-01T00:00:00.000Z", alt: "photo" }],
    ...over,
  };
}

const html = buildPostGrowReportPrintHtml(makeVm(), {
  generatedAt: "2026-04-05T00:00:00.000Z",
});

describe("Post-Grow print HTML — required section labels", () => {
  it.each([
    ["whatChanged", PRINT_SECTION_LABELS.whatChanged],
    ["whatWasLogged", PRINT_SECTION_LABELS.whatWasLogged],
    ["alertsReviewed", PRINT_SECTION_LABELS.alertsReviewed],
    ["actionsReviewed", PRINT_SECTION_LABELS.actionsReviewed],
    ["repeatNextRun", PRINT_SECTION_LABELS.repeatNextRun],
    ["avoidNextRun", PRINT_SECTION_LABELS.avoidNextRun],
  ])("includes the %s label (%s)", (_k, label) => {
    expect(html).toContain(label);
  });

  it("pins the exact label strings (regression fence)", () => {
    expect(PRINT_SECTION_LABELS.whatChanged).toBe("What changed");
    expect(PRINT_SECTION_LABELS.whatWasLogged).toBe("What was logged");
    expect(PRINT_SECTION_LABELS.alertsReviewed).toBe("Alerts reviewed");
    expect(PRINT_SECTION_LABELS.actionsReviewed).toBe("Actions reviewed");
    expect(PRINT_SECTION_LABELS.repeatNextRun).toBe("What to repeat next run");
    expect(PRINT_SECTION_LABELS.avoidNextRun).toBe("What to avoid next run");
  });
});

describe("Post-Grow print HTML — safety & source-honesty copy", () => {
  it("includes the grower-approved action-safety copy", () => {
    expect(html).toContain("Verdant suggestions remain grower-approved");
    expect(html).toContain("does not include device commands");
    expect(html).toContain(PRINT_SAFETY_NOTE);
  });

  it("includes the source-honesty 'missing data is treated as missing, not healthy' copy", () => {
    expect(html).toContain("Missing data is treated as missing, not healthy");
    expect(html).toContain(PRINT_DATA_SOURCE_NOTE);
  });

  it("renders inside a deterministic data-testid wrapper", () => {
    expect(html).toContain('data-testid="post-grow-print-document"');
    expect(html).toContain('data-testid="post-grow-print-safety-note"');
  });
});

describe("Post-Grow print HTML — forbidden content", () => {
  const FORBIDDEN = [
    "service_role",
    "service-role",
    "sb_secret",
    "supabase_service_role_key",
    "api_token",
    "bearer ",
    "bridge_token",
    "raw_payload",
    "click here to download",
    "downloading your pdf",
    "automatically executed",
    "auto execute",
    "set fan",
    "set light",
    "set irrigation",
    "dose nutrients",
    "send command",
    "fake live",
    "guaranteed",
    "definitely",
    "diagnosed from photo",
  ];

  it("does not leak secrets, raw payloads, or automation/device-control claims", () => {
    const lower = html.toLowerCase();
    for (const term of FORBIDDEN) {
      expect(lower, `forbidden term leaked into print HTML: ${term}`).not.toContain(term);
    }
  });

  it("never uses the standalone phrase 'device command' as a positive capability", () => {
    // Only the negating safety note may mention "device command(s)".
    const lower = html.toLowerCase();
    const occurrences = lower.split("device command").length - 1;
    expect(occurrences).toBeGreaterThan(0); // present in the negating safety note
    // Every occurrence must be inside the negating sentence "does not include device commands".
    const allowed = lower.split("does not include device command").length - 1;
    expect(allowed).toBe(occurrences);
  });

  it("does not describe stale/invalid/demo/unknown/csv telemetry as healthy", () => {
    const lower = html.toLowerCase();
    const nearHealthy = /(csv|imported|stale|invalid|demo|unknown)[^.]{0,40}\bhealthy\b/;
    expect(lower).not.toMatch(nearHealthy);
    // And no positive standalone "healthy" claim either.
    expect(lower).not.toMatch(/\bplants? (are|is) healthy\b/);
    expect(lower).not.toMatch(/\beverything (looks|is) healthy\b/);
  });

  it("missing-section copy stays factual, not 'no issues'", () => {
    const empty = buildPostGrowReportPrintHtml(
      makeVm({ executiveSummary: [], environment: [] }),
      { generatedAt: "2026-04-05T00:00:00.000Z" },
    );
    expect(empty).toContain("Not enough evidence");
    const lower = empty.toLowerCase();
    expect(lower).not.toContain("no issues");
    expect(lower).not.toContain("all good");
    expect(lower).not.toContain("healthy");
  });
});
