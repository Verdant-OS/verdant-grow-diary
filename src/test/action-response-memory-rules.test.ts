/**
 * Milestone 5 — canonical Action Response Memory pure rules.
 *
 * Covers: full evidence, no optional evidence, every outcome, missing action
 * id/relationship, non-completed action, invalid outcome, invalid timestamps,
 * stable sorting + ties, deterministic dedup, contradictory duplicates,
 * legacy marker rows, grow/tent/plant mismatch, exact-plant acceptance,
 * tent/grow-level exclusion from Plant Detail, and determinism.
 */
import { describe, expect, it } from "vitest";
import {
  ACTION_RESPONSE_MEMORY_HISTORICAL_COPY,
  ACTION_RESPONSE_MEMORY_RECORDED_COPY,
  buildActionResponseMemories,
  collectActionResponseCandidateRows,
  isActionResponseCandidateDetails,
  selectRecentPlantActionResponse,
  type ActionResponseActionRowInput,
  type ActionResponseDiaryRowInput,
} from "../lib/actionResponseMemoryRules";
import { ACTION_FOLLOWUP_OUTCOMES } from "../lib/actionFollowUpEvidenceRules";
import { actionFollowUpOutcomeLabel } from "../lib/actionFollowUpEvidenceViewModel";

const T0 = "2026-07-01T12:00:00Z";
const PHYSICAL_WINDOWS_PAYLOAD = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    reported_verdant_source: "live",
    raw_payload: {
      stationtype: "GW2000A_V3.2.4",
      model: "GW2000A",
      dateutc: "2026-07-02 11:00:00",
    },
  },
};

function action(over: Partial<ActionResponseActionRowInput> = {}): ActionResponseActionRowInput {
  return {
    id: "act-1",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    status: "completed",
    suggested_change: "Lower humidity slightly overnight",
    completed_at: T0,
    ...over,
  };
}

function responseRow(
  over: Partial<ActionResponseDiaryRowInput> & {
    detailsOver?: Record<string, unknown>;
  } = {},
): ActionResponseDiaryRowInput {
  const { detailsOver, ...rest } = over;
  return {
    id: "row-1",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    entry_at: "2026-07-02T13:00:00Z",
    details: {
      event_type: "action_followup",
      action_queue_id: "act-1",
      outcome: "improved",
      observed_at: "2026-07-02T12:00:00Z",
      note: "Leaves perked up overnight.",
      photo_reference: null,
      sensor_snapshot_id: null,
      idempotency_key: "action-followup:act-1",
      ...detailsOver,
    },
    ...rest,
  };
}

describe("candidate detection", () => {
  it("accepts an explicit grower response and rejects marker/legacy rows", () => {
    expect(isActionResponseCandidateDetails(responseRow().details)).toBe(true);
    // Auto marker: same event type, no outcome key.
    expect(
      isActionResponseCandidateDetails({
        event_type: "action_followup",
        action_queue_id: "act-1",
        followup_kind: "24h_recheck",
      }),
    ).toBe(false);
    expect(isActionResponseCandidateDetails(null)).toBe(false);
    expect(isActionResponseCandidateDetails({ event_type: "action_outcome" })).toBe(false);
  });

  it("collect filters null-safely", () => {
    expect(collectActionResponseCandidateRows(null)).toEqual([]);
    expect(collectActionResponseCandidateRows([responseRow()])).toHaveLength(1);
  });
});

describe("buildActionResponseMemories — happy paths", () => {
  it("1. complete action + outcome + note + photo + sensor", () => {
    const memories = buildActionResponseMemories({
      responseRows: [
        responseRow({
          detailsOver: {
            photo_reference: "storage://diary-photos/u1/g1/plant-profiles/p1/a.jpg",
            sensor_snapshot_id: "snap-1",
          },
        }),
      ],
      actions: [action()],
      sensorRows: [
        { id: "snap-1", tent_id: "tent-1", source: "manual", captured_at: "2026-07-02T11:00:00Z" },
      ],
    });
    expect(memories).toHaveLength(1);
    const m = memories[0];
    expect(m.actionId).toBe("act-1");
    expect(m.response.outcome).toBe("improved");
    expect(m.response.outcomeLabel).toBe("Improved");
    expect(m.response.note).toBe("Leaves perked up overnight.");
    expect(m.photo.state).toBe("available");
    expect(m.sensor.state).toBe("available");
    expect(m.sensor.trustState).toBe("manual");
    expect(m.historicalOnly).toBe(true);
    expect(m.limitations).toEqual([]);
    expect(m.scope.level).toBe("plant");
  });

  it("2. outcome with no optional evidence keeps outcome and note visible states", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow({ detailsOver: { note: undefined } })],
      actions: [action()],
      sensorRows: [],
    });
    expect(memories).toHaveLength(1);
    expect(memories[0].photo.state).toBe("none");
    expect(memories[0].sensor.state).toBe("none");
    expect(memories[0].response.note).toBeNull();
    expect(memories[0].response.outcome).toBe("improved");
  });

  it("3. every allowed outcome maps through the centralized label mapping", () => {
    for (const outcome of ACTION_FOLLOWUP_OUTCOMES) {
      const memories = buildActionResponseMemories({
        responseRows: [responseRow({ detailsOver: { outcome } })],
        actions: [action()],
        sensorRows: [],
      });
      expect(memories).toHaveLength(1);
      expect(memories[0].response.outcome).toBe(outcome);
      expect(memories[0].response.outcomeLabel).toBe(actionFollowUpOutcomeLabel(outcome));
    }
  });
});

describe("buildActionResponseMemories — rejection rules", () => {
  it("4. missing action id on the row → no memory", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow({ detailsOver: { action_queue_id: undefined } })],
      actions: [action()],
      sensorRows: [],
    });
    expect(memories).toEqual([]);
  });

  it("5. missing authoritative relationship (no matching action row) → no memory", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow()],
      actions: [action({ id: "some-other-action" })],
      sensorRows: [],
    });
    expect(memories).toEqual([]);
  });

  it("6. non-completed action → no memory", () => {
    for (const status of ["pending", "approved", "rejected", "cancelled", null]) {
      const memories = buildActionResponseMemories({
        responseRows: [responseRow()],
        actions: [action({ status })],
        sensorRows: [],
      });
      expect(memories).toEqual([]);
    }
  });

  it("7. invalid outcome → not a canonical response", () => {
    for (const outcome of ["worsened", "better", "", 42, null, undefined]) {
      const memories = buildActionResponseMemories({
        responseRows: [responseRow({ detailsOver: { outcome } })],
        actions: [action()],
        sensorRows: [],
      });
      expect(memories).toEqual([]);
    }
  });

  it("8. invalid timestamps fail closed", () => {
    const memories = buildActionResponseMemories({
      responseRows: [
        responseRow({
          entry_at: "not-a-date",
          detailsOver: { observed_at: "also-not-a-date" },
        }),
      ],
      actions: [action()],
      sensorRows: [],
    });
    expect(memories).toEqual([]);
  });

  it("8b. invalid observed_at falls back to a valid entry_at", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow({ detailsOver: { observed_at: "garbage" } })],
      actions: [action()],
      sensorRows: [],
    });
    expect(memories).toHaveLength(1);
    expect(memories[0].response.recordedAt).toBe("2026-07-02T13:00:00Z");
  });
});

describe("ordering, dedup, duplicates", () => {
  it("9. stable ordering: recordedAt desc → actionId asc → rowId asc", () => {
    const rows = [
      responseRow({
        id: "row-b",
        detailsOver: { action_queue_id: "act-2", observed_at: "2026-07-03T10:00:00Z" },
      }),
      responseRow({
        id: "row-a",
        detailsOver: { action_queue_id: "act-1", observed_at: "2026-07-03T10:00:00Z" },
      }),
      responseRow({
        id: "row-c",
        detailsOver: { action_queue_id: "act-3", observed_at: "2026-07-04T10:00:00Z" },
      }),
    ];
    const actions = [action({ id: "act-1" }), action({ id: "act-2" }), action({ id: "act-3" })];
    const memories = buildActionResponseMemories({ responseRows: rows, actions, sensorRows: [] });
    expect(memories.map((m) => m.actionId)).toEqual(["act-3", "act-1", "act-2"]);
  });

  it("10. deterministic deduplication — earliest row id wins", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow({ id: "row-2" }), responseRow({ id: "row-1" })],
      actions: [action()],
      sensorRows: [],
    });
    expect(memories).toHaveLength(1);
    expect(memories[0].response.rowId).toBe("row-1");
    expect(memories[0].limitations).toContain("duplicate_response_rows");
    expect(memories[0].limitations).not.toContain("duplicate_conflicting_outcomes");
  });

  it("11. duplicate contradictory outcomes are flagged, never merged", () => {
    const memories = buildActionResponseMemories({
      responseRows: [
        responseRow({ id: "row-1", detailsOver: { outcome: "improved" } }),
        responseRow({ id: "row-2", detailsOver: { outcome: "declined" } }),
      ],
      actions: [action()],
      sensorRows: [],
    });
    expect(memories).toHaveLength(1);
    // Selected deterministically (earliest id), conflict flagged internally.
    expect(memories[0].response.outcome).toBe("improved");
    expect(memories[0].limitations).toContain("duplicate_conflicting_outcomes");
  });

  it("12. legacy rows missing Slice 4c fields stay out of canonical memory", () => {
    const marker: ActionResponseDiaryRowInput = {
      id: "marker-1",
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      entry_at: T0,
      details: {
        event_type: "action_followup",
        action_queue_id: "act-1",
        source_alert_id: null,
        followup_kind: "24h_recheck",
        completed_at: T0,
      },
    };
    const memories = buildActionResponseMemories({
      responseRows: [marker],
      actions: [action()],
      sensorRows: [],
    });
    expect(memories).toEqual([]);
  });
});

describe("scope validation — reject, never broaden", () => {
  it("13. grow mismatch rejects the row", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow({ grow_id: "grow-OTHER" })],
      actions: [action()],
      sensorRows: [],
    });
    expect(memories).toEqual([]);
  });

  it("14. tent mismatch rejects the row", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow({ tent_id: "tent-OTHER" })],
      actions: [action()],
      sensorRows: [],
    });
    expect(memories).toEqual([]);
  });

  it("15. plant mismatch rejects the row", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow({ plant_id: "plant-OTHER" })],
      actions: [action()],
      sensorRows: [],
    });
    expect(memories).toEqual([]);
  });
});

describe("Plant Detail selection — hard exact-plant scope", () => {
  it("16. exact-plant response is accepted", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow()],
      actions: [action()],
      sensorRows: [],
    });
    const selected = selectRecentPlantActionResponse(memories, "plant-1");
    expect(selected).not.toBeNull();
    expect(selected!.scope.plantId).toBe("plant-1");
  });

  it("17. tent-level and grow-level actions never appear on a plant", () => {
    const tentLevel = buildActionResponseMemories({
      responseRows: [responseRow({ plant_id: null })],
      actions: [action({ plant_id: null })],
      sensorRows: [],
    });
    expect(tentLevel).toHaveLength(1);
    expect(tentLevel[0].scope.level).toBe("tent");
    expect(selectRecentPlantActionResponse(tentLevel, "plant-1")).toBeNull();

    const growLevel = buildActionResponseMemories({
      responseRows: [responseRow({ plant_id: null, tent_id: null })],
      actions: [action({ plant_id: null, tent_id: null })],
      sensorRows: [],
    });
    expect(growLevel).toHaveLength(1);
    expect(growLevel[0].scope.level).toBe("grow");
    expect(selectRecentPlantActionResponse(growLevel, "plant-1")).toBeNull();

    // Wrong plant is excluded too.
    const other = buildActionResponseMemories({
      responseRows: [responseRow()],
      actions: [action()],
      sensorRows: [],
    });
    expect(selectRecentPlantActionResponse(other, "plant-OTHER")).toBeNull();
  });
});

describe("determinism and truth boundary", () => {
  it("18. identical input produces byte-equivalent output", () => {
    const input = {
      responseRows: [
        responseRow({ detailsOver: { sensor_snapshot_id: "snap-1" } }),
        responseRow({ id: "row-9", detailsOver: { action_queue_id: "act-2" } }),
      ],
      actions: [action(), action({ id: "act-2" })],
      sensorRows: [
        {
          id: "snap-1",
          tent_id: "tent-1",
          source: "live",
          quality: "ok",
          captured_at: "2026-07-02T11:00:00Z",
        },
      ],
    };
    const a = buildActionResponseMemories(input);
    const b = buildActionResponseMemories(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("sensor truth: demo/stale/invalid/unknown never become trusted", () => {
    const cases: Array<[string, string]> = [
      ["demo", "demo"],
      ["stale", "stale"],
      ["invalid", "invalid"],
      ["mystery-vendor", "unknown"],
      ["", "invalid"],
    ];
    for (const [source, expected] of cases) {
      const memories = buildActionResponseMemories({
        responseRows: [responseRow({ detailsOver: { sensor_snapshot_id: "snap-1" } })],
        actions: [action()],
        sensorRows: [
          { id: "snap-1", tent_id: "tent-1", source, captured_at: "2026-07-02T11:00:00Z" },
        ],
      });
      expect(memories[0].sensor.trustState).toBe(expected);
      expect(memories[0].sensor.trustState).not.toBe("trusted");
    }
    // A literal live source also needs persisted quality proof.
    const live = buildActionResponseMemories({
      responseRows: [responseRow({ detailsOver: { sensor_snapshot_id: "snap-1" } })],
      actions: [action()],
      sensorRows: [
        {
          id: "snap-1",
          tent_id: "tent-1",
          source: "live",
          quality: "ok",
          captured_at: "2026-07-02T11:00:00Z",
        },
      ],
    });
    expect(live[0].sensor.trustState).toBe("trusted");
  });

  it("canonical-live Windows diagnostics remain demo-backed, never trusted", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow({ detailsOver: { sensor_snapshot_id: "snap-1" } })],
      actions: [action()],
      sensorRows: [
        {
          id: "snap-1",
          tent_id: "tent-1",
          source: "live",
          quality: "ok",
          captured_at: "2026-07-02T11:00:00Z",
          raw_payload: {
            vendor: "ecowitt_windows_testbench",
            metadata: { confidence: "test", verdant_source: "live" },
          },
        },
      ],
    });
    expect(memories[0].sensor.trustState).toBe("demo");
  });

  it("legacy top-level Windows source rows missing provenance fail closed", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow({ detailsOver: { sensor_snapshot_id: "snap-1" } })],
      actions: [action()],
      sensorRows: [
        {
          id: "snap-1",
          tent_id: "tent-1",
          source: "ecowitt_windows_testbench",
          captured_at: "2026-07-02T11:00:00Z",
          raw_payload: null,
        },
      ],
    });
    expect(memories[0].sensor.trustState).toBe("demo");
  });

  it("physical Windows gateway evidence remains trusted", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow({ detailsOver: { sensor_snapshot_id: "snap-1" } })],
      actions: [action()],
      sensorRows: [
        {
          id: "snap-1",
          tent_id: "tent-1",
          source: "live",
          quality: "ok",
          captured_at: "2026-07-02T11:00:00Z",
          raw_payload: PHYSICAL_WINDOWS_PAYLOAD,
        },
      ],
    });
    expect(memories[0].sensor.trustState).toBe("trusted");
  });

  it("source-only live action evidence stays unknown", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow({ detailsOver: { sensor_snapshot_id: "snap-1" } })],
      actions: [action()],
      sensorRows: [
        {
          id: "snap-1",
          tent_id: "tent-1",
          source: "live",
          captured_at: "2026-07-02T11:00:00Z",
        },
      ],
    });
    expect(memories[0].sensor.trustState).toBe("unknown");
  });

  it("sensor with unparseable captured_at is invalid regardless of source", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow({ detailsOver: { sensor_snapshot_id: "snap-1" } })],
      actions: [action()],
      sensorRows: [{ id: "snap-1", tent_id: "tent-1", source: "live", captured_at: "garbage" }],
    });
    expect(memories[0].sensor.trustState).toBe("invalid");
    expect(memories[0].sensor.capturedAt).toBeNull();
  });

  it("missing sensor row → unavailable without hiding outcome or note", () => {
    const memories = buildActionResponseMemories({
      responseRows: [responseRow({ detailsOver: { sensor_snapshot_id: "snap-missing" } })],
      actions: [action()],
      sensorRows: [],
    });
    expect(memories[0].sensor.state).toBe("unavailable");
    expect(memories[0].response.outcome).toBe("improved");
    expect(memories[0].response.note).toBe("Leaves perked up overnight.");
  });

  it("malformed photo reference → unavailable; outcome and note remain", () => {
    const memories = buildActionResponseMemories({
      responseRows: [
        responseRow({ detailsOver: { photo_reference: "https://x.test/signed?token=abc" } }),
      ],
      actions: [action()],
      sensorRows: [],
    });
    expect(memories[0].photo.state).toBe("unavailable");
    expect(memories[0].response.outcome).toBe("improved");
    expect(memories[0].response.note).toBe("Leaves perked up overnight.");
  });

  it("shared copy never implies causation", () => {
    const copy = `${ACTION_RESPONSE_MEMORY_RECORDED_COPY} ${ACTION_RESPONSE_MEMORY_HISTORICAL_COPY}`;
    expect(copy).not.toMatch(
      /\bworked\b|\bfixed\b|\bcured\b|\bproved\b|\bcaused\b|successful treatment|confirmed resolution/i,
    );
  });
});
