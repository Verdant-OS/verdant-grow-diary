import { describe, expect, it } from "vitest";
import {
  buildGrowDiaryReportHtml,
  buildGrowDiaryReportModel,
  type BuildGrowDiaryReportInput,
} from "@/lib/growDiaryPdfExport";
import { getGrowDiaryPdfReadiness } from "@/lib/growDiaryPdfReadinessRules";
import type { RecentItem } from "@/lib/growStatus";

const event: RecentItem = {
  id: "fixture-entry",
  kind: "diary",
  ts: "2026-10-28T12:00:00Z",
  title: "Watered fixture plant",
  detail: null,
};
const base: BuildGrowDiaryReportInput = {
  grow: { name: "QA fixture" },
  counts: { diary: 66 },
  recent: [event],
  now: new Date("2026-10-29T00:00:00Z"),
};

describe("#2235 required Grow PDF data", () => {
  it.each([0, 66, "unavailable"] as const)("waits during activity loading with diary=%s", (diary) => {
    expect(getGrowDiaryPdfReadiness(diary, { status: "loading" })).toBe("loading");
  });

  it.each([0, 66, "unavailable"] as const)("rejects failed activity with diary=%s", (diary) => {
    expect(getGrowDiaryPdfReadiness(diary, { status: "unavailable" })).toBe("unavailable");
  });

  it.each(["unavailable", null, undefined, NaN, Infinity, -1, 0.5] as const)(
    "rejects an unusable diary count %s after activity settles",
    (diary) => {
      expect(getGrowDiaryPdfReadiness(diary, { status: "ok", items: [] })).toBe("unavailable");
      const input = { ...base, counts: { diary }, recent: [] } as BuildGrowDiaryReportInput;
      const model = buildGrowDiaryReportModel(input);
      const html = buildGrowDiaryReportHtml(model);
      expect(model.isEmpty).toBe(false);
      expect(model.dataUnavailableNote).toMatch(/couldn't be loaded/i);
      expect(html).not.toContain('data-testid="grow-diary-pdf-empty-state"');
      expect(html).not.toContain("No logged events yet");
      expect(html).toContain('data-testid="grow-diary-pdf-data-unavailable"');
    },
  );

  it.each([null, undefined])("distinguishes missing activity %s from an empty successful read", (recent) => {
    const model = buildGrowDiaryReportModel({ ...base, counts: { diary: 0 }, recent });
    expect(model.isEmpty).toBe(false);
    expect(model.dataUnavailableNote).toBeTruthy();
    expect(buildGrowDiaryReportHtml(model)).not.toContain("No logged events yet");
    expect(getGrowDiaryPdfReadiness(0, { status: "ok", items: recent })).toBe("unavailable");
  });

  it("preserves the 66-entry success, event text and optional unavailable totals", () => {
    expect(getGrowDiaryPdfReadiness(66, { status: "ok", items: [event] })).toBe("ready");
    const model = buildGrowDiaryReportModel({ ...base, counts: { diary: 66, alerts: "unavailable" } });
    expect(model.countsRows[0].value).toBe("66");
    expect(model.events[0].title).toBe(event.title);
    expect(model.isEmpty).toBe(false);
    expect(model.dataUnavailableNote).toBeNull();
    expect(buildGrowDiaryReportHtml(model)).not.toContain("No logged events yet");
  });

  it("keeps a confirmed empty grow's baseline", () => {
    expect(getGrowDiaryPdfReadiness(0, { status: "ok", items: [] })).toBe("ready");
    const input = { ...base, counts: { diary: 0 }, recent: [] };
    const model = buildGrowDiaryReportModel(input);
    expect(model.isEmpty).toBe(true);
    expect(model.dataUnavailableNote).toBeNull();
    const html = buildGrowDiaryReportHtml(model);
    expect(html).toContain('data-testid="grow-diary-pdf-empty-state"');
    expect(html).toContain("No logged events yet");
    expect(buildGrowDiaryReportHtml(buildGrowDiaryReportModel(input))).toBe(html);
  });

  it("does not call a positive count with no included recent events empty", () => {
    const html = buildGrowDiaryReportHtml(buildGrowDiaryReportModel({ ...base, recent: [] }));
    expect(html).not.toContain("No logged events yet");
    expect(html).not.toContain('data-testid="grow-diary-pdf-empty-state"');
    expect(html).toContain("No recent events were included in this export.");
  });

  it("does not call a zero count with supplied activity empty", () => {
    expect(buildGrowDiaryReportModel({ ...base, counts: { diary: 0 } }).isEmpty).toBe(false);
  });
});
