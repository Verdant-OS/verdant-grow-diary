/**
 * Pure-rule tests for the Next Run Playbook — no automatic promotion,
 * deterministic categorization, unresolved lessons never dropped.
 */
import { describe, expect, it } from "vitest";
import {
  PLAYBOOK_ACTION_CATEGORIES,
  buildNextRunPlaybook,
  categorizeAction,
  groupPlaybookItemsByCategory,
} from "../lib/nextRunPlaybookRules";
import {
  buildPlantMemoryEpisode,
  type EpisodeActionInput,
  type EpisodeDiaryRowInput,
  type PlantMemoryEpisode,
} from "../lib/plantMemoryEpisodeRules";

const T0 = Date.parse("2026-07-01T12:00:00Z");
const iso = (ms: number) => new Date(T0 + ms).toISOString();
const HOUR = 60 * 60 * 1000;

function episode(opts: {
  id: string;
  targetMetric?: string | null;
  reason?: string | null;
  outcome?: string;
  decision?: string;
  mismatch?: boolean;
  outcomeRecordedBy?: "grower" | "ai";
}): PlantMemoryEpisode {
  const action: EpisodeActionInput = {
    id: opts.id,
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    source: "ai_suggestion",
    action_type: "environment",
    target_metric: opts.targetMetric ?? "humidity",
    suggested_change: "Lower RH a few points",
    reason: opts.reason ?? "RH high",
    status: "completed",
    completed_at: iso(0),
  };
  const rows: EpisodeDiaryRowInput[] = [];
  if (opts.outcome) {
    rows.push({
      id: `${opts.id}-out`,
      grow_id: opts.mismatch ? "grow-OTHER" : "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      note: null,
      entry_at: iso(25 * HOUR),
      details: {
        event_type: "action_outcome",
        action_queue_id: opts.id,
        outcome_status: opts.outcome,
        recorded_by: opts.outcomeRecordedBy ?? "grower",
        recorded_at: iso(25 * HOUR),
      },
    });
  }
  if (opts.decision) {
    rows.push({
      id: `${opts.id}-dec`,
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      note: null,
      entry_at: iso(26 * HOUR),
      details: {
        event_type: "run_learning_decision",
        action_queue_id: opts.id,
        decision: opts.decision,
        rationale: "seemed to help",
        recorded_by: "grower",
        recorded_at: iso(26 * HOUR),
      },
    });
  }
  const ep = buildPlantMemoryEpisode({ action, linkedRows: rows, now: T0 + 30 * HOUR });
  if (!ep) throw new Error("expected episode");
  return ep;
}

describe("categorizeAction", () => {
  it("categorizes environment metrics", () => {
    expect(categorizeAction({ targetMetric: "humidity", reason: null })).toBe("environment");
    expect(categorizeAction({ targetMetric: "vpd", reason: null })).toBe("environment");
    expect(categorizeAction({ targetMetric: "temp_c", reason: null })).toBe("environment");
  });

  it("checks soil/root-zone before generic temperature (mirrors followup convention)", () => {
    expect(categorizeAction({ targetMetric: "root_zone_temp_c", reason: null })).toBe(
      "watering_root_zone",
    );
  });

  it("categorizes nutrition, canopy, transplant, pest/disease, observation", () => {
    expect(categorizeAction({ targetMetric: "ec", reason: null })).toBe("nutrition");
    expect(categorizeAction({ targetMetric: null, reason: "topping for canopy training" })).toBe(
      "canopy_training",
    );
    expect(categorizeAction({ targetMetric: null, reason: "transplant to bigger pot" })).toBe(
      "transplant_root_handling",
    );
    expect(categorizeAction({ targetMetric: null, reason: "spider mite treatment" })).toBe(
      "pest_disease_response",
    );
    expect(categorizeAction({ targetMetric: null, reason: "daily observation check" })).toBe(
      "observation_monitoring",
    );
  });

  it("falls back to other for unrecognized signals", () => {
    expect(categorizeAction({ targetMetric: null, reason: null })).toBe("other");
  });

  it("covers all 8 spec categories", () => {
    expect(PLAYBOOK_ACTION_CATEGORIES).toHaveLength(8);
  });
});

describe("buildNextRunPlaybook — no automatic promotion", () => {
  it("an improved outcome with an explicit monitor decision stays under Monitor", () => {
    const playbook = buildNextRunPlaybook([
      episode({ id: "a", outcome: "improved", decision: "monitor" }),
    ]);
    const monitor = playbook.groups.find((g) => g.section === "monitor");
    expect(monitor?.items[0]?.outcomeLabel).toMatch(/improved/i);
    expect(monitor?.items[0]?.decision).toBe("monitor");
    expect(playbook.groups.find((g) => g.section === "repeat")).toBeUndefined();
  });

  it("a worsened outcome with an explicit adjust decision stays under Adjust, not Avoid", () => {
    const playbook = buildNextRunPlaybook([
      episode({ id: "a", outcome: "worsened", decision: "adjust" }),
    ]);
    const adjust = playbook.groups.find((g) => g.section === "adjust");
    expect(adjust?.items[0]?.outcomeLabel).toMatch(/worsened/i);
    expect(playbook.groups.find((g) => g.section === "avoid")).toBeUndefined();
  });

  it.each(["repeat", "avoid", "adjust", "monitor"] as const)(
    "sections exactly by the grower's %s decision regardless of outcome",
    (decision) => {
      const playbook = buildNextRunPlaybook([episode({ id: "a", outcome: "unchanged", decision })]);
      expect(playbook.groups.map((g) => g.section)).toEqual([decision]);
    },
  );
});

describe("buildNextRunPlaybook — unresolved lessons never dropped", () => {
  it("outcome recorded, no decision yet → unresolved, not silently omitted", () => {
    const playbook = buildNextRunPlaybook([episode({ id: "a", outcome: "improved" })]);
    expect(playbook.groups.map((g) => g.section)).toEqual(["unresolved"]);
    expect(playbook.totalUnresolved).toBe(1);
    expect(playbook.totalDecided).toBe(0);
  });

  it("needs_review episodes are excluded entirely (not a lesson yet)", () => {
    const playbook = buildNextRunPlaybook([
      episode({ id: "a", outcome: "improved", mismatch: true }),
    ]);
    expect(playbook.isEmpty).toBe(true);
  });

  it("episodes with no grower outcome at all are excluded", () => {
    const playbook = buildNextRunPlaybook([episode({ id: "a" })]);
    expect(playbook.isEmpty).toBe(true);
  });

  it("non-grower-recorded outcomes are excluded (never inferred from AI/sensor)", () => {
    const playbook = buildNextRunPlaybook([
      episode({ id: "a", outcome: "improved", outcomeRecordedBy: "ai" }),
    ]);
    expect(playbook.isEmpty).toBe(true);
  });
});

describe("evidence completeness and uncertainty", () => {
  it("every item carries a non-empty uncertainty note", () => {
    const playbook = buildNextRunPlaybook([
      episode({ id: "a", outcome: "improved", decision: "repeat" }),
    ]);
    const item = playbook.groups[0].items[0];
    expect(item.uncertaintyNote.length).toBeGreaterThan(0);
    expect(item.uncertaintyNote).toMatch(/other factors may have contributed|evidence is limited/i);
  });

  it("no confidence percentage or effectiveness score appears anywhere in output", () => {
    const playbook = buildNextRunPlaybook([
      episode({ id: "a", outcome: "improved", decision: "repeat" }),
    ]);
    const text = JSON.stringify(playbook);
    expect(text).not.toMatch(/%\s*(confidence|effective|success)/i);
    expect(text).not.toMatch(/effectiveness score|success rate|win rate/i);
  });
});

describe("deterministic sorting and grouping", () => {
  it("groupPlaybookItemsByCategory omits empty categories and preserves category order", () => {
    const playbook = buildNextRunPlaybook([
      episode({ id: "a", targetMetric: "ec", outcome: "improved", decision: "repeat" }),
      episode({ id: "b", targetMetric: "humidity", outcome: "improved", decision: "repeat" }),
    ]);
    const repeat = playbook.groups.find((g) => g.section === "repeat")!;
    const byCategory = groupPlaybookItemsByCategory(repeat.items);
    expect(byCategory.map((g) => g.category)).toEqual(["environment", "nutrition"]);
  });

  it("items within a section sort by most-recent decision first, then episodeKey", () => {
    const playbook = buildNextRunPlaybook([
      episode({ id: "a", outcome: "improved", decision: "repeat" }),
      episode({ id: "b", outcome: "improved", decision: "repeat" }),
    ]);
    const repeat = playbook.groups.find((g) => g.section === "repeat")!;
    expect(repeat.items).toHaveLength(2);
    // Same recordedAt in this fixture -> tiebreak by episodeKey ascending.
    expect(repeat.items.map((i) => i.episodeKey)).toEqual([
      "episode:a",
      "episode:b",
    ]);
  });

  it("null-safe: empty episode list produces an empty playbook", () => {
    const playbook = buildNextRunPlaybook([]);
    expect(playbook.isEmpty).toBe(true);
    expect(playbook.groups).toHaveLength(0);
  });
});
