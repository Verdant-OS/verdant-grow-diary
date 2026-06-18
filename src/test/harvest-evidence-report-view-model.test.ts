/**
 * harvestEvidenceReportViewModel — pure view-model tests + static safety.
 *
 * Read-only report. No I/O, no Supabase, no AI, no alerts, no Action
 * Queue, no automation, no device control. Generic photos must NOT
 * count as trichome inspection. Required caution copy must render.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildHarvestEvidenceReport,
  HARVEST_EVIDENCE_REPORT_CAUTION,
  HARVEST_EVIDENCE_REPORT_EMPTY_COPY,
  HARVEST_EVIDENCE_REPORT_NO_ACTIONS_COPY,
  HARVEST_EVIDENCE_REPORT_UNASSIGNED_WINDOW_LABEL,
  type HarvestEvidenceReportPlantInput,
} from "@/lib/harvestEvidenceReportViewModel";

function row(o: Partial<{
  id: string;
  note: string | null;
  hasPhoto: boolean;
  eventType: string;
  occurredAt: string | null;
}>) {
  return {
    id: o.id ?? "r1",
    note: o.note ?? null,
    notePreview: null,
    hasPhoto: o.hasPhoto ?? false,
    eventType: o.eventType ?? "observation",
    occurredAt: o.occurredAt ?? "2025-06-10T10:00:00.000Z",
    occurredAtLabel: "Jun 10",
  };
}

describe("buildHarvestEvidenceReport — grouping & counts", () => {
  it("returns empty report with caution copy when no plants supplied", () => {
    const r = buildHarvestEvidenceReport([]);
    expect(r.isEmpty).toBe(true);
    expect(r.emptyCopy).toBe(HARVEST_EVIDENCE_REPORT_EMPTY_COPY);
    expect(r.caution).toBe(HARVEST_EVIDENCE_REPORT_CAUTION);
    expect(r.noActionsCopy).toBe(HARVEST_EVIDENCE_REPORT_NO_ACTIONS_COPY);
    expect(r.totals.plants).toBe(0);
  });

  it("groups evidence by plant and sorts plants by name", () => {
    const input: HarvestEvidenceReportPlantInput[] = [
      {
        plantId: "p2",
        plantName: "Zelda",
        rows: [row({ note: "Trichome check: mostly cloudy" })],
      },
      {
        plantId: "p1",
        plantName: "Alpha",
        rows: [row({ note: "Pistils receding" })],
      },
    ];
    const r = buildHarvestEvidenceReport(input);
    expect(r.plants.map((p) => p.plantId)).toEqual(["p1", "p2"]);
  });

  it("buckets evidence by weekly window when no explicit window model exists", () => {
    const r = buildHarvestEvidenceReport([
      {
        plantId: "p1",
        plantName: "Alpha",
        rows: [
          row({ id: "a", note: "Trichome amber", occurredAt: "2025-06-02T10:00:00Z" }),
          row({ id: "b", note: "Trichome cloudy", occurredAt: "2025-06-09T10:00:00Z" }),
        ],
      },
    ]);
    const p = r.plants[0];
    expect(p.windows.length).toBe(2);
    // Sorted oldest → newest
    expect(p.windows[0].startsAt && p.windows[0].startsAt < (p.windows[1].startsAt ?? "")).toBe(true);
  });

  it("uses Unassigned inspection window when occurredAt is missing", () => {
    const r = buildHarvestEvidenceReport([
      {
        plantId: "p1",
        plantName: "Alpha",
        rows: [row({ note: "Trichome check", occurredAt: null })],
      },
    ]);
    const labels = r.plants[0].windows.map((w) => w.label);
    expect(labels).toContain(HARVEST_EVIDENCE_REPORT_UNASSIGNED_WINDOW_LABEL);
    // Unassigned sorts last.
    expect(r.plants[0].windows.at(-1)?.label).toBe(
      HARVEST_EVIDENCE_REPORT_UNASSIGNED_WINDOW_LABEL,
    );
  });

  it("counts trichome, pistil, bud, and close flower photo evidence", () => {
    const r = buildHarvestEvidenceReport([
      {
        plantId: "p1",
        plantName: "Alpha",
        rows: [
          row({ id: "a", note: "Trichomes mostly cloudy" }),
          row({ id: "b", note: "Pistils recession progressing" }),
          row({ id: "c", note: "Buds swelling and dense" }),
          row({
            id: "d",
            note: "Close-up flower photo",
            eventType: "photo",
            hasPhoto: true,
          }),
        ],
      },
    ]);
    expect(r.totals.trichomeInspections).toBe(1);
    expect(r.totals.pistilObservations).toBe(1);
    expect(r.totals.budMaturityNotes).toBe(1);
    expect(r.totals.closeFlowerPhotos).toBe(1);
    expect(r.totals.plants).toBe(1);
  });

  it("generic photo does NOT count as trichome inspection", () => {
    const r = buildHarvestEvidenceReport([
      {
        plantId: "p1",
        plantName: "Alpha",
        rows: [
          row({ id: "p", note: "", eventType: "photo", hasPhoto: true }),
        ],
      },
    ]);
    expect(r.totals.trichomeInspections).toBe(0);
    expect(r.totals.closeFlowerPhotos).toBe(1);
  });

  it("generic harvest note does not count toward strong evidence", () => {
    const r = buildHarvestEvidenceReport([
      {
        plantId: "p1",
        plantName: "Alpha",
        rows: [row({ note: "Thinking about harvest soon" })],
      },
    ]);
    expect(r.totals.trichomeInspections).toBe(0);
    expect(r.totals.pistilObservations).toBe(0);
    expect(r.totals.budMaturityNotes).toBe(0);
    expect(r.totals.closeFlowerPhotos).toBe(0);
  });

  it("exposes latest date label per category and missing-category counts", () => {
    const r = buildHarvestEvidenceReport([
      {
        plantId: "p1",
        plantName: "Alpha",
        rows: [
          row({ id: "a", note: "Trichome amber" }),
        ],
      },
    ]);
    const w = r.plants[0].windows[0];
    const trich = w.categories.find((c) => c.key === "trichome_inspection")!;
    expect(trich.count).toBe(1);
    expect(trich.latestOccurredAtLabel).toBe("Jun 10");
    expect(w.missingCategoryCount).toBe(3); // pistil, bud, photo missing
    expect(r.totals.missingEvidenceCount).toBeGreaterThanOrEqual(3);
  });

  it("renders per-category empty summary copy when category is missing", () => {
    const r = buildHarvestEvidenceReport([
      {
        plantId: "p1",
        plantName: "Alpha",
        rows: [row({ note: "Trichome cloudy" })],
      },
    ]);
    const w = r.plants[0].windows[0];
    const pistil = w.categories.find((c) => c.key === "pistil_observation")!;
    expect(pistil.status).toBe("missing");
    expect(pistil.summary).toBe("No pistil or recession notes logged.");
  });

  it("does not crash on null / malformed entries", () => {
    expect(() =>
      buildHarvestEvidenceReport([
        // @ts-expect-error intentionally malformed
        null,
        { plantId: "p1", plantName: "Alpha", rows: [null as any, undefined as any] },
      ]),
    ).not.toThrow();
  });

  it("sorting is deterministic across repeated runs", () => {
    const input: HarvestEvidenceReportPlantInput[] = [
      { plantId: "p2", plantName: "Beta", rows: [row({ note: "trichome" })] },
      { plantId: "p1", plantName: "Alpha", rows: [row({ note: "pistils" })] },
    ];
    const a = buildHarvestEvidenceReport(input);
    const b = buildHarvestEvidenceReport(input);
    expect(a.plants.map((p) => p.plantId)).toEqual(b.plants.map((p) => p.plantId));
  });
});

describe("buildHarvestEvidenceReport — static safety", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../lib/harvestEvidenceReportViewModel.ts"),
    "utf8",
  );

  it("does not import sensor_readings, AI, alerts, Action Queue, supabase, or device control", () => {
    expect(SRC).not.toMatch(/sensor_readings/);
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/ai-doctor|ai-coach|aiDoctor|aiCoach/i);
    expect(SRC).not.toMatch(/actionQueue|action_queue/i);
    expect(SRC).not.toMatch(/alerts?Service|alerts?Client/i);
    expect(SRC).not.toMatch(/deviceControl|device_control/i);
  });

  it("contains no forbidden harvest instruction copy", () => {
    const forbidden = [
      "harvest now",
      "ready to harvest",
      "optimal",
      "guaranteed",
      "chop",
      "flush",
      "dark period",
      "fix immediately",
      "plant is unhealthy",
    ];
    for (const phrase of forbidden) {
      expect(SRC.toLowerCase()).not.toContain(phrase);
    }
  });
});
