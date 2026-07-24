/**
 * Unit tests for aiDoctorSessionLedgerViewModel — pure, deterministic
 * mapping from ai_doctor_sessions metadata rows to the ledger view.
 */
import { describe, it, expect } from "vitest";
import {
  buildAiDoctorSessionLedgerViewModel,
  sortLedgerRows,
  formatLedgerTimestamp,
  truncateId,
  humanizeReasonCode,
  UNKNOWN_TIMESTAMP_LABEL,
  type AiDoctorLedgerSessionRow,
  type AiDoctorLedgerScopeLabelMaps,
} from "@/lib/aiDoctorSessionLedgerViewModel";

function row(overrides: Partial<AiDoctorLedgerSessionRow> = {}): AiDoctorLedgerSessionRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-07-01T12:00:00.000Z",
    grow_id: null,
    tent_id: null,
    plant_id: null,
    sensor_snapshot_status: null,
    sensor_snapshot_reason_code: null,
    counts_as_healthy_evidence: null,
    sensor_evidence_mode: null,
    sensor_evidence_evaluated_at: null,
    ...overrides,
  };
}

const GROW_ID = "10000000-0000-0000-0000-000000000001";
const TENT_ID = "20000000-0000-0000-0000-000000000001";
const PLANT_ID = "30000000-0000-0000-0000-000000000001";
const ARCHIVED_GROW_ID = "10000000-0000-0000-0000-000000000099";

const MAPS: AiDoctorLedgerScopeLabelMaps = {
  growNameById: new Map([[GROW_ID, "Flower Grow"]]),
  tentNameById: new Map([[TENT_ID, "Flower Tent"]]),
  plantNameById: new Map([[PLANT_ID, "Plant #7"]]),
};

describe("buildAiDoctorSessionLedgerViewModel — fully scoped valid session", () => {
  it("resolves grow/tent/plant names and a healthy evidence badge", () => {
    const [entry] = buildAiDoctorSessionLedgerViewModel(
      [
        row({
          grow_id: GROW_ID,
          tent_id: TENT_ID,
          plant_id: PLANT_ID,
          sensor_snapshot_status: "usable",
          sensor_snapshot_reason_code: "recent_reading",
          counts_as_healthy_evidence: true,
          sensor_evidence_mode: "healthy",
          sensor_evidence_evaluated_at: "2026-07-01T11:59:00.000Z",
        }),
      ],
      MAPS,
    );
    expect(entry.grow).toEqual({ id: GROW_ID, label: "Flower Grow", archivedOrUnavailable: false });
    expect(entry.tent).toEqual({ id: TENT_ID, label: "Flower Tent", archivedOrUnavailable: false });
    expect(entry.plant).toEqual({ id: PLANT_ID, label: "Plant #7", archivedOrUnavailable: false });
    expect(entry.isPlantless).toBe(false);
    expect(entry.evidence.tone).toBe("healthy");
    expect(entry.evidence.isLegacy).toBe(false);
    expect(entry.evidence.countsAsHealthy).toBe(true);
    expect(entry.evidence.reasonLabel).toBe("Recent reading");
    expect(entry.evidence.evaluatedAtDisplay).not.toBeNull();
    expect(entry.hasValidTimestamp).toBe(true);
  });
});

describe("buildAiDoctorSessionLedgerViewModel — legitimate plantless scope", () => {
  it("tent/grow-scoped session with no plant_id is NOT invalid — plant shows '—', not archived", () => {
    const [entry] = buildAiDoctorSessionLedgerViewModel(
      [row({ grow_id: GROW_ID, tent_id: TENT_ID, plant_id: null })],
      MAPS,
    );
    expect(entry.plant.id).toBeNull();
    expect(entry.plant.label).toBe("—");
    expect(entry.plant.archivedOrUnavailable).toBe(false);
    expect(entry.isPlantless).toBe(true);
    // Grow/tent still resolve normally — this is a valid scoped session.
    expect(entry.grow.label).toBe("Flower Grow");
    expect(entry.tent.label).toBe("Flower Tent");
  });

  it("grow-only session (no tent, no plant) is equally valid", () => {
    const [entry] = buildAiDoctorSessionLedgerViewModel(
      [row({ grow_id: GROW_ID, tent_id: null, plant_id: null })],
      MAPS,
    );
    expect(entry.grow.label).toBe("Flower Grow");
    expect(entry.tent).toEqual({ id: null, label: "—", archivedOrUnavailable: false });
    expect(entry.plant).toEqual({ id: null, label: "—", archivedOrUnavailable: false });
    expect(entry.isPlantless).toBe(true);
  });
});

describe("buildAiDoctorSessionLedgerViewModel — archived or unresolved references", () => {
  it("an id present but absent from the name map renders 'Archived or unavailable', never an invented name", () => {
    const [entry] = buildAiDoctorSessionLedgerViewModel([row({ grow_id: ARCHIVED_GROW_ID })], MAPS);
    expect(entry.grow.id).toBe(ARCHIVED_GROW_ID);
    expect(entry.grow.label).toBe("Archived or unavailable");
    expect(entry.grow.archivedOrUnavailable).toBe(true);
  });

  it("distinguishes archived/unavailable (id present, unresolved) from plantless (no id at all)", () => {
    const [entry] = buildAiDoctorSessionLedgerViewModel(
      [row({ grow_id: ARCHIVED_GROW_ID, plant_id: null })],
      MAPS,
    );
    expect(entry.grow.archivedOrUnavailable).toBe(true);
    expect(entry.plant.archivedOrUnavailable).toBe(false); // no id -> not "unavailable", just N/A
  });

  it("works with the default empty label maps (every id unresolved)", () => {
    const [entry] = buildAiDoctorSessionLedgerViewModel([row({ grow_id: GROW_ID })]);
    expect(entry.grow.archivedOrUnavailable).toBe(true);
  });
});

describe("buildAiDoctorSessionLedgerViewModel — legacy / partial sensor-evidence fields", () => {
  it("a row with no sensor_evidence_mode is 'legacy', not falsely healthy/missing", () => {
    const [entry] = buildAiDoctorSessionLedgerViewModel([row({ sensor_evidence_mode: null })]);
    expect(entry.evidence.tone).toBe("legacy");
    expect(entry.evidence.isLegacy).toBe(true);
    expect(entry.evidence.label).toMatch(/legacy/i);
  });

  it("an unrecognized future sensor_evidence_mode value falls back to legacy, never invents a positive claim", () => {
    const [entry] = buildAiDoctorSessionLedgerViewModel([
      row({ sensor_evidence_mode: "some-future-value" }),
    ]);
    expect(entry.evidence.tone).toBe("legacy");
  });

  it("partial data survives independently: a legacy row that still carries a reason code shows it", () => {
    const [entry] = buildAiDoctorSessionLedgerViewModel([
      row({ sensor_evidence_mode: null, sensor_snapshot_reason_code: "no_recent_reading" }),
    ]);
    expect(entry.evidence.isLegacy).toBe(true);
    expect(entry.evidence.reasonLabel).toBe("No recent reading");
  });

  it("maps cautionary/unsafe/missing tones with their own labels", () => {
    const entries = buildAiDoctorSessionLedgerViewModel([
      row({ id: "a0000000-0000-0000-0000-000000000001", sensor_evidence_mode: "cautionary" }),
      row({ id: "a0000000-0000-0000-0000-000000000002", sensor_evidence_mode: "unsafe" }),
      row({ id: "a0000000-0000-0000-0000-000000000003", sensor_evidence_mode: "missing" }),
    ]);
    const byId = new Map(entries.map((e) => [e.id, e]));
    expect(byId.get("a0000000-0000-0000-0000-000000000001")!.evidence.tone).toBe("cautionary");
    expect(byId.get("a0000000-0000-0000-0000-000000000002")!.evidence.tone).toBe("unsafe");
    expect(byId.get("a0000000-0000-0000-0000-000000000003")!.evidence.tone).toBe("missing");
  });

  it("counts_as_healthy_evidence is surfaced only when it is an actual boolean", () => {
    const [legacyEntry] = buildAiDoctorSessionLedgerViewModel([
      row({ counts_as_healthy_evidence: null }),
    ]);
    expect(legacyEntry.evidence.countsAsHealthy).toBeNull();
    const [falseEntry] = buildAiDoctorSessionLedgerViewModel([
      row({ sensor_evidence_mode: "unsafe", counts_as_healthy_evidence: false }),
    ]);
    expect(falseEntry.evidence.countsAsHealthy).toBe(false);
  });
});

describe("buildAiDoctorSessionLedgerViewModel — invalid/missing timestamps", () => {
  it("null created_at falls back to a safe label and hasValidTimestamp=false", () => {
    const [entry] = buildAiDoctorSessionLedgerViewModel([row({ created_at: null })]);
    expect(entry.timestampDisplay).toBe(UNKNOWN_TIMESTAMP_LABEL);
    expect(entry.hasValidTimestamp).toBe(false);
  });

  it("garbage created_at string falls back safely without throwing", () => {
    expect(() =>
      buildAiDoctorSessionLedgerViewModel([row({ created_at: "not-a-real-timestamp" })]),
    ).not.toThrow();
    const [entry] = buildAiDoctorSessionLedgerViewModel([
      row({ created_at: "not-a-real-timestamp" }),
    ]);
    expect(entry.hasValidTimestamp).toBe(false);
    expect(entry.timestampDisplay).toBe(UNKNOWN_TIMESTAMP_LABEL);
  });

  it("empty-string created_at is treated as missing, not a valid epoch-0 date", () => {
    const [entry] = buildAiDoctorSessionLedgerViewModel([row({ created_at: "" })]);
    expect(entry.hasValidTimestamp).toBe(false);
  });

  it("formatLedgerTimestamp is directly null-safe", () => {
    expect(formatLedgerTimestamp(undefined).isValid).toBe(false);
    expect(formatLedgerTimestamp(null).isValid).toBe(false);
    expect(formatLedgerTimestamp("2026-01-01T00:00:00.000Z").isValid).toBe(true);
  });
});

describe("sortLedgerRows / buildAiDoctorSessionLedgerViewModel — deterministic sorting", () => {
  it("sorts newest first", () => {
    const rows = [
      row({ id: "id-old", created_at: "2026-01-01T00:00:00.000Z" }),
      row({ id: "id-new", created_at: "2026-06-01T00:00:00.000Z" }),
      row({ id: "id-mid", created_at: "2026-03-01T00:00:00.000Z" }),
    ];
    const sorted = sortLedgerRows(rows);
    expect(sorted.map((r) => r.id)).toEqual(["id-new", "id-mid", "id-old"]);
  });

  it("breaks ties on identical timestamps using the id, deterministically", () => {
    const rows = [
      row({ id: "b-session", created_at: "2026-01-01T00:00:00.000Z" }),
      row({ id: "a-session", created_at: "2026-01-01T00:00:00.000Z" }),
    ];
    const sorted = sortLedgerRows(rows);
    expect(sorted.map((r) => r.id)).toEqual(["a-session", "b-session"]);
  });

  it("rows with invalid/missing timestamps always sort after valid ones, and tie-break by id among themselves", () => {
    const rows = [
      row({ id: "z-invalid", created_at: null }),
      row({ id: "valid-one", created_at: "2026-01-01T00:00:00.000Z" }),
      row({ id: "a-invalid", created_at: "garbage" }),
    ];
    const sorted = sortLedgerRows(rows);
    expect(sorted.map((r) => r.id)).toEqual(["valid-one", "a-invalid", "z-invalid"]);
  });

  it("sorting is stable/idempotent across repeated calls with the same input", () => {
    const rows = [
      row({ id: "x", created_at: "2026-05-01T00:00:00.000Z" }),
      row({ id: "y", created_at: "2026-05-02T00:00:00.000Z" }),
    ];
    const first = sortLedgerRows(rows).map((r) => r.id);
    const second = sortLedgerRows(rows).map((r) => r.id);
    expect(second).toEqual(first);
  });

  it("does not mutate the input array", () => {
    const rows = [
      row({ id: "x", created_at: "2026-05-01T00:00:00.000Z" }),
      row({ id: "y", created_at: "2026-05-02T00:00:00.000Z" }),
    ];
    const snapshot = rows.map((r) => r.id);
    sortLedgerRows(rows);
    expect(rows.map((r) => r.id)).toEqual(snapshot);
  });
});

describe("truncateId", () => {
  it("truncates long ids to the default visible length with an ellipsis", () => {
    const id = "12345678-abcd-ef01-2345-6789abcdef01";
    expect(truncateId(id)).toBe("12345678…");
  });
  it("returns short ids unchanged", () => {
    expect(truncateId("short")).toBe("short");
  });
  it("is null-safe", () => {
    expect(truncateId(null)).toBe("—");
    expect(truncateId(undefined)).toBe("—");
    expect(truncateId("")).toBe("—");
  });
  it("supports a custom visible-length", () => {
    expect(truncateId("abcdefghij", 4)).toBe("abcd…");
  });
});

describe("humanizeReasonCode", () => {
  it("converts snake_case to calm capitalized copy", () => {
    expect(humanizeReasonCode("no_recent_reading")).toBe("No recent reading");
  });
  it("handles kebab-case too", () => {
    expect(humanizeReasonCode("stale-snapshot")).toBe("Stale snapshot");
  });
  it("is null-safe", () => {
    expect(humanizeReasonCode(null)).toBeNull();
    expect(humanizeReasonCode(undefined)).toBeNull();
    expect(humanizeReasonCode("")).toBeNull();
    expect(humanizeReasonCode("   ")).toBeNull();
  });
});

describe("buildAiDoctorSessionLedgerViewModel — never marks a session invalid", () => {
  it("no entry ever carries an 'invalid' or 'isValid' verdict field of any kind", () => {
    const [entry] = buildAiDoctorSessionLedgerViewModel([row({ plant_id: null })]);
    const keys = JSON.stringify(entry).toLowerCase();
    expect(keys).not.toContain('"invalid"');
    expect(keys).not.toContain("isvalidsession");
  });
});
