/**
 * Post-Grow Learning Report print/PDF export — unit + static safety tests.
 *
 * Covers:
 *  - Pure HTML builder includes all required sections and the safety/notes.
 *  - HTML escaping is applied to user-supplied strings (no raw payload leaks).
 *  - Empty sections show "Not enough evidence" / "No logged data yet" copy.
 *  - openPostGrowReportPrintWindow degrades calmly when popup is blocked.
 *  - The presenter wires the print CTA and exposes the helper copy.
 *  - Static safety: no banned automation/device/secret tokens in new files.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import {
  buildPostGrowReportPrintHtml,
  openPostGrowReportPrintWindow,
  PRINT_HELPER_COPY,
  PRINT_SAFETY_NOTE,
  PRINT_UNAVAILABLE_COPY,
  PRINT_EMPTY_SECTION_COPY,
  PRINT_NO_DATA_COPY,
} from "@/lib/postGrowReportPrintRules";
import { ExportSummaryButtons } from "@/components/PostGrowLearningReportCards";
import type { PostGrowLearningReportViewModel } from "@/lib/postGrowLearningReportRules";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { toast } from "sonner";

const baseVm: PostGrowLearningReportViewModel = {
  eligible: true,
  ineligibleReason: null,
  header: {
    growId: "g1",
    growName: "Northern <Lights>",
    stageLabel: "Drying / Curing",
    archived: true,
    startedAt: "2026-01-01T00:00:00.000Z",
    harvestedAt: "2026-04-01T00:00:00.000Z",
    yieldGrams: 112.5,
  },
  executiveSummary: ["Northern Lights had a useful post-grow record."],
  dataCompleteness: { score: 80, label: "Strong", present: ["Harvest record"], missing: [] },
  environment: [
    { key: "temperature_c", label: "Temperature", unit: "°C", count: 10, avg: 24, min: 22, max: 26, stablePct: 80, sparkline: [] },
    { key: "humidity_pct", label: "Humidity", unit: "%", count: 0, avg: null, min: null, max: null, stablePct: null, sparkline: [] },
    { key: "vpd_kpa", label: "VPD", unit: "kPa", count: 8, avg: 1.1, min: 0.9, max: 1.3, stablePct: 88, sparkline: [] },
  ],
  postHarvest: {
    yieldGrams: 112.5,
    points: [{ label: "Checkpoint 1", capturedAt: "2026-04-02T00:00:00.000Z", weightGrams: 160, rhPct: 64 }],
    weightLossPct: 12.3,
    rhStabilized: true,
  },
  actionEffectiveness: { completedActions: 2, outcomeNotes: 1, observations: ["Two completed actions reviewed."] },
  lesson: { entryId: "d1", text: "Watered less in late flower." },
  photos: [{ id: "p1", url: "x.jpg", capturedAt: "2026-03-01T00:00:00.000Z", alt: "photo" }],
};

const emptyVm: PostGrowLearningReportViewModel = {
  ...baseVm,
  executiveSummary: [],
  dataCompleteness: { score: 0, label: "Thin", present: [], missing: ["Harvest record", "Photos"] },
  environment: baseVm.environment.map((m) => ({ ...m, count: 0, avg: null, min: null, max: null, stablePct: null })),
  postHarvest: { yieldGrams: null, points: [], weightLossPct: null, rhStabilized: null },
  actionEffectiveness: { completedActions: 0, outcomeNotes: 0, observations: [] },
  lesson: { entryId: null, text: "" },
  photos: [],
};

describe("buildPostGrowReportPrintHtml", () => {
  const html = buildPostGrowReportPrintHtml(baseVm, { generatedAt: "2026-04-10T12:00:00.000Z" });

  it("renders required sections", () => {
    for (const heading of [
      "Run summary",
      "Plant highlights",
      "Sensor truth",
      "Post-harvest performance",
      "Alerts &amp; issues",
      "Action Queue summary",
      "Lessons",
    ]) {
      expect(html).toContain(heading);
    }
  });

  it("includes grow name, date range, generated timestamp, read-only and safety notes", () => {
    expect(html).toContain("Northern &lt;Lights&gt;"); // escaped
    expect(html).toContain("2026-01-01 – 2026-04-01");
    expect(html).toContain("Generated 2026-04-10T12:00:00.000Z");
    expect(html).toContain("Read-only report.");
    expect(html).toContain(PRINT_SAFETY_NOTE);
  });

  it("escapes HTML in user-supplied strings", () => {
    expect(html).not.toContain("<Lights>");
  });

  it("renders calm empty-state copy when sections lack evidence", () => {
    const empty = buildPostGrowReportPrintHtml(emptyVm, { generatedAt: "2026-04-10T12:00:00.000Z" });
    expect(empty).toContain(PRINT_EMPTY_SECTION_COPY);
    expect(empty).toContain(PRINT_NO_DATA_COPY);
    // Healthy/issue claims, if present, must always be negated guardrail copy.
    const unsafe = /\b(?<!not treated as )(?<!never )healthy\b|\ball good\b|\bno issues\b/i;
    expect(empty).not.toMatch(unsafe);
  });

  it("never renders raw payloads, secrets, or unsafe device-control claims", () => {
    const probe = buildPostGrowReportPrintHtml(baseVm);
    expect(probe).not.toMatch(/raw_payload|service_role|api_key|bridge_token/i);
    // Allow guardrail copy like "does not include device commands" / "does not auto-execute".
    // Only fail on positive automation claims.
    expect(probe).not.toMatch(/\bwill auto-?execute\b|\bsending device command\b|\bset fan to\b|\bset light to\b|\bset irrigation to\b|\bdose nutrients now\b/i);
  });
});

describe("openPostGrowReportPrintWindow", () => {
  it("returns 'unavailable' when window.open returns null (blocked)", () => {
    const fakeWin = { open: vi.fn(() => null) } as unknown as Window;
    expect(openPostGrowReportPrintWindow(baseVm, fakeWin)).toBe("unavailable");
  });

  it("returns 'unavailable' when no window is provided", () => {
    expect(openPostGrowReportPrintWindow(baseVm, null)).toBe("unavailable");
  });

  it("writes HTML and calls print() when popup opens", () => {
    const writes: string[] = [];
    const popup = {
      document: { write: (s: string) => writes.push(s), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    } as unknown as Window;
    const fakeWin = { open: vi.fn(() => popup) } as unknown as Window;
    expect(openPostGrowReportPrintWindow(baseVm, fakeWin)).toBe("printed");
    expect(writes[0]).toContain("Post-Grow Learning Report");
    expect((popup as unknown as { print: ReturnType<typeof vi.fn> }).print).toHaveBeenCalled();
  });
});

describe("ExportSummaryButtons presenter", () => {
  it("renders the print CTA and the save-as-PDF helper copy", () => {
    cleanup();
    render(<ExportSummaryButtons vm={baseVm} />);
    expect(screen.getByTestId("post-grow-export-print")).toBeTruthy();
    expect(screen.getByTestId("post-grow-export-helper").textContent).toBe(PRINT_HELPER_COPY);
  });

  it("shows the unavailable toast when popup is blocked", () => {
    cleanup();
    (toast.error as ReturnType<typeof vi.fn>).mockClear();
    const originalOpen = window.open;
    (window as unknown as { open: typeof window.open }).open = vi.fn(() => null) as unknown as typeof window.open;
    try {
      render(<ExportSummaryButtons vm={baseVm} />);
      fireEvent.click(screen.getByTestId("post-grow-export-print"));
      expect(toast.error).toHaveBeenCalledWith(PRINT_UNAVAILABLE_COPY);
    } finally {
      (window as unknown as { open: typeof window.open }).open = originalOpen;
    }
  });
});

describe("Post-Grow print export static safety", () => {
  const ROOT = resolve(__dirname, "../..");
  const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
  // Strip JSDoc/line comments so guardrail documentation is not scanned as code.
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const files = [
    "src/lib/postGrowReportPrintRules.ts",
    "src/components/PostGrowLearningReportCards.tsx",
  ];
  const codeCorpus = files.map((p) => stripComments(read(p))).join("\n");

  it("contains no Supabase writes, AI calls, secret tokens, or automation hooks", () => {
    expect(codeCorpus).not.toMatch(/functions\.invoke|\.insert\(|\.update\(|\.delete\(|\bupsert\(/);
    expect(codeCorpus).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE_KEY|bridge_token|raw_payload/i);
    expect(codeCorpus).not.toMatch(/dispatchCommand|device_control|relay\.|actuator/i);
    expect(codeCorpus).not.toMatch(/\b(guaranteed|definitely|diagnosed from photo)\b/i);
  });
});
