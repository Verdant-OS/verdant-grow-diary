/**
 * Issue #2014: grow diary PDF must not stamp UTC ISO times, must explain
 * an em dash next to a numeric zero, and must suppress the blank-popup
 * print header (about:blank) without changing the window.open write path.
 */
import { describe, expect, it } from "vitest";
import { buildGrowDiaryReportHtml, buildGrowDiaryReportModel } from "@/lib/growDiaryPdfExport";

const NOW = new Date("2026-07-07T12:00:00Z");

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function zoneLabel(d: Date): string {
  const short = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(d)
    .find((part) => part.type === "timeZoneName")?.value;
  return short && short.trim() ? short : "local";
}

function localStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${zoneLabel(d)}`;
}

describe("grow diary PDF local print chrome (#2014)", () => {
  it("stamps generated time and the date range in local time with a zone label", () => {
    const model = buildGrowDiaryReportModel({
      grow: { name: "QA Test", startedAt: "2026-06-01T00:00:00Z" },
      counts: { diary: 0, alerts: 0 },
      recent: [
        { id: "r1", kind: "diary", ts: "2026-07-06T10:00:00Z", title: "Note", detail: null },
      ],
      now: NOW,
    });
    expect(model.generatedAtLabel).toBe(localStamp(NOW));
    expect(model.generatedAtLabel).not.toBe(NOW.toISOString());
    expect(model.dateRangeLabel).toContain(localStamp(NOW).slice(0, 10));
    expect(model.dateRangeLabel).toContain(zoneLabel(NOW));
    expect(model.events[0]?.when).toBe(localStamp(new Date("2026-07-06T10:00:00Z")));
  });

  it("explains an em dash and hides the about:blank print header", () => {
    const model = buildGrowDiaryReportModel({
      grow: { name: "QA Test" },
      counts: { diary: 0, alerts: 0 },
      recent: [],
      now: NOW,
    });
    const html = buildGrowDiaryReportHtml(model);
    expect(html).toContain("— = not included in this export");
    expect(html).toContain("@page{margin:0}");
    expect(html).not.toContain("@media print{body{padding:0}");
    expect(html).toContain("Grow Diary Summary — QA Test");
  });
});
