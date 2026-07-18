/**
 * Date-range diary report + Post-Grow Pro gate — static wiring and
 * safety fences.
 *
 * Pins: route + manifest registration, print CSS section, server-gate
 * feature strings (edge fn + client union + docs), the Timeline
 * one-tap entry link, the Post-Grow page gate wiring, and banned
 * vocabulary across the new sources.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string): string => readFileSync(path.resolve(__dirname, "..", rel), "utf8");

const PAGE = read("pages/DiaryRangeReportPage.tsx");
const RULES = read("lib/diaryRangeReportRules.ts");
const NAV = read("lib/diaryRangeReportNavigationRules.ts");
const HOOK = read("hooks/useDiaryRangeReportData.ts");
const APP = read("App.tsx");
const MANIFEST = read("lib/appRouteManifest.ts");
const CSS = read("index.css");
const GATE_HOOK = read("hooks/usePremiumExportServerGate.ts");
const EDGE_FN = readFileSync(
  path.resolve(__dirname, "../../supabase/functions/premium-export-entitlement/index.ts"),
  "utf8",
);
const DOCS = readFileSync(
  path.resolve(__dirname, "../../docs/paid-launch-entitlement-blocker.md"),
  "utf8",
);
const TIMELINE = read("pages/Timeline.tsx");
const POST_GROW = read("pages/PostGrowLearningReport.tsx");

describe("route + manifest registration", () => {
  it("mounts /reports/diary-range in App.tsx with plain path syntax", () => {
    expect(APP).toContain('path="/reports/diary-range"');
    expect(APP).toContain("DiaryRangeReportPage");
  });

  it("registers the manifest entry as auth access", () => {
    expect(MANIFEST).toMatch(/path: "\/reports\/diary-range",\s*access: "auth"/);
  });
});

describe("print wiring", () => {
  it("index.css makes the diary-range print section visible", () => {
    expect(CSS).toContain('[data-print-section="diary-range-report"]');
  });

  it("the page prints in-page with a title swap and prints real photos", () => {
    expect(PAGE).toContain('data-print-section="diary-range-report"');
    expect(PAGE).toContain("window.print()");
    expect(PAGE).toContain("document.title = filename");
    expect(PAGE).toContain("verdant-diary-report-");
    expect(PAGE).toMatch(/<img[\s\S]{0,200}src=\{p\.url\}/);
    expect(PAGE).toContain("Use your browser print dialog to save this report as PDF.");
  });
});

describe("server gate — feature strings in every layer", () => {
  it("edge function allows diary_range_report and post_grow_report", () => {
    expect(EDGE_FN).toContain('"diary_range_report"');
    expect(EDGE_FN).toContain('"post_grow_report"');
    expect(EDGE_FN).toMatch(/advancedExports\s*!==\s*true/);
  });

  it("client union carries both features", () => {
    expect(GATE_HOOK).toContain('"diary_range_report"');
    expect(GATE_HOOK).toContain('"post_grow_report"');
  });

  it("docs record both server-validated features", () => {
    expect(DOCS).toContain("diary_range_report");
    expect(DOCS).toContain("post_grow_report");
  });

  it("the report page calls the gate with the page scope and fails closed", () => {
    expect(PAGE).toMatch(/checkPremiumExportEntitlement\("diary_range_report"/);
    expect(PAGE).toContain('data-testid="diary-range-report-page-locked"');
    expect(PAGE).toContain("data-server-gate-status");
  });
});

describe("Post-Grow report Pro gate (pricing truth)", () => {
  it("the page enforces the post_grow_report server gate with a locked state", () => {
    expect(POST_GROW).toMatch(/checkPremiumExportEntitlement\("post_grow_report"/);
    expect(POST_GROW).toContain('data-testid="post-grow-report-locked"');
    expect(POST_GROW).toContain('data-testid="post-grow-report-paywall"');
    expect(POST_GROW).toMatch(/canUseCapability\(entitlement,\s*"advancedExports"\)/);
  });

  it("keeps verification failures out of the Post-Grow paywall state", () => {
    expect(POST_GROW).toContain('res.state === "verification_failed"');
    expect(POST_GROW).toContain('res.state === "invalid_request"');
    expect(POST_GROW).toContain('data-testid="post-grow-report-entitlement-retry"');
    expect(POST_GROW.indexOf('gateStatus === "error"')).toBeLessThan(
      POST_GROW.indexOf('data-testid="post-grow-report-paywall"'),
    );
  });
});

describe("Timeline one-tap entry", () => {
  it("links to the range report carrying the active grow and filtered range", () => {
    expect(TIMELINE).toContain('data-testid="timeline-range-report-link"');
    expect(TIMELINE).toMatch(/buildDiaryRangeReportUrl\(\{ growId: activeGrowId/);
    expect(TIMELINE).toContain("defaultDiaryRangeReportRange()");
  });
});

describe("safety fences over the new sources", () => {
  const newSources = { PAGE, RULES, NAV, HOOK };

  it("no writes or RPCs anywhere; the data hook is select-only", () => {
    for (const [name, src] of Object.entries(newSources)) {
      expect(src, name).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.rpc\(/);
      expect(src, name).not.toMatch(/service_role|bridge_token/i);
    }
    // Raw lineage is selected only long enough for the shared diagnostic
    // classifier. It is not rendered by the page or navigation helper.
    expect(HOOK).toContain('.select("metric,value,ts,source,raw_payload")');
    expect(RULES).toContain("withoutDiagnosticSensorRows");
    expect(PAGE + NAV).not.toMatch(/raw_payload/i);
    // The page's only invoke path is the premium gate helper import.
    expect(PAGE).not.toMatch(/functions\.invoke/);
    expect(HOOK).not.toMatch(/functions\.invoke/);
  });

  it("pure modules stay pure", () => {
    for (const src of [RULES, NAV]) {
      expect(src).not.toMatch(/from ["'][^"']*supabase/i);
      expect(src).not.toMatch(/from ["']react["']/);
      expect(src).not.toMatch(/\bdocument\.|\bwindow\.|fetch\(/);
    }
  });

  it("banned vocabulary never appears", () => {
    for (const [name, src] of Object.entries(newSources)) {
      expect(src, name).not.toMatch(
        /\b(guaranteed|definitely|healthy|urgent|autopilot|dispatchCommand|relay|actuator|mqtt)\b/i,
      );
      expect(src, name).not.toMatch(/\bset (fan|light|irrigation)\b/i);
      expect(src, name).not.toMatch(/\bdose nutrients\b/i);
    }
    // 'device command' appears only inside the negation.
    const negations = RULES.match(/device command/g) ?? [];
    const negated = RULES.match(/does not include device commands/g) ?? [];
    expect(negations.length).toBe(negated.length);
  });

  it("classification is delegated, never redefined", () => {
    expect(RULES).toMatch(/from "@\/lib\/timelineEntryClassification"/);
    expect(RULES).toMatch(/normalizeReportSensorSource/);
  });

  it("the safety footer sentences are pinned in the page", () => {
    expect(PAGE).toContain("DIARY_RANGE_SAFETY_COPY");
    expect(PAGE).toContain("DIARY_RANGE_SOURCE_HONESTY_COPY");
    expect(RULES).toContain(
      "Verdant suggestions remain grower-approved. This report does not include device commands.",
    );
  });
});
