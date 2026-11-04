/**
 * Grower bug report 2026-11-03, item 1: a live tent is named
 * `QA-Tent-4x4 <img src=x onerror=alert(1)>`. React text rendering escapes it;
 * the print/PDF export writes HTML through document.write, so its scope badge
 * (grow · tent · plants) must escape tent and plant names too.
 */
import { describe, expect, it } from "vitest";
import { buildGrowDiaryReportHtml, buildGrowDiaryReportModel } from "@/lib/growDiaryPdfExport";

const NOW = new Date("2026-11-03T12:00:00Z");

describe("grow diary export scope badge escaping", () => {
  it("escapes the live tent name and plant names in the scope badge", () => {
    const model = buildGrowDiaryReportModel({
      grow: {
        name: "Skunk Gas Run",
        tentName: "QA-Tent-4x4 <img src=x onerror=alert(1)>",
        plantNames: ["Dolce di Pledge #1", "<svg onload=alert(1)>"],
      },
      counts: { diary: 0 },
      recent: [],
      now: NOW,
    });
    const html = buildGrowDiaryReportHtml(model);

    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<svg/i);
    expect(html).toContain("Tent: QA-Tent-4x4 &lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;svg onload=alert(1)&gt;");
  });
});
