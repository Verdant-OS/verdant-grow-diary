/**
 * phenoCandidateEvidenceEnrichmentRules — pure mapping from canonical
 * diary_entries rows + the Quick Log tent snapshot onto Pheno Comparison
 * evidence inputs. Pins the "Pheno Hunt links to plant memory" contract:
 * live candidates surface their REAL diary entries, photos, and sensor
 * context instead of permanently-empty sections.
 */
import { describe, expect, it } from "vitest";
import {
  mapDiaryRowsToCandidateEvidence,
  tentSnapshotToComparisonInput,
  PHENO_EVIDENCE_ENTRIES_PER_PLANT,
  PHENO_EVIDENCE_PHOTOS_PER_PLANT,
  type PhenoDiaryEvidenceRow,
} from "@/lib/phenoCandidateEvidenceEnrichmentRules";

function row(over: Partial<PhenoDiaryEvidenceRow> = {}): PhenoDiaryEvidenceRow {
  return {
    id: "e1",
    plant_id: "p1",
    entry_at: "2026-08-20T10:00:00Z",
    note: "Watered 2L",
    photo_url: null,
    details: { event_type: "watering" },
    ...over,
  };
}

describe("mapDiaryRowsToCandidateEvidence", () => {
  it("maps diary rows into per-plant quick log entries, timeline events, and photos", () => {
    const evidence = mapDiaryRowsToCandidateEvidence([
      row(),
      row({
        id: "e2",
        entry_at: "2026-08-19T10:00:00Z",
        note: "Topdress",
        details: { event_type: "feeding" },
      }),
      row({
        id: "e3",
        plant_id: "p2",
        note: "Node spacing tight",
        photo_url: "https://x/photo.jpg",
        details: null,
      }),
    ]);
    expect(evidence.quickLogEntriesByPlantId.p1).toHaveLength(2);
    expect(evidence.quickLogEntriesByPlantId.p1[0].kind).toBe("watering");
    expect(evidence.timelineEventsByPlantId.p1[0].summary).toBe("Watered 2L");
    expect(evidence.quickLogEntriesByPlantId.p2[0].kind).toBe("note");
    expect(evidence.photosByPlantId.p2).toEqual([
      {
        id: "e3-photo",
        at: "2026-08-20T10:00:00Z",
        caption: "Node spacing tight",
        url: "https://x/photo.jpg",
      },
    ]);
    expect(evidence.photosByPlantId.p1).toBeUndefined();
  });

  it("orders newest first deterministically and applies the per-plant caps", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({
        id: `e${String(i).padStart(2, "0")}`,
        entry_at: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
        photo_url: "https://x/p.jpg",
      }),
    );
    // Shuffle input order — output must not depend on it.
    const evidence = mapDiaryRowsToCandidateEvidence([
      rows[5],
      rows[0],
      ...rows.slice(6),
      ...rows.slice(1, 5),
    ]);
    const entries = evidence.quickLogEntriesByPlantId.p1;
    expect(entries).toHaveLength(PHENO_EVIDENCE_ENTRIES_PER_PLANT);
    expect(entries[0].at).toBe("2026-08-12T00:00:00Z"); // newest first
    expect(evidence.photosByPlantId.p1).toHaveLength(PHENO_EVIDENCE_PHOTOS_PER_PLANT);
  });

  it("skips rows without a plant id or timestamp and truncates long notes", () => {
    const evidence = mapDiaryRowsToCandidateEvidence([
      row({ id: "no-plant", plant_id: null }),
      row({ id: "no-at", entry_at: null }),
      row({ id: "long", note: "x".repeat(200) }),
    ]);
    expect(evidence.quickLogEntriesByPlantId.p1).toHaveLength(1);
    expect(evidence.quickLogEntriesByPlantId.p1[0].note).toHaveLength(140);
  });
});

describe("tentSnapshotToComparisonInput", () => {
  it("maps the canonical metric vocabulary with C→F conversion and verbatim source", () => {
    const input = tentSnapshotToComparisonInput("tent-1", {
      source: "manual",
      captured_at: "2026-08-25T12:00:00Z",
      metrics: { temperature: 25, humidity: 55, vpd: 1.2, soil_ec: 1.8, ppfd: 700 },
    });
    expect(input).toEqual({
      id: "tent-1-latest-snapshot",
      source: "manual",
      capturedAt: "2026-08-25T12:00:00Z",
      tempF: 77,
      rh: 55,
      vpd: 1.2,
      ec: 1.8,
      ph: null, // not a tent sensor metric — stays missing, never invented
      ppfd: 700,
    });
  });

  it("keeps absent metrics null and resolves a missing snapshot to null", () => {
    expect(tentSnapshotToComparisonInput("t", null)).toBeNull();
    const sparse = tentSnapshotToComparisonInput("t", {
      source: "live",
      captured_at: "2026-08-25T12:00:00Z",
      metrics: { humidity: 60 },
    });
    expect(sparse?.tempF).toBeNull();
    expect(sparse?.rh).toBe(60);
    expect(sparse?.ppfd).toBeNull();
  });
});
