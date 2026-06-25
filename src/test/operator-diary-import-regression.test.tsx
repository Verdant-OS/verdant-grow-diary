/**
 * Operator diary import regression — narrow assertions over the labeled
 * fixture. Verifies that real/manual/imported records flow through the
 * One-Tent Proof Record export rules without being relabeled as "live"
 * or "demo", and that demo-labeled rows never bleed into real-data
 * selections.
 *
 * Pure assertions. No Supabase, no network, no model calls.
 */
import { describe, it, expect } from "vitest";
import {
  OPERATOR_DIARY_DATASET,
  realDiaryEntries,
  demoDiaryEntries,
} from "./fixtures/operatorDiaryDataset";
import {
  ALLOWED_SOURCE_LABELS,
  buildOneTentProofRecord,
} from "@/lib/oneTentProofRecordExportRules";

describe("Operator diary dataset — structural integrity", () => {
  it("declares 1 grow, 1 tent, 2 distinct plants", () => {
    expect(OPERATOR_DIARY_DATASET.grow.id).toBe("grow-op-1");
    expect(OPERATOR_DIARY_DATASET.tent.id).toBe("tent-op-1");
    expect(OPERATOR_DIARY_DATASET.plants).toHaveLength(2);
    const ids = OPERATOR_DIARY_DATASET.plants.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has 3–5 diary entries, at least one sensor snapshot, and a report-relevant event", () => {
    const count = OPERATOR_DIARY_DATASET.diaryEntries.length;
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(5);
    expect(OPERATOR_DIARY_DATASET.sensorReadings.length).toBeGreaterThanOrEqual(1);
    expect(OPERATOR_DIARY_DATASET.reportEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("every diary entry references a real plant id in the fixture", () => {
    const plantIds = new Set(OPERATOR_DIARY_DATASET.plants.map((p) => p.id));
    for (const e of OPERATOR_DIARY_DATASET.diaryEntries) {
      expect(plantIds.has(e.plantId)).toBe(true);
    }
  });

  it("every source label is from the canonical ALLOWED_SOURCE_LABELS set", () => {
    const allowed = new Set<string>(ALLOWED_SOURCE_LABELS);
    for (const e of OPERATOR_DIARY_DATASET.diaryEntries) {
      expect(allowed.has(e.sourceLabel)).toBe(true);
    }
    for (const r of OPERATOR_DIARY_DATASET.sensorReadings) {
      expect(allowed.has(r.sourceLabel)).toBe(true);
    }
  });
});

describe("Operator diary dataset — demo vs real label separation", () => {
  it("real selector excludes demo-labeled rows", () => {
    const real = realDiaryEntries();
    for (const e of real) expect(e.sourceLabel).not.toBe("demo");
  });

  it("demo selector returns only demo-labeled rows", () => {
    const demo = demoDiaryEntries();
    expect(demo.length).toBeGreaterThan(0);
    for (const e of demo) expect(e.sourceLabel).toBe("demo");
  });

  it("real + demo partition the entire dataset (no missing/duplicated rows)", () => {
    const total = OPERATOR_DIARY_DATASET.diaryEntries.length;
    expect(realDiaryEntries().length + demoDiaryEntries().length).toBe(total);
  });

  it("manual / csv / imported entries are never silently relabeled 'live' or 'demo'", () => {
    for (const e of realDiaryEntries()) {
      expect(e.sourceLabel).not.toBe("live");
      expect(e.sourceLabel).not.toBe("demo");
    }
  });
});

describe("Operator diary → Proof Record export preserves labels", () => {
  it("preserves a manual sensor reading's sourceLabel verbatim", () => {
    const snap = OPERATOR_DIARY_DATASET.sensorReadings[0];
    const record = buildOneTentProofRecord({
      reading: {
        metric: snap.metric,
        value: snap.value,
        unit: snap.unit,
        capturedAt: snap.capturedAt,
        sourceLabel: snap.sourceLabel,
      },
    });
    expect(record.reading.sourceLabel).toBe("manual");
    expect(record.reading.sourceLabel).not.toBe("live");
    expect(record.reading.sourceLabel).not.toBe("demo");
  });

  it("never upgrades an imported (csv) reading to 'live'", () => {
    const record = buildOneTentProofRecord({
      reading: {
        metric: "temperature_c",
        value: 24.5,
        unit: "C",
        capturedAt: "2026-06-04T10:00:00.000Z",
        sourceLabel: "csv",
      },
    });
    expect(record.reading.sourceLabel).toBe("csv");
  });

  it("record is self-identified as unverified operator self-report", () => {
    const record = buildOneTentProofRecord({});
    expect(record.reviewOnly).toBe(true);
    expect(record.integrity.unverified).toBe(true);
  });
});
