import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPhenoCandidateEvidencePacket,
  buildPhenoEvidencePackets,
  phenoEvidencePacketStateLabel,
} from "@/lib/phenoEvidencePacket";
import type { RawPhenoEvidenceDiaryRow } from "@/lib/phenoEvidenceCaptureRules";

const HUNT = "hunt-1";
const PLANT = "plant-a";

function receiptRow(
  overrides: Partial<RawPhenoEvidenceDiaryRow> & {
    goal?: string;
    huntId?: string;
    detailsPlantId?: string;
    version?: unknown;
    sensor?: Record<string, unknown> | null;
    unsafe?: Partial<Record<string, unknown>>;
  } = {},
): RawPhenoEvidenceDiaryRow {
  const {
    goal = "aroma",
    huntId = HUNT,
    detailsPlantId,
    version = 1,
    sensor = null,
    unsafe = {},
    ...row
  } = overrides;
  return {
    id: "d1",
    plant_id: PLANT,
    entry_at: "2026-07-10T12:00:00.000Z",
    photo_url: null,
    details: {
      kind: "pheno_evidence_receipt",
      receipt_version: version,
      source: "manual",
      evidence_only: true,
      hunt_id: huntId,
      plant_id: detailsPlantId ?? row.plant_id ?? PLANT,
      evidence_goal: goal,
      stage: "flower",
      automatic_selection: false,
      action_queue_created: false,
      device_control: false,
      ...(sensor ? { sensor } : {}),
      ...unsafe,
    },
    ...row,
  };
}

const GOALS = ["structure", "aroma", "vigor"];

describe("buildPhenoCandidateEvidencePacket — coverage", () => {
  it("happy path: records the exact configured goal and nothing else", () => {
    const p = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: GOALS,
      rows: [receiptRow({ goal: "aroma" })],
    });
    expect(p.state).toBe("partial");
    expect(p.configuredGoalCount).toBe(3);
    expect(p.recordedGoalCount).toBe(1);
    expect(p.missingGoalIds).toEqual(["structure", "vigor"]);
    expect(p.receiptCount).toBe(1);
    expect(p.latestEntryAt).toBe("2026-07-10T12:00:00.000Z");
    // Configured order preserved on the goal list.
    expect(p.goals.map((g) => g.id)).toEqual(["structure", "aroma", "vigor"]);
  });

  it("complete when every configured goal has a receipt", () => {
    const p = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: GOALS,
      rows: [
        receiptRow({ id: "d1", goal: "structure" }),
        receiptRow({ id: "d2", goal: "aroma" }),
        receiptRow({ id: "d3", goal: "vigor" }),
      ],
    });
    expect(p.state).toBe("complete");
    expect(p.missingGoalIds).toEqual([]);
  });

  it("duplicate receipts grow receipt history but not goal completion", () => {
    const p = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: GOALS,
      rows: [
        receiptRow({ id: "d1", goal: "aroma", entry_at: "2026-07-10T12:00:00.000Z" }),
        receiptRow({ id: "d2", goal: "aroma", entry_at: "2026-07-11T12:00:00.000Z" }),
      ],
    });
    expect(p.recordedGoalCount).toBe(1);
    expect(p.receiptCount).toBe(2);
    const aroma = p.goals.find((g) => g.id === "aroma")!;
    expect(aroma.receiptCount).toBe(2);
    expect(aroma.latestEntryAt).toBe("2026-07-11T12:00:00.000Z");
    expect(p.latestEntryAt).toBe("2026-07-11T12:00:00.000Z");
  });

  it("zero configured goals is partial (not complete), with empty goal list", () => {
    const p = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: [],
      rows: [receiptRow()],
    });
    expect(p.state).toBe("partial");
    expect(p.configuredGoalCount).toBe(0);
    expect(p.recordedGoalCount).toBe(0);
  });

  it("null/missing rows and malformed configured goals are safe", () => {
    const p = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: { nope: true },
      rows: null,
    });
    expect(p.state).toBe("partial");
    expect(p.receiptCount).toBe(0);
    expect(p.latestEntryAt).toBeNull();
    expect(p.sensor.latestFreshness).toBeNull();
  });
});

describe("buildPhenoCandidateEvidencePacket — fail-closed parsing", () => {
  it.each([
    ["wrong hunt", receiptRow({ huntId: "other-hunt" })],
    ["wrong candidate in details", receiptRow({ detailsPlantId: "plant-b" })],
    ["wrong candidate row column", receiptRow({ plant_id: "plant-b", detailsPlantId: PLANT })],
    ["unsupported version", receiptRow({ version: 2 })],
    ["malformed details", { ...receiptRow(), details: "not-an-object" }],
    ["unsafe automatic_selection", receiptRow({ unsafe: { automatic_selection: true } })],
    ["unsafe action_queue_created", receiptRow({ unsafe: { action_queue_created: true } })],
    ["unsafe device_control", receiptRow({ unsafe: { device_control: true } })],
    ["unknown goal", receiptRow({ goal: "not_a_goal" })],
  ])("%s contributes nothing", (_name, row) => {
    const p = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: GOALS,
      rows: [row as RawPhenoEvidenceDiaryRow],
    });
    expect(p.receiptCount).toBe(0);
    expect(p.recordedGoalCount).toBe(0);
  });

  it("a goal not configured for the hunt does not count toward coverage", () => {
    const p = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: ["structure"],
      rows: [receiptRow({ goal: "aroma" })],
    });
    expect(p.receiptCount).toBe(0);
    expect(p.recordedGoalCount).toBe(0);
  });
});

describe("truncated / unavailable fail closed", () => {
  const fullRows = [
    receiptRow({ id: "d1", goal: "structure" }),
    receiptRow({ id: "d2", goal: "aroma" }),
    receiptRow({ id: "d3", goal: "vigor" }),
  ];

  it("truncated never reports complete, even with every goal recorded", () => {
    const p = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: GOALS,
      rows: fullRows,
      truncated: true,
    });
    expect(p.recordedGoalCount).toBe(3);
    expect(p.state).toBe("truncated");
    expect(p.truncated).toBe(true);
  });

  it("unavailable ignores rows entirely and wins over truncated", () => {
    const p = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: GOALS,
      rows: fullRows,
      truncated: true,
      unavailable: true,
    });
    expect(p.state).toBe("unavailable");
    expect(p.receiptCount).toBe(0);
    expect(p.truncated).toBe(false);
  });

  it("every state has a plain-text label", () => {
    for (const s of ["complete", "partial", "truncated", "unavailable"] as const) {
      expect(phenoEvidencePacketStateLabel(s).length).toBeGreaterThan(0);
    }
  });
});

describe("ordering and determinism", () => {
  it("latest receipt wins by entry_at with diary-id tie-break", () => {
    const p = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: GOALS,
      rows: [
        receiptRow({ id: "d2", goal: "aroma", entry_at: "2026-07-11T12:00:00.000Z" }),
        receiptRow({ id: "d1", goal: "aroma", entry_at: "2026-07-11T12:00:00.000Z" }),
        receiptRow({ id: "d9", goal: "aroma", entry_at: "2026-07-01T12:00:00.000Z" }),
      ],
    });
    expect(p.latestEntryAt).toBe("2026-07-11T12:00:00.000Z");
    expect(p.receiptCount).toBe(3);
  });

  it("identical input produces identical output (deep equality, twice)", () => {
    const input = {
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: GOALS,
      rows: [
        receiptRow({ id: "d2", goal: "aroma" }),
        receiptRow({ id: "d1", goal: "structure", photo_url: "https://x.invalid/p.jpg" }),
      ],
    };
    expect(buildPhenoCandidateEvidencePacket(input)).toEqual(
      buildPhenoCandidateEvidencePacket(input),
    );
  });
});

describe("photo and sensor provenance", () => {
  it("photo presence comes only from the receipt row", () => {
    const withPhoto = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: GOALS,
      rows: [receiptRow({ photo_url: "https://x.invalid/p.jpg" })],
    });
    const without = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: GOALS,
      rows: [receiptRow({ photo_url: "   " })],
    });
    expect(withPhoto.hasPhotoEvidence).toBe(true);
    expect(without.hasPhotoEvidence).toBe(false);
  });

  it.each(["stale", "invalid", "unknown"] as const)(
    "%s sensor context is preserved as-is and never counted fresh",
    (freshness) => {
      const p = buildPhenoCandidateEvidencePacket({
        huntId: HUNT,
        plantId: PLANT,
        configuredGoals: GOALS,
        rows: [receiptRow({ sensor: { freshness, captured_at: "2026-07-10T11:00:00.000Z" } })],
      });
      expect(p.sensor.attachedReceiptCount).toBe(1);
      expect(p.sensor.freshReceiptCount).toBe(0);
      expect(p.sensor.latestFreshness).toBe(freshness);
    },
  );

  it("garbage freshness fails closed to unknown", () => {
    const p = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: GOALS,
      rows: [receiptRow({ sensor: { freshness: "LIVE!!", captured_at: null } })],
    });
    expect(p.sensor.latestFreshness).toBe("unknown");
    expect(p.sensor.freshReceiptCount).toBe(0);
  });

  it("latest sensor summary follows the newest sensor-attached receipt", () => {
    const p = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: GOALS,
      rows: [
        receiptRow({
          id: "old",
          entry_at: "2026-07-01T00:00:00.000Z",
          sensor: { freshness: "fresh", captured_at: "2026-07-01T00:00:00.000Z" },
        }),
        receiptRow({
          id: "new",
          entry_at: "2026-07-12T00:00:00.000Z",
          sensor: { freshness: "stale", captured_at: "2026-07-11T00:00:00.000Z" },
        }),
      ],
    });
    expect(p.sensor.attachedReceiptCount).toBe(2);
    expect(p.sensor.freshReceiptCount).toBe(1);
    expect(p.sensor.latestFreshness).toBe("stale");
    expect(p.sensor.latestCapturedAt).toBe("2026-07-11T00:00:00.000Z");
  });
});

describe("buildPhenoEvidencePackets — batch grouping", () => {
  it("groups rows per candidate, dedupes ids, and keeps input order", () => {
    const packets = buildPhenoEvidencePackets({
      huntId: HUNT,
      plantIds: ["plant-b", "plant-a", "plant-b", "  ", "plant-a"],
      configuredGoals: GOALS,
      rows: [
        receiptRow({ id: "d1", plant_id: "plant-a", detailsPlantId: "plant-a" }),
        receiptRow({ id: "d2", plant_id: "plant-b", detailsPlantId: "plant-b", goal: "vigor" }),
      ],
    });
    expect(Array.from(packets.keys())).toEqual(["plant-b", "plant-a"]);
    expect(packets.get("plant-a")!.recordedGoalCount).toBe(1);
    expect(packets.get("plant-b")!.goals.find((g) => g.id === "vigor")!.recorded).toBe(true);
  });

  it("a row grouped under one plant never leaks into another packet", () => {
    const packets = buildPhenoEvidencePackets({
      huntId: HUNT,
      plantIds: ["plant-a", "plant-b"],
      configuredGoals: GOALS,
      rows: [receiptRow({ plant_id: "plant-a", detailsPlantId: "plant-a" })],
    });
    expect(packets.get("plant-b")!.receiptCount).toBe(0);
  });

  it("batch truncation marks every packet truncated", () => {
    const packets = buildPhenoEvidencePackets({
      huntId: HUNT,
      plantIds: ["plant-a", "plant-b"],
      configuredGoals: GOALS,
      rows: [receiptRow()],
      truncated: true,
    });
    expect(packets.get("plant-a")!.state).toBe("truncated");
    expect(packets.get("plant-b")!.state).toBe("truncated");
  });
});

describe("separation from structured readiness", () => {
  it("the packet module never imports the readiness model or ranks anything", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/phenoEvidencePacket.ts"),
      "utf8",
    );
    // Comments may DOCUMENT the separation; the code itself must not import
    // the readiness model or emit readiness values.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(stripped).not.toMatch(/phenoCandidateReadiness/);
    expect(stripped).not.toMatch(/comparison_ready/);
    expect(stripped.toLowerCase()).not.toMatch(
      /\bwinner\b|\brank(ing|ed)?\b|best candidate|recommend/,
    );
  });

  it("a receipt affects only coverage fields — no readiness/score keys exist on the packet", () => {
    const p = buildPhenoCandidateEvidencePacket({
      huntId: HUNT,
      plantId: PLANT,
      configuredGoals: GOALS,
      rows: [receiptRow()],
    });
    const keys = Object.keys(p);
    for (const forbidden of ["readiness", "score", "rank", "keeper", "decision"]) {
      expect(keys.some((k) => k.toLowerCase().includes(forbidden))).toBe(false);
    }
  });
});
