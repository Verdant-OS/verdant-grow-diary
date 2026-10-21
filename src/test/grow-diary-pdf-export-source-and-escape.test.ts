/**
 * Grow diary PDF export — source-label safety and print-document escaping.
 *
 * The model must not present blank or unrecognized telemetry as healthy,
 * and grower-controlled text must be escaped before it is written into HTML.
 */
import { describe, expect, it } from "vitest";
import { buildGrowDiaryReportHtml, buildGrowDiaryReportModel } from "@/lib/growDiaryPdfExport";

const NOW = new Date("2026-07-07T12:00:00Z");

describe("grow diary PDF source labels and escaping", () => {
  it("folds source labels and never marks blank or unrecognized telemetry healthy", () => {
    const model = buildGrowDiaryReportModel({
      grow: { name: "G" },
      counts: { diary: 1, watering: "unavailable" },
      recent: [
        {
          id: "r-bad-time",
          kind: "diary",
          ts: "not-a-date",
          title: "note",
          detail: null,
        },
      ],
      sensorSources: [
        { source: " LIVE ", count: 2.9 },
        { source: "  ", count: 4 },
        { source: "bridge", count: 1 },
        { source: "stale", count: -3 },
      ],
      now: NOW,
    });

    expect(model.sensorSources).toEqual([
      {
        label: "live",
        count: 2,
        healthy: true,
        note: "Source label preserved from ingest.",
        provenance: null,
      },
      {
        label: "invalid",
        count: 4,
        healthy: false,
        note: "Flagged — not treated as current healthy data.",
        provenance: null,
      },
      // #2119: a bridge transport token is provenance, never a Source label.
      // Without a canonical trust label it is invalid and stays not healthy.
      {
        label: "invalid",
        count: 1,
        healthy: false,
        note: "Flagged — not treated as current healthy data.",
        provenance: "Bridge",
      },
      {
        label: "stale",
        count: 0,
        healthy: false,
        note: "Flagged — not treated as current healthy data.",
        provenance: null,
      },
    ]);
    const canonicalLabels = ["live", "manual", "csv", "demo", "stale", "invalid"];
    for (const row of model.sensorSources) {
      expect(canonicalLabels).toContain(row.label);
    }
    const html = buildGrowDiaryReportHtml(model);
    expect(html).not.toMatch(/<span class="badge [a-z]+">bridge<\/span>/i);
    expect(html).toContain("via Bridge");
    expect(model.events[0]?.when).toBe("not-a-date");
    expect(model.countsRows.find((row) => row.label === "Waterings")?.value).toBe("unavailable");
  });

  it("escapes grower-controlled text before it is written into the print document", () => {
    const model = buildGrowDiaryReportModel({
      grow: { name: "QA <script>alert(1)</script>" },
      counts: { diary: 1 },
      recent: [
        {
          id: "r-markup",
          kind: "diary",
          ts: "2026-07-06T10:00:00Z",
          title: "<img src=x onerror=alert(1)>",
          detail: `5' & 6"`,
        },
      ],
      chartHints: [{ label: "<b>freq</b>", summary: "a<b>b" }],
      now: NOW,
    });
    const html = buildGrowDiaryReportHtml(model);

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<b>/i);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("5&#39; &amp; 6&quot;");
    expect(html).toContain("&lt;b&gt;freq&lt;/b&gt;");
    expect(html).toContain("a&lt;b&gt;b");
  });
});
