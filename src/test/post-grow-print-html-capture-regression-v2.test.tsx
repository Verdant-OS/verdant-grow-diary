/**
 * Post-Grow Print HTML Capture Regression v2
 *
 * Renders the real ExportSummaryButtons, intercepts window.open, clicks the
 * actual "Print / Save PDF" CTA, captures the HTML the print window was
 * given, and asserts the contract:
 *  - all required section labels present
 *  - grower-approved action-safety copy present
 *  - source-honesty copy present
 *  - no raw payload / service-role / api-token / bridge-token leaks
 *  - no fake-download phrasing
 *  - no automation / device-control claims outside approved negation
 *  - no "healthy" near csv/stale/invalid/demo/unknown
 *
 * Component-level intercept (no Playwright, no real PDF).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { ExportSummaryButtons } from "@/components/PostGrowLearningReportCards";
import type { PostGrowLearningReportViewModel } from "@/lib/postGrowLearningReportRules";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const VM: PostGrowLearningReportViewModel = {
  eligible: true,
  sensorReadingSources: [{ source: "manual" }],
  ineligibleReason: null,
  header: {
    growId: "g-print-cap",
    growName: "Capture Run",
    stageLabel: "Drying / Curing",
    archived: true,
    startedAt: "2026-02-01T00:00:00.000Z",
    harvestedAt: "2026-05-01T00:00:00.000Z",
    yieldGrams: 90,
  },
  executiveSummary: ["VPD held in band 80% of the run."],
  dataCompleteness: {
    score: 70,
    label: "Useful",
    present: ["Harvest record"],
    missing: [],
  },
  environment: [
    {
      key: "temperature_c",
      label: "Temperature",
      unit: "°C",
      count: 5,
      avg: 24,
      min: 22,
      max: 26,
      stablePct: 80,
      sparkline: [],
    },
  ],
  postHarvest: {
    yieldGrams: 90,
    points: [],
    weightLossPct: null,
    rhStabilized: null,
  },
  actionEffectiveness: {
    completedActions: 1,
    outcomeNotes: 0,
    observations: [],
  },
  lesson: { entryId: null, text: "" },
  photos: [],
};

interface CapturedPopup {
  html: string;
  printed: boolean;
  closed: boolean;
}

function installPopupCapture(): CapturedPopup {
  const captured: CapturedPopup = { html: "", printed: false, closed: false };
  const fakeDoc = {
    open: vi.fn(),
    write: vi.fn((html: string) => {
      captured.html += html;
    }),
    close: vi.fn(),
  };
  const fakePopup = {
    document: fakeDoc,
    focus: vi.fn(),
    print: vi.fn(() => {
      captured.printed = true;
    }),
    close: vi.fn(() => {
      captured.closed = true;
    }),
  } as unknown as Window;
  vi.spyOn(window, "open").mockImplementation(() => fakePopup);
  return captured;
}

describe("Post-Grow Print HTML Capture v2 — via real CTA click", () => {
  let captured: CapturedPopup;

  beforeEach(() => {
    captured = installPopupCapture();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("clicks the real Print / Save PDF button and captures HTML", () => {
    render(<ExportSummaryButtons vm={VM} />);
    fireEvent.click(screen.getByTestId("post-grow-export-print"));
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(captured.html.length).toBeGreaterThan(0);
    expect(captured.printed).toBe(true);
  });

  it.each([
    "What changed",
    "What was logged",
    "Alerts reviewed",
    "Actions reviewed",
    "What to repeat next run",
    "What to avoid next run",
    "Verdant suggestions remain grower-approved",
    "does not include device commands",
    "Missing data is treated as missing, not healthy",
  ])("captured HTML contains required copy: %s", (snippet) => {
    render(<ExportSummaryButtons vm={VM} />);
    fireEvent.click(screen.getByTestId("post-grow-export-print"));
    expect(captured.html).toContain(snippet);
  });

  it("captured HTML excludes raw payloads, secrets, and bridge/api tokens", () => {
    render(<ExportSummaryButtons vm={VM} />);
    fireEvent.click(screen.getByTestId("post-grow-export-print"));
    const lower = captured.html.toLowerCase();
    for (const term of [
      "raw_payload",
      "service_role",
      "service-role",
      "supabase_service_role_key",
      "sb_secret",
      "bridge_token",
      "api_token",
      "bearer ",
    ]) {
      expect(lower, `secret leaked: ${term}`).not.toContain(term);
    }
  });

  it("captured HTML excludes fake-download language", () => {
    render(<ExportSummaryButtons vm={VM} />);
    fireEvent.click(screen.getByTestId("post-grow-export-print"));
    const lower = captured.html.toLowerCase();
    for (const term of [
      "click here to download",
      "downloading your pdf",
      "your pdf is ready",
      "download starting",
      "preparing your download",
    ]) {
      expect(lower, `fake-download phrase leaked: ${term}`).not.toContain(term);
    }
  });

  it("captured HTML excludes automation/device-control claims outside approved negation", () => {
    render(<ExportSummaryButtons vm={VM} />);
    fireEvent.click(screen.getByTestId("post-grow-export-print"));
    const lower = captured.html.toLowerCase();
    for (const term of [
      "automatically executed",
      "send command",
      "set fan to",
      "set light to",
      "set irrigation to",
      "dose nutrients now",
      "autopilot",
      "fully automated",
      "ai grows for you",
    ]) {
      expect(lower, `automation phrase leaked: ${term}`).not.toContain(term);
    }
    // "auto execute" / "auto-execute" only allowed inside a negation
    // ("does not auto-execute"). Any other occurrence is a violation.
    const autoExec = /(?<!does not )(?<!not )auto[- ]?execute/g;
    expect(lower.match(autoExec)).toBeNull();
    // "device command" allowed only inside "does not include device commands"
    const total = lower.split("device command").length - 1;
    const allowed = lower.split("does not include device command").length - 1;
    expect(allowed).toBe(total);
    expect(total).toBeGreaterThan(0);
  });

  it("captured HTML never describes csv/stale/invalid/demo/unknown as healthy", () => {
    render(<ExportSummaryButtons vm={VM} />);
    fireEvent.click(screen.getByTestId("post-grow-export-print"));
    const lower = captured.html.toLowerCase();
    const forward = /(csv|stale|invalid|demo|unknown|imported|untrusted)[^.\n]{0,60}\bhealthy\b/;
    const backward = /\bhealthy\b[^.\n]{0,60}(csv|stale|invalid|demo|unknown|imported|untrusted)/;
    expect(lower).not.toMatch(forward);
    expect(lower).not.toMatch(backward);
    // Positive blanket "healthy" claims also banned.
    expect(lower).not.toMatch(/\beverything (is|looks) healthy\b/);
    expect(lower).not.toMatch(/\bplants? (are|is) healthy\b/);
  });
});
