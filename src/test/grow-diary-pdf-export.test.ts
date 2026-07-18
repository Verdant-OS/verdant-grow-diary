/**
 * Grow diary PDF export — pure builder tests.
 *
 * Verifies the report model + HTML render preserve source labels,
 * flag stale/invalid/demo readings, omit raw payloads/internal IDs,
 * and produce a useful empty-state report.
 */
import { describe, it, expect, vi } from "vitest";
import {
  buildGrowDiaryReportModel,
  buildGrowDiaryReportHtml,
  buildGrowDiaryReportFilename,
  exportGrowDiaryReportAsPdf,
} from "@/lib/growDiaryPdfExport";
import type { RecentItem } from "@/lib/growStatus";

const NOW = new Date("2026-07-07T12:00:00Z");

const recent: RecentItem[] = [
  {
    id: "r1",
    kind: "diary",
    ts: "2026-07-06T10:00:00Z",
    title: "Watered plants",
    detail: "500ml pH 6.2",
  },
  {
    id: "r2",
    kind: "alert_event",
    ts: "2026-07-05T18:00:00Z",
    title: "VPD high",
    detail: null,
  },
];

describe("growDiaryPdfExport — model", () => {
  it("includes grow, tent, plant context and date range", () => {
    const m = buildGrowDiaryReportModel({
      grow: {
        name: "OG Kush Run 3",
        tentName: "Tent A",
        plantNames: ["Plant #1", "Plant #2"],
        startedAt: "2026-06-01T00:00:00Z",
      },
      counts: { diary: 12, watering: 5, feeding: 2, photo: 6, sensorSnapshots: 20, alerts: 1 },
      recent,
      now: NOW,
    });
    expect(m.scopeLabel).toContain("OG Kush Run 3");
    expect(m.scopeLabel).toContain("Tent A");
    expect(m.scopeLabel).toContain("Plant #1");
    expect(m.dateRangeLabel).toContain("2026-07-07");
    expect(m.countsRows.find((r) => r.label === "Diary entries")?.value).toBe("12");
    expect(m.events).toHaveLength(2);
    expect(m.events[0].title).toBe("Watered plants");
    expect(m.isEmpty).toBe(false);
  });

  it("preserves sensor source labels and flags stale/invalid/demo", () => {
    const m = buildGrowDiaryReportModel({
      grow: { name: "G" },
      counts: { diary: 1 },
      recent: [],
      sensorSources: [
        { source: "live", count: 5 },
        { source: "stale", count: 2 },
        { source: "invalid", count: 1 },
        { source: "demo", count: 3 },
      ],
      now: NOW,
    });
    const bySrc = Object.fromEntries(m.sensorSources.map((s) => [s.label, s]));
    expect(bySrc["connected sensor (unverified)"].healthy).toBe(false);
    expect(bySrc.stale.healthy).toBe(false);
    expect(bySrc.invalid.healthy).toBe(false);
    expect(bySrc.demo.healthy).toBe(false);
    expect(bySrc.stale.note).toMatch(/not treated as current/i);
  });

  it("falls back to explicit unavailable note when no charts provided", () => {
    const m = buildGrowDiaryReportModel({
      grow: { name: "G" },
      counts: { diary: 0 },
      recent: [],
      now: NOW,
    });
    expect(m.charts).toHaveLength(0);
    expect(m.chartsUnavailableNote).toBeTruthy();
    expect(m.isEmpty).toBe(true);
  });

  it("uses chart hints when provided (no invented data)", () => {
    const m = buildGrowDiaryReportModel({
      grow: { name: "G" },
      counts: { diary: 1 },
      recent: [],
      chartHints: [{ label: "Log frequency", summary: "12 entries over 7 days" }],
      now: NOW,
    });
    expect(m.charts).toEqual([{ label: "Log frequency", summary: "12 entries over 7 days" }]);
    expect(m.chartsUnavailableNote).toBeNull();
  });

  it("builds a deterministic filename", () => {
    expect(buildGrowDiaryReportFilename("OG Kush Run 3", NOW)).toBe(
      "verdant-grow-diary-og-kush-run-3-2026-07-07.pdf",
    );
  });
});

describe("growDiaryPdfExport — HTML", () => {
  it("renders empty-state banner when there are no logs", () => {
    const m = buildGrowDiaryReportModel({
      grow: { name: "Empty" },
      counts: { diary: 0 },
      recent: [],
      now: NOW,
    });
    const html = buildGrowDiaryReportHtml(m);
    expect(html).toContain('data-testid="grow-diary-pdf-empty-state"');
    expect(html).toContain('data-testid="grow-diary-pdf-empty-events"');
    expect(html).toContain("Read-only report");
  });

  it("renders a clear Charts unavailable section when chart data cannot be embedded", () => {
    const m = buildGrowDiaryReportModel({
      grow: { name: "G" },
      counts: { diary: 2 },
      recent,
      chartsUnavailableReason: "Chart data could not be embedded from this view.",
      now: NOW,
    });
    const html = buildGrowDiaryReportHtml(m);
    expect(html).toContain('data-testid="grow-diary-pdf-charts-unavailable-section"');
    expect(html).toContain("Charts unavailable");
    expect(html).toContain("Chart data could not be embedded from this view.");
    expect(html).toContain("Nothing was inferred or redrawn");
    expect(html).toContain("Summary totals");
  });

  it("includes safety footer and does not leak raw payload / token / secret markers", () => {
    const m = buildGrowDiaryReportModel({
      grow: { name: "G" },
      counts: { diary: 1 },
      recent: [
        {
          id: "internal-uuid-should-not-render",
          kind: "diary",
          ts: "2026-07-06T00:00:00Z",
          title: "note",
          detail: null,
        },
      ],
      sensorSources: [{ source: "live", count: 1 }],
      now: NOW,
    });
    const html = buildGrowDiaryReportHtml(m);
    expect(html).toContain('data-testid="grow-diary-pdf-safety-note"');
    expect(html).not.toContain("internal-uuid-should-not-render");
    expect(html).not.toMatch(/raw_payload|bridge_token|service_role|api_key/i);
  });
});

describe("exportGrowDiaryReportAsPdf", () => {
  it("returns 'unavailable' when window.open is missing", () => {
    const r = exportGrowDiaryReportAsPdf(
      { grow: { name: "G" }, counts: { diary: 0 }, recent: [] },
      { win: null },
    );
    expect(r).toBe("unavailable");
  });

  it("writes HTML into popup and calls print exactly once", () => {
    const doc = { write: vi.fn(), close: vi.fn(), title: "" };
    const popup = { document: doc, focus: vi.fn(), print: vi.fn() };
    const fakeWin = { open: vi.fn(() => popup) } as unknown as Window;
    const r = exportGrowDiaryReportAsPdf(
      { grow: { name: "G" }, counts: { diary: 1 }, recent: [] },
      { win: fakeWin },
    );
    expect(r).toBe("printed");
    expect(doc.write).toHaveBeenCalledTimes(1);
    expect(popup.print).toHaveBeenCalledTimes(1);
    expect(doc.write.mock.calls[0][0]).toContain("Grow Diary Summary — G");
  });
});
