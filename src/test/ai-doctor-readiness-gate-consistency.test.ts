/**
 * Targeted: end-to-end consistency of the readiness gate for
 * partial-evidence and stale-snapshot inputs.
 *
 * Verifies that `evaluateAiDoctorContext` + `buildAiDoctorReadinessGate`,
 * chained together, always produce a coherent (readiness, primary.kind,
 * showQuickActions) triple across every meaningful partial variant:
 *
 *   readiness   safe flow  → primary.kind      showQuickActions
 *   partial     true       → open_ai_doctor    true
 *   partial     false      → focus_anchor      true
 *   strong      true       → open_ai_doctor    false
 *   strong      false      → focus_anchor      false
 *   insufficient any       → focus_anchor      true
 *
 * Stale snapshots (older than the 48h freshness window) must never
 * upgrade readiness to "strong" and must never hide quick actions.
 *
 * Pure: no React, no I/O.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateAiDoctorContext,
  AI_DOCTOR_SNAPSHOT_FRESH_MS,
} from "@/lib/aiDoctorContextRules";
import {
  buildAiDoctorReadinessGate,
  AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL,
  AI_DOCTOR_READINESS_GATE_REVIEW_LABEL,
} from "@/lib/aiDoctorReadinessGateViewModel";

const NOW = Date.UTC(2026, 6, 20, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const plant = {
  hasProfile: true,
  strain: "Blueberry",
  stage: "veg",
  medium: "Coco",
  hasPlantPhoto: true,
} as const;

/** Runs the full chain: rules → gate. */
function gateFor(
  input: Parameters<typeof evaluateAiDoctorContext>[0],
  hasSafeAiDoctorFlow: boolean,
) {
  const result = evaluateAiDoctorContext(input);
  const gate = buildAiDoctorReadinessGate({
    readiness: result.readiness,
    hasSafeAiDoctorFlow,
  });
  return { result, gate };
}

// ---------------------------------------------------------------------------
// Partial-evidence variants
// ---------------------------------------------------------------------------

/** Each variant intentionally hits "partial" via a different missing piece. */
const PARTIAL_VARIANTS: ReadonlyArray<{
  label: string;
  input: Parameters<typeof evaluateAiDoctorContext>[0];
}> = [
  {
    label: "activity present, no snapshot",
    input: {
      plant,
      recentEvents: [
        { at: iso(-HOUR), category: "watering" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [],
      now: NOW,
    },
  },
  {
    label: "snapshot present, no timeline activity",
    input: {
      plant,
      recentEvents: [],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" }],
      now: NOW,
    },
  },
  {
    label: "activity + stale snapshot (older than 48h)",
    input: {
      plant,
      recentEvents: [
        { at: iso(-HOUR), category: "watering" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [
        { at: iso(-(AI_DOCTOR_SNAPSHOT_FRESH_MS + HOUR)), severity: "ok" },
      ],
      now: NOW,
    },
  },
  {
    label: "activity + fresh snapshot but no photo and no watering/feeding",
    input: {
      plant: { ...plant, hasPlantPhoto: false },
      recentEvents: [
        { at: iso(-HOUR), category: "notes" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" }],
      now: NOW,
    },
  },
  {
    label: "activity + fresh snapshot but stage missing",
    input: {
      plant: { ...plant, stage: null },
      recentEvents: [
        { at: iso(-HOUR), category: "watering" },
        { at: iso(-2 * HOUR), category: "notes" },
      ],
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" }],
      now: NOW,
    },
  },
];

describe("gate consistency: partial evidence", () => {
  for (const v of PARTIAL_VARIANTS) {
    it(`partial (${v.label}) → open_ai_doctor when safe flow wired, quick actions ON`, () => {
      const { result, gate } = gateFor(v.input, true);
      expect(result.readiness).toBe("partial");
      expect(gate.primary.kind).toBe("open_ai_doctor");
      expect(gate.primary.label).toBe(AI_DOCTOR_READINESS_GATE_REVIEW_LABEL);
      expect(gate.showQuickActions).toBe(true);
    });

    it(`partial (${v.label}) → focus_anchor when no safe flow, quick actions ON`, () => {
      const { result, gate } = gateFor(v.input, false);
      expect(result.readiness).toBe("partial");
      expect(gate.primary.kind).toBe("focus_anchor");
      expect(gate.primary.label).toBe(AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL);
      expect(gate.showQuickActions).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Stale-snapshot invariants
// ---------------------------------------------------------------------------

describe("gate consistency: stale snapshots never mask readiness", () => {
  const stalePlusActivity = {
    plant,
    recentEvents: [
      { at: iso(-HOUR), category: "watering" as const },
      { at: iso(-2 * HOUR), category: "notes" as const },
    ],
    recentManualSnapshots: [
      { at: iso(-(AI_DOCTOR_SNAPSHOT_FRESH_MS + HOUR)), severity: "ok" as const },
    ],
    now: NOW,
  };

  it("stale-only snapshot with activity stays partial (never strong)", () => {
    const { result } = gateFor(stalePlusActivity, true);
    expect(result.readiness).toBe("partial");
    expect(result.evidence).not.toContain("fresh-manual-sensor-snapshot");
  });

  it("stale snapshot keeps quick actions visible even with safe flow wired", () => {
    const { gate } = gateFor(stalePlusActivity, true);
    expect(gate.showQuickActions).toBe(true);
    expect(gate.primary.kind).toBe("open_ai_doctor");
  });

  it("swapping a stale snapshot for a fresh one flips readiness partial → strong and hides quick actions", () => {
    const fresh = {
      ...stalePlusActivity,
      recentManualSnapshots: [{ at: iso(-HOUR), severity: "ok" as const }],
    };
    const a = gateFor(stalePlusActivity, true);
    const b = gateFor(fresh, true);
    expect(a.result.readiness).toBe("partial");
    expect(a.gate.showQuickActions).toBe(true);
    expect(b.result.readiness).toBe("strong");
    expect(b.gate.showQuickActions).toBe(false);
    // Primary stays open_ai_doctor across the transition when safe flow is on.
    expect(a.gate.primary.kind).toBe("open_ai_doctor");
    expect(b.gate.primary.kind).toBe("open_ai_doctor");
  });

  it("stale snapshot without safe flow keeps focus_anchor + quick actions", () => {
    const { gate } = gateFor(stalePlusActivity, false);
    expect(gate.primary.kind).toBe("focus_anchor");
    expect(gate.showQuickActions).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invariant matrix (fast sanity net across the full triple)
// ---------------------------------------------------------------------------

describe("gate consistency: (readiness, safeFlow) → (primary.kind, showQuickActions) matrix", () => {
  const rows = [
    { readiness: "insufficient" as const, safe: true,  kind: "focus_anchor",  quick: true  },
    { readiness: "insufficient" as const, safe: false, kind: "focus_anchor",  quick: true  },
    { readiness: "partial"      as const, safe: true,  kind: "open_ai_doctor", quick: true  },
    { readiness: "partial"      as const, safe: false, kind: "focus_anchor",   quick: true  },
    { readiness: "strong"       as const, safe: true,  kind: "open_ai_doctor", quick: false },
    { readiness: "strong"       as const, safe: false, kind: "focus_anchor",   quick: false },
  ];
  for (const r of rows) {
    it(`(${r.readiness}, safe=${r.safe}) → ${r.kind}, quickActions=${r.quick}`, () => {
      const g = buildAiDoctorReadinessGate({
        readiness: r.readiness,
        hasSafeAiDoctorFlow: r.safe,
      });
      expect(g.primary.kind).toBe(r.kind);
      expect(g.showQuickActions).toBe(r.quick);
    });
  }
});
