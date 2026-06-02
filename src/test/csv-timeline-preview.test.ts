/**
 * csvTimelinePreview — pure helper tests.
 */
import { describe, it, expect } from "vitest";

import {
  buildCsvTimelinePreview,
  TIMELINE_PREVIEW_SOURCE_LABEL,
  TIMELINE_PREVIEW_MAX_LIMIT,
} from "@/lib/csvTimelinePreview";
import {
  defaultMappingFromHeaders,
  previewRepresentativeCsv,
  REPRESENTATIVE_CSV_DATA_CONTEXT,
  REPRESENTATIVE_CSV_SOURCE,
  type RepresentativeDraftReading,
} from "@/lib/representativeCsvSensorPreviewRules";

const HEADER = [
  "Timestamp",
  "Sensor",
  "Room",
  "Zone",
  "Air_Temp_C",
  "Substrate_Temp_C",
  "Humidity_%",
  "VPD_kPa",
  "CO2_ppm",
  "PPFD_umol",
  "Substrate_VWC_%",
  "Substrate_EC_mS/cm",
].join(",");

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

function previewFrom(text: string) {
  const result = previewRepresentativeCsv(text);
  return { rows: result.rows, mapping: result.mapping };
}

const OK_ROW_A =
  "2026-01-01T10:00:00Z,probe-1,Room A,Zone 1,22.5,21.0,55,1.1,900,650,40,2.5";
const OK_ROW_B =
  "2026-01-01T11:00:00Z,probe-1,Room A,Zone 1,23.0,21.2,56,1.2,920,660,41,2.6";
const OK_ROW_C =
  "2026-01-01T09:00:00Z,probe-1,Room A,Zone 1,21.0,20.5,54,1.0,880,640,39,2.4";

describe("buildCsvTimelinePreview — happy path", () => {
  it("creates timeline events from valid mapped rows", () => {
    const { rows, mapping } = previewFrom(csv(OK_ROW_A, OK_ROW_B));
    const out = buildCsvTimelinePreview({ rows, mapping });
    expect(out.events).toHaveLength(2);
    expect(out.reviewRows).toHaveLength(0);
    expect(out.summary).toEqual({
      total: 2,
      timelineReady: 2,
      needsReview: 0,
      previewed: 2,
      hidden: 0,
    });
    for (const ev of out.events) {
      expect(ev.source).toBe(REPRESENTATIVE_CSV_SOURCE);
      expect(ev.data_context).toBe(REPRESENTATIVE_CSV_DATA_CONTEXT);
      expect(ev.source_label).toBe(TIMELINE_PREVIEW_SOURCE_LABEL);
      expect(ev.metrics.length).toBeGreaterThan(0);
      expect(ev.metrics.map((m) => m.field)).toEqual(
        [...ev.metrics.map((m) => m.field)].sort(),
      );
    }
  });

  it("source label never uses live / synced / imported / persisted / connected", () => {
    const { rows, mapping } = previewFrom(csv(OK_ROW_A));
    const out = buildCsvTimelinePreview({ rows, mapping });
    const label = out.events[0].source_label;
    expect(label).toBe("csv / representative sample / not live");
    expect(label).not.toMatch(/\b(?:synced|imported|persisted|connected)\b/i);
    // "live" only appears as part of the explicit negation "not live".
    expect(label).toMatch(/not live/);
    expect(label.replace(/not live/g, "")).not.toMatch(/\blive\b/i);
  });
});

describe("buildCsvTimelinePreview — invalid + review surfacing", () => {
  it("flags rows with invalid/missing timestamps as reviewRows, not events", () => {
    const { rows, mapping } = previewFrom(
      csv(
        OK_ROW_A,
        ",probe-1,Room A,Zone 1,22.5,21.0,55,1.1,900,650,40,2.5", // missing ts
        "2026,probe-1,Room A,Zone 1,22.5,21.0,55,1.1,900,650,40,2.5", // year-only ts
      ),
    );
    const out = buildCsvTimelinePreview({ rows, mapping });
    expect(out.events).toHaveLength(1);
    expect(out.reviewRows).toHaveLength(2);
    for (const r of out.reviewRows) {
      expect(r.severity).toBe("invalid");
      expect(r.reasonCodes.length).toBeGreaterThan(0);
    }
    expect(out.summary.needsReview).toBe(2);
  });

  it("flags rows with non-finite telemetry as invalid review rows", () => {
    const { rows, mapping } = previewFrom(
      csv(
        OK_ROW_A,
        "2026-01-02T10:00:00Z,probe-1,Room A,Zone 1,not-a-number,21.0,55,1.1,900,650,40,2.5",
      ),
    );
    const out = buildCsvTimelinePreview({ rows, mapping });
    expect(out.events).toHaveLength(1);
    expect(out.reviewRows).toHaveLength(1);
    expect(out.reviewRows[0].reasonCodes.join(",")).toMatch(/non_finite|unparseable/);
  });
});

describe("buildCsvTimelinePreview — determinism + sorting", () => {
  it("sorts events by captured_at then by original row index", () => {
    const { rows, mapping } = previewFrom(csv(OK_ROW_A, OK_ROW_B, OK_ROW_C));
    const out = buildCsvTimelinePreview({ rows, mapping });
    const stamps = out.events.map((e) => e.captured_at);
    expect(stamps).toEqual([...stamps].sort());
    // Same input → identical output (deep equal).
    const again = buildCsvTimelinePreview({ rows, mapping });
    expect(again).toEqual(out);
  });

  it("clamps preview limit to [5, 10]", () => {
    const manyRows = Array.from({ length: 20 }, (_, i) => {
      const hh = String(i % 24).padStart(2, "0");
      return `2026-01-01T${hh}:00:00Z,probe-1,Room A,Zone 1,22.5,21.0,55,1.1,900,650,40,2.5`;
    });
    const { rows, mapping } = previewFrom(csv(...manyRows));
    const out = buildCsvTimelinePreview({ rows, mapping, limit: 999 });
    expect(out.limit).toBe(TIMELINE_PREVIEW_MAX_LIMIT);
    expect(out.events.length).toBe(TIMELINE_PREVIEW_MAX_LIMIT);
    expect(out.summary.hidden).toBeGreaterThan(0);

    const small = buildCsvTimelinePreview({ rows, mapping, limit: 1 });
    expect(small.limit).toBe(5);
  });
});

describe("buildCsvTimelinePreview — safe output shape", () => {
  it("does not emit raw_payload, ids, tokens, or secrets in events", () => {
    const { rows, mapping } = previewFrom(csv(OK_ROW_A));
    const out = buildCsvTimelinePreview({ rows, mapping });
    const blob = JSON.stringify(out);
    expect(blob).not.toMatch(/raw_payload/);
    expect(blob).not.toMatch(/user_id/);
    expect(blob).not.toMatch(/grow_id/);
    expect(blob).not.toMatch(/service_role/);
    expect(blob).not.toMatch(/token/i);
    expect(blob).not.toMatch(/secret/i);
    // No event should carry arbitrary keys beyond the documented shape.
    const allowed = new Set([
      "rowIndex",
      "captured_at",
      "source",
      "data_context",
      "source_label",
      "metrics",
      "missingFields",
      "ignoredFields",
      "severity",
      "hintCount",
    ]);
    for (const ev of out.events) {
      for (const k of Object.keys(ev)) {
        expect(allowed.has(k)).toBe(true);
      }
    }
  });

  it("does not mutate input rows", () => {
    const { rows, mapping } = previewFrom(csv(OK_ROW_A, OK_ROW_B));
    const snapshot: RepresentativeDraftReading[] = JSON.parse(JSON.stringify(rows));
    buildCsvTimelinePreview({ rows, mapping });
    expect(rows).toEqual(snapshot);
  });

  it("reports missing fields when a metric is unmapped", () => {
    const { rows } = previewFrom(csv(OK_ROW_A));
    // Drop CO2 mapping after the fact.
    const mapping = defaultMappingFromHeaders([
      "Timestamp",
      "Sensor",
      "Room",
      "Zone",
      "Air_Temp_C",
      "Substrate_Temp_C",
      "Humidity_%",
      "VPD_kPa",
      "PPFD_umol",
      "Substrate_VWC_%",
      "Substrate_EC_mS/cm",
    ]);
    const out = buildCsvTimelinePreview({ rows, mapping });
    expect(out.events[0].missingFields).toContain("co2_ppm");
  });
});
