/**
 * Post-Action Outcome Analysis — pure evidence compiler.
 * No Supabase, no network — repo-shaped rows in, bundle out.
 */
import { describe, it, expect } from "vitest";
import {
  analyzeActionOutcomeFromRows,
  compileActionOutcomeEvidenceFromRows,
  normalizeGrowTargets,
  resolvePrimaryFollowUp,
  type CompileActionOutcomeInput,
  type RawActionQueueRow,
  type RawFollowUpEntryRow,
} from "@/lib/actionOutcomeEvidenceCompiler";

const ANALYSIS = "2026-07-11T12:00:00.000Z";

const ACTION: RawActionQueueRow = {
  id: "aq-1",
  status: "completed",
  completed_at: "2026-07-10T12:00:00.000Z",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
  action_type: "environment_adjustment",
  target_metric: "vpd_kpa",
  suggested_change: "Increase airflow",
  reason: "VPD above target",
};

function followUpRow(overrides: Partial<RawFollowUpEntryRow> = {}): RawFollowUpEntryRow {
  return {
    id: "entry-b",
    grow_id: "grow-1",
    details: {
      event_type: "action_followup",
      action_queue_id: "aq-1",
      outcome: "improved",
      observed_at: "2026-07-11T00:00:00.000Z",
      note: "Leaves look better",
    },
    ...overrides,
  };
}

function sensorRow(overrides: Record<string, unknown> = {}) {
  return {
    tent_id: "tent-1",
    metric: "temperature_c",
    value: 30,
    captured_at: "2026-07-10T06:00:00.000Z",
    source: "live",
    quality: "ok",
    ...overrides,
  };
}

function input(overrides: Partial<CompileActionOutcomeInput> = {}): CompileActionOutcomeInput {
  return {
    action: ACTION,
    followUpEntries: [followUpRow()],
    sensorRows: [sensorRow(), sensorRow({ captured_at: "2026-07-10T18:00:00.000Z", value: 26 })],
    diaryRows: [
      {
        event_type: "watering",
        occurred_at: "2026-07-10T14:00:00.000Z",
        note: "Watered after action",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
      },
    ],
    growTargets: {
      grow_id: "grow-1",
      temp_min: 20,
      temp_max: 28,
      rh_min: 40,
      rh_max: 60,
      vpd_min: 0.8,
      vpd_max: 1.6,
      soil_wc_min: null,
      soil_wc_max: null,
      soil_ec_min: null,
      soil_ec_max: null,
      ppfd_min: null,
      ppfd_max: null,
    },
    analysisAt: ANALYSIS,
    ...overrides,
  };
}

describe("action verification", () => {
  it("a completed action compiles", () => {
    const r = compileActionOutcomeEvidenceFromRows(input());
    expect(r.ok).toBe(true);
  });

  it("an incomplete action is blocked", () => {
    const r = compileActionOutcomeEvidenceFromRows(
      input({ action: { ...ACTION, status: "approved" } }),
    );
    expect(r).toEqual({ ok: false, reason: "action_not_completed" });
  });

  it("completed status with null completed_at is blocked (no DB CHECK guarantees it)", () => {
    const r = compileActionOutcomeEvidenceFromRows(
      input({ action: { ...ACTION, completed_at: null } }),
    );
    expect(r).toEqual({ ok: false, reason: "missing_completed_at" });
  });
});

describe("follow-up resolution", () => {
  it("selects the exact action's follow-up and excludes unrelated ones", () => {
    const r = compileActionOutcomeEvidenceFromRows(
      input({
        followUpEntries: [
          followUpRow({
            id: "x",
            details: {
              event_type: "action_followup",
              action_queue_id: "aq-OTHER",
              outcome: "declined",
              observed_at: null,
              note: null,
            },
          }),
          followUpRow(),
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bundle.followUp?.outcome).toBe("improved");
    }
  });

  it("multiple follow-ups reconcile deterministically (earliest lexicographic id wins)", () => {
    const rows = [
      followUpRow({ id: "entry-c", details: { ...followUpRow().details!, outcome: "declined" } }),
      followUpRow({ id: "entry-a", details: { ...followUpRow().details!, outcome: "unchanged" } }),
      followUpRow({ id: "entry-b" }),
    ];
    expect(resolvePrimaryFollowUp(rows, "aq-1")?.id).toBe("entry-a");
    expect(resolvePrimaryFollowUp([...rows].reverse(), "aq-1")?.id).toBe("entry-a");
  });

  it("accepts the normalized extras shape (details.extras.outcome)", () => {
    const r = compileActionOutcomeEvidenceFromRows(
      input({
        followUpEntries: [
          {
            id: "entry-a",
            details: {
              event_type: "action_followup",
              action_queue_id: "aq-1",
              extras: { outcome: "declined", observed_at: "2026-07-11T00:00:00.000Z" },
            },
          },
        ],
      }),
    );
    expect(r.ok && r.bundle.followUp?.outcome).toBe("declined");
  });

  it("missing follow-up is reported as missing information", () => {
    const r = compileActionOutcomeEvidenceFromRows(input({ followUpEntries: [] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bundle.followUp).toBeNull();
      expect(r.bundle.missingInformation.join(" ")).toMatch(/No grower follow-up/);
    }
  });
});

describe("window splitting + scope", () => {
  it("pre/post sensor rows split correctly around completion", () => {
    const r = compileActionOutcomeEvidenceFromRows(input());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bundle.preAction.metrics).toHaveLength(1);
      expect(r.bundle.postAction.metrics).toHaveLength(1);
      expect(r.bundle.preAction.metrics[0].value).toBe(86); // 30°C → 86°F
      expect(r.bundle.postAction.metrics[0].value).toBeCloseTo(78.8, 6); // 26°C → 78.8°F
    }
  });

  it("cross-tent (mismatched) rows supplied by loose mocks are excluded", () => {
    const r = compileActionOutcomeEvidenceFromRows(
      input({ sensorRows: [sensorRow({ tent_id: "someone-elses-tent" })] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bundle.preAction.metrics).toHaveLength(0);
      expect(r.bundle.postAction.metrics).toHaveLength(0);
    }
  });

  it("grow targets normalize (temps converted °C→°F)", () => {
    const targets = normalizeGrowTargets(input().growTargets);
    expect(targets?.bands.temperature_f).toEqual({ min: 68, max: 82.4 });
    expect(targets?.bands.humidity_pct).toEqual({ min: 40, max: 60 });
    expect(targets?.bands.vpd_kpa).toEqual({ min: 0.8, max: 1.6 });
  });

  it("missing targets and missing post evidence are reported", () => {
    const r = compileActionOutcomeEvidenceFromRows(
      input({ growTargets: null, sensorRows: [sensorRow()] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const joined = r.bundle.missingInformation.join(" | ");
      expect(joined).toMatch(/No grow targets/);
      expect(joined).toMatch(/No usable post-action sensor evidence/);
    }
  });

  it("source provenance is preserved through compilation", () => {
    const r = compileActionOutcomeEvidenceFromRows(
      input({
        sensorRows: [
          sensorRow({ source: "manual" }),
          sensorRow({ captured_at: "2026-07-10T18:00:00.000Z", source: "csv", value: 26 }),
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bundle.preAction.metrics[0].source).toBe("manual");
      expect(r.bundle.postAction.metrics[0].source).toBe("csv");
    }
  });

  it("raw payload never enters the bundle", () => {
    const r = compileActionOutcomeEvidenceFromRows(
      input({
        sensorRows: [sensorRow({ raw_payload: { secret: "SECRET-PAYLOAD" } })],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(JSON.stringify(r.bundle)).not.toContain("SECRET-PAYLOAD");
    }
  });

  it("the compiler performs no writes (pure function over frozen input)", () => {
    const frozen = input();
    Object.freeze(frozen);
    Object.freeze(frozen.action);
    Object.freeze(frozen.sensorRows);
    Object.freeze(frozen.followUpEntries);
    expect(() => compileActionOutcomeEvidenceFromRows(frozen)).not.toThrow();
  });
});

describe("end-to-end rows → receipt", () => {
  it("produces a deterministic receipt for the same rows", () => {
    const a = analyzeActionOutcomeFromRows(input());
    const b = analyzeActionOutcomeFromRows(input());
    expect(a.ok).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("demo-only rows produce insufficient evidence and zero confidence", () => {
    const r = analyzeActionOutcomeFromRows(
      input({
        sensorRows: [
          sensorRow({ source: "demo" }),
          sensorRow({ source: "demo", captured_at: "2026-07-10T18:00:00.000Z" }),
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.receipt.classification).toBe("insufficient_evidence");
      expect(r.receipt.confidenceScore).toBe(0);
    }
  });

  it("invalid critical telemetry caps confidence at 50", () => {
    const rows = [
      sensorRow(),
      sensorRow({ captured_at: "2026-07-10T18:00:00.000Z", value: 26 }),
      // 82°C — implausible critical temperature row alongside valid ones
      sensorRow({ captured_at: "2026-07-10T19:00:00.000Z", value: 82 }),
    ];
    const r = analyzeActionOutcomeFromRows(input({ sensorRows: rows }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.receipt.confidenceScore).toBeLessThanOrEqual(50);
  });
});
