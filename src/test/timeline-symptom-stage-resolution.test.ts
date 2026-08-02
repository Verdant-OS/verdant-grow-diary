import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stageLabel } from "@/lib/grow";
import {
  buildGrowDiaryTimeline,
  resolveTimelineDiaryEntryStage,
} from "@/lib/growDiaryTimelineRules";

const ROOT = process.cwd();
const TIMELINE_SOURCE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const TIMELINE_MEMORY_SOURCE = readFileSync(
  resolve(ROOT, "src/hooks/useTimelineMemory.ts"),
  "utf8",
);

function symptomRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "symptom-1",
    grow_id: "grow-1",
    plant_id: "plant-1",
    tent_id: "tent-1",
    stage: null,
    entry_at: "2026-08-01T12:00:00.000Z",
    entry_type: "observation",
    note: "Guided symptom observation",
    details: {
      event_type: "observation",
      subtype: "issue",
      observedSign: "discoloration",
      observation_stage: "flower",
    },
    ...overrides,
  };
}

describe("guided Symptom Check timeline stage resolution", () => {
  it("displays and filters a guided Flowering observation from its canonical details stage", () => {
    const row = symptomRow({
      details: {
        event_type: "observation",
        subtype: "issue",
        observedSign: "discoloration",
        observation_stage: "Flowering",
      },
    });

    expect(resolveTimelineDiaryEntryStage(row)).toBe("flower");
    const [item] = buildGrowDiaryTimeline({ rawEntries: [row] });
    expect(item.stage).toBe("flower");
    expect(stageLabel(item.stage)).toBe("Flowering");

    expect(
      buildGrowDiaryTimeline({ rawEntries: [row], filter: { stage: "flower" } }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["symptom-1"]);
    expect(
      buildGrowDiaryTimeline({ rawEntries: [row], filter: { stage: "Flowering" } }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["symptom-1"]);
  });

  it("keeps a valid top-level diary stage authoritative over guided fallback details", () => {
    const row = symptomRow({ stage: "Vegetative" });

    expect(resolveTimelineDiaryEntryStage(row)).toBe("veg");
    const [item] = buildGrowDiaryTimeline({ rawEntries: [row] });
    expect(item.stage).toBe("veg");
    expect(stageLabel(item.stage)).toBe("Vegetative");
    expect(buildGrowDiaryTimeline({ rawEntries: [row], filter: { stage: "flower" } })).toEqual([]);
  });

  it("normalizes the existing cure alias and rejects missing or invalid stage evidence", () => {
    const cure = symptomRow({
      id: "symptom-cure",
      details: {
        event_type: "observation",
        subtype: "issue",
        observedSign: "spots",
        observation_stage: "cure",
      },
    });
    const flush = symptomRow({
      id: "symptom-flush",
      details: {
        event_type: "observation",
        subtype: "issue",
        observedSign: "discoloration",
        observation_stage: "Flushing",
      },
    });
    const invalid = symptomRow({
      id: "symptom-invalid",
      details: {
        event_type: "observation",
        subtype: "issue",
        observedSign: "crispy_edges",
        observation_stage: "bloom-ish",
      },
    });
    const missing = symptomRow({
      id: "symptom-missing",
      details: {
        event_type: "observation",
        subtype: "issue",
        observedSign: "crispy_edges",
      },
    });
    const genericObservation = symptomRow({
      id: "generic-observation",
      details: {
        event_type: "observation",
        subtype: "note",
        observedSign: "discoloration",
        observation_stage: "flower",
      },
    });
    const unsupportedSign = symptomRow({
      id: "unsupported-sign",
      details: {
        event_type: "observation",
        subtype: "issue",
        observedSign: "purple_sparkles",
        observation_stage: "flower",
      },
    });

    const items = buildGrowDiaryTimeline({
      rawEntries: [cure, flush, invalid, missing, genericObservation, unsupportedSign],
    });
    expect(resolveTimelineDiaryEntryStage(cure)).toBe("drying");
    expect(resolveTimelineDiaryEntryStage(flush)).toBe("flush");
    expect(resolveTimelineDiaryEntryStage(invalid)).toBeNull();
    expect(resolveTimelineDiaryEntryStage(missing)).toBeNull();
    expect(resolveTimelineDiaryEntryStage(genericObservation)).toBeNull();
    expect(resolveTimelineDiaryEntryStage(unsupportedSign)).toBeNull();
    expect(items.find((item) => item.id === "symptom-cure")?.stage).toBe("drying");
    expect(items.find((item) => item.id === "symptom-flush")?.stage).toBe("flush");
    expect(items.find((item) => item.id === "symptom-invalid")?.stage).toBeNull();
    expect(items.find((item) => item.id === "symptom-missing")?.stage).toBeNull();
    expect(items.find((item) => item.id === "generic-observation")?.stage).toBeNull();
    expect(items.find((item) => item.id === "unsupported-sign")?.stage).toBeNull();
    expect(
      buildGrowDiaryTimeline({
        rawEntries: [cure, flush, invalid, missing, genericObservation, unsupportedSign],
        filter: { stage: "Drying / Curing" },
      }).map((item) => item.id),
    ).toEqual(["symptom-cure"]);
  });

  it("wires the same resolver into Timeline counts, filtering, grouping, and display", () => {
    expect(TIMELINE_SOURCE).toContain("resolveTimelineDiaryEntryStage");
    expect(
      TIMELINE_SOURCE.match(/resolveTimelineDiaryEntryStage\(e\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(7);
    expect(TIMELINE_SOURCE).not.toContain("normalizeQuickLogStage(e.stage)");
    expect(TIMELINE_SOURCE).not.toContain('const key = e.stage || "unknown"');
    expect(TIMELINE_SOURCE).not.toContain("stageLabel(e.stage)");
  });

  it("uses the guided fallback on the plant and tent Timeline memory surface", () => {
    expect(TIMELINE_MEMORY_SOURCE).toContain("resolveTimelineDiaryEntryStage");
    expect(TIMELINE_MEMORY_SOURCE).toContain("stage: detailsRecord.stage");
    expect(TIMELINE_MEMORY_SOURCE).not.toContain(
      "const v = (details as { stage?: unknown }).stage",
    );
  });
});
