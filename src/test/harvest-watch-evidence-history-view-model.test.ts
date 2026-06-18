/**
 * harvestWatchEvidenceHistoryViewModel — pure classifier + history tests.
 *
 * Read-only evidence tracking. No I/O, no Supabase, no AI, no alerts, no
 * Action Queue, no automation, no device control.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildHarvestEvidenceHistory,
  classifyHarvestEvidenceRow,
  HARVEST_EVIDENCE_CATEGORY_EMPTY,
  HARVEST_EVIDENCE_HISTORY_CAUTION,
  isHarvestEvidenceDiaryItem,
  type HarvestEvidenceClassifiableRow,
} from "@/lib/harvestWatchEvidenceHistoryViewModel";

function row(
  o: Partial<HarvestEvidenceClassifiableRow> = {},
): HarvestEvidenceClassifiableRow {
  return {
    id: o.id ?? "e1",
    note: o.note ?? null,
    notePreview: o.notePreview ?? null,
    hasPhoto: o.hasPhoto ?? false,
    eventType: o.eventType ?? "observation",
    occurredAt: o.occurredAt ?? "2025-06-01T10:00:00.000Z",
    occurredAtLabel: o.occurredAtLabel ?? "Jun 1",
  };
}

describe("classifyHarvestEvidenceRow", () => {
  it("classifies explicit trichome notes", () => {
    expect(
      classifyHarvestEvidenceRow(row({ note: "Trichome check: mostly cloudy" })),
    ).toBe("trichome_inspection");
  });

  it("classifies explicit pistil / recession / hair notes", () => {
    expect(
      classifyHarvestEvidenceRow(row({ note: "Pistils 60% receded" })),
    ).toBe("pistil_observation");
    expect(
      classifyHarvestEvidenceRow(row({ note: "Most hairs darkened" })),
    ).toBe("pistil_observation");
    expect(
      classifyHarvestEvidenceRow(row({ note: "Noticed recession on tops" })),
    ).toBe("pistil_observation");
  });

  it("classifies explicit bud maturity notes", () => {
    expect(
      classifyHarvestEvidenceRow(row({ note: "Bud calyx swelling on cola" })),
    ).toBe("bud_maturity");
    expect(
      classifyHarvestEvidenceRow(row({ note: "Overall bud maturity looks good" })),
    ).toBe("bud_maturity");
  });

  it("classifies close flower photo presets as recent_flower_photo", () => {
    expect(
      classifyHarvestEvidenceRow(
        row({
          note: "Close flower photo — top cola, ambient light",
          hasPhoto: true,
          eventType: "photo",
        }),
      ),
    ).toBe("recent_flower_photo");
  });

  it("does NOT classify generic photos as trichome evidence", () => {
    expect(
      classifyHarvestEvidenceRow(
        row({ note: "", hasPhoto: true, eventType: "photo" }),
      ),
    ).toBe("recent_flower_photo");
  });

  it("classifies generic harvest-related notes as other_harvest_note", () => {
    expect(
      classifyHarvestEvidenceRow(row({ note: "Approaching harvest window." })),
    ).toBe("other_harvest_note");
  });

  it("returns null for non-harvest notes", () => {
    expect(classifyHarvestEvidenceRow(row({ note: "Watered 1L today." }))).toBeNull();
  });

  it("never crashes on missing / malformed input", () => {
    expect(classifyHarvestEvidenceRow(null)).toBeNull();
    expect(classifyHarvestEvidenceRow(undefined)).toBeNull();
    expect(
      classifyHarvestEvidenceRow({} as HarvestEvidenceClassifiableRow),
    ).toBeNull();
    expect(
      classifyHarvestEvidenceRow({
        note: 42 as unknown as string,
      } as HarvestEvidenceClassifiableRow),
    ).toBeNull();
  });

  it("isHarvestEvidenceDiaryItem mirrors the classifier", () => {
    expect(
      isHarvestEvidenceDiaryItem(row({ note: "Trichome check today" })),
    ).toBe(true);
    expect(isHarvestEvidenceDiaryItem(row({ note: "Watered" }))).toBe(false);
  });
});

describe("buildHarvestEvidenceHistory", () => {
  it("groups evidence by category", () => {
    const rows: HarvestEvidenceClassifiableRow[] = [
      row({ id: "a", note: "Trichome check", occurredAt: "2025-06-01T00:00:00Z" }),
      row({ id: "b", note: "Pistil recession 50%", occurredAt: "2025-06-02T00:00:00Z" }),
      row({ id: "c", note: "Bud maturity solid", occurredAt: "2025-06-03T00:00:00Z" }),
      row({ id: "d", note: "", hasPhoto: true, eventType: "photo" }),
      row({ id: "e", note: "watered" }),
    ];
    const history = buildHarvestEvidenceHistory(rows);
    const byKey = Object.fromEntries(history.groups.map((g) => [g.key, g.items]));
    expect(byKey.trichome_inspection.map((i) => i.id)).toEqual(["a"]);
    expect(byKey.pistil_observation.map((i) => i.id)).toEqual(["b"]);
    expect(byKey.bud_maturity.map((i) => i.id)).toEqual(["c"]);
    expect(byKey.recent_flower_photo.map((i) => i.id)).toEqual(["d"]);
    expect(byKey.other_harvest_note).toEqual([]);
    expect(history.totalCount).toBe(4);
  });

  it("sorts items most-recent-first with stable id tiebreak", () => {
    const rows: HarvestEvidenceClassifiableRow[] = [
      row({ id: "a", note: "Trichome check", occurredAt: "2025-06-01T00:00:00Z" }),
      row({ id: "c", note: "Trichome amber", occurredAt: "2025-06-03T00:00:00Z" }),
      row({ id: "b", note: "Trichome cloudy", occurredAt: "2025-06-03T00:00:00Z" }),
    ];
    const history = buildHarvestEvidenceHistory(rows);
    const tri = history.groups.find((g) => g.key === "trichome_inspection")!;
    expect(tri.items.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("returns empty groups with the mandated empty copy", () => {
    const history = buildHarvestEvidenceHistory([]);
    expect(history.totalCount).toBe(0);
    for (const g of history.groups) {
      expect(g.items).toEqual([]);
      expect(g.emptyCopy).toBe(HARVEST_EVIDENCE_CATEGORY_EMPTY[g.key]);
    }
    expect(history.groups.find((g) => g.key === "trichome_inspection")!.emptyCopy)
      .toBe("No trichome inspection notes yet.");
    expect(history.groups.find((g) => g.key === "pistil_observation")!.emptyCopy)
      .toBe("No pistil or recession notes yet.");
    expect(history.groups.find((g) => g.key === "bud_maturity")!.emptyCopy)
      .toBe("No bud maturity notes yet.");
    expect(history.groups.find((g) => g.key === "recent_flower_photo")!.emptyCopy)
      .toBe("No close flower photos yet.");
  });

  it("surfaces the required caution copy", () => {
    const history = buildHarvestEvidenceHistory([]);
    expect(history.caution).toBe(HARVEST_EVIDENCE_HISTORY_CAUTION);
    expect(history.caution).toMatch(/diary evidence only/i);
  });

  it("tolerates null / undefined / malformed rows without crashing", () => {
    const history = buildHarvestEvidenceHistory(
      [null, undefined, "junk", { id: "x", note: "Trichome" }] as unknown as HarvestEvidenceClassifiableRow[],
    );
    expect(history.totalCount).toBe(1);
  });
});

describe("static safety — harvestWatchEvidenceHistoryViewModel", () => {
  const SRC = readFileSync(
    resolve(process.cwd(), "src/lib/harvestWatchEvidenceHistoryViewModel.ts"),
    "utf8",
  );

  it("has no forbidden imports", () => {
    const FORBIDDEN = [
      "@supabase/",
      "supabase/client",
      "supabase-js",
      "ai-doctor",
      "aiDoctor",
      "actionQueue",
      "action_queue",
      "deviceControl",
      "alerts",
    ];
    for (const f of FORBIDDEN) expect(SRC).not.toContain(f);
  });

  it("does not render forbidden harvest-instruction phrasing", () => {
    const FORBIDDEN_PHRASES = [
      "harvest now",
      "ready to harvest",
      "optimal",
      "guaranteed",
      /\bchop\b/i,
      /\bflush\b/i,
      "dark period",
      "fix immediately",
      "plant is unhealthy",
      "done",
    ];
    for (const p of FORBIDDEN_PHRASES) {
      if (typeof p === "string") {
        expect(SRC.toLowerCase()).not.toContain(p.toLowerCase());
      } else {
        expect(p.test(SRC)).toBe(false);
      }
    }
  });
});
