import { describe, expect, it } from "vitest";
import {
  buildGgsRealPayloadCommitInput,
  type GgsRealPayloadCommitRow,
} from "@/lib/ggsRealPayloadIngestRules";
import {
  evaluateGgsOperatorAttestedSentinelReadiness,
  selectLatestTrustedGgsOperatorSentinelCohort,
} from "@/lib/ggsOperatorRealPayloadSentinelRules";
import { evaluateGgsSentinelReadiness } from "@/lib/ggsSentinelSmokeRunner";
import { buildGgsSentinelEvaluationPanelViewModel } from "@/lib/ggsSentinelSmokeRunnerViewModel";

const NOW = new Date("2026-07-25T12:00:00.000Z");
const TENT_ID = "33333333-3333-4333-8333-333333333333";

function cohort(deviceId: string, capturedAt: string): GgsRealPayloadCommitRow[] {
  const plan = buildGgsRealPayloadCommitInput(
    {
      timestamp: capturedAt,
      sensor_id: deviceId,
      tent_id: TENT_ID,
      soil_moisture_pct: 42.5,
      soil_temp_c: 22.3,
      soil_ec: 1.6,
    },
    {
      userId: "11111111-1111-4111-8111-111111111111",
      bridgeId: "55555555-5555-4555-8555-555555555555",
      tentId: TENT_ID,
      deviceId,
      operatorAttested: true,
      now: NOW,
    },
  );
  if (plan.ok === false) throw new Error(`expected cohort, got ${plan.reason}`);
  return plan.rows;
}

describe("operator GGS coherent cohort selection", () => {
  it("passes only as operator-attested, never independently verified live", () => {
    const rows = cohort("GGS-PROBE-A", "2026-07-25T11:59:00.000Z");
    const verdict = evaluateGgsOperatorAttestedSentinelReadiness({
      rows,
      snapshot: null,
      now: NOW,
    });

    expect(verdict.state).toBe("PASS_OPERATOR_ATTESTED_SENTINEL_READY");
    expect(verdict.state).not.toBe("PASS_LIVE_SENTINEL_READY");
    expect(verdict.passed).toBe(true);
    expect(rows.every((row) => row.source === "manual")).toBe(true);
    const genericLiveVerdict = evaluateGgsSentinelReadiness({
      rows,
      snapshot: null,
      now: NOW,
    });
    expect(genericLiveVerdict.state).toBe("BLOCKED_SOURCE_NOT_CANONICAL");
    expect(genericLiveVerdict.passed).toBe(false);
    const viewModel = buildGgsSentinelEvaluationPanelViewModel(verdict);
    expect(viewModel.pill.label).toBe("Operator-attested payload · Sentinel ready");
    expect(viewModel.pill.label).not.toContain("Live ·");
  });

  it("never combines latest metrics across devices", () => {
    const olderDevice = cohort("GGS-PROBE-A", "2026-07-25T11:58:00.000Z");
    const newerDevice = cohort("GGS-PROBE-B", "2026-07-25T11:59:00.000Z");
    const rows = [
      ...olderDevice.filter((row) => row.metric !== "ec"),
      ...newerDevice.filter((row) => row.metric === "ec"),
    ];

    const selection = selectLatestTrustedGgsOperatorSentinelCohort(rows);
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.deviceId).toBe("GGS-PROBE-B");
    expect(selection.rows.map((row) => row.metric)).toEqual(["ec"]);

    const verdict = evaluateGgsOperatorAttestedSentinelReadiness({
      rows,
      snapshot: null,
      now: NOW,
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.state).toBe("BLOCKED_NO_SOIL_TEMP_C");
  });

  it("does not backfill a newer partial cohort from an older complete cohort", () => {
    const olderComplete = cohort("GGS-PROBE-A", "2026-07-25T11:58:00.000Z");
    const newerPartial = cohort("GGS-PROBE-A", "2026-07-25T11:59:00.000Z").filter(
      (row) => row.metric === "soil_moisture_pct",
    );
    const verdict = evaluateGgsOperatorAttestedSentinelReadiness({
      rows: [...olderComplete, ...newerPartial],
      snapshot: null,
      now: NOW,
    });

    expect(verdict.passed).toBe(false);
    expect(verdict.state).toBe("BLOCKED_NO_SOIL_TEMP_C");
  });

  it("fails the latest cohort closed instead of skipping a degraded row", () => {
    const olderComplete = cohort("GGS-PROBE-A", "2026-07-25T11:58:00.000Z");
    const newer = cohort("GGS-PROBE-A", "2026-07-25T11:59:00.000Z").map((row) =>
      row.metric === "ec" ? { ...row, quality: "degraded" } : row,
    );
    const verdict = evaluateGgsOperatorAttestedSentinelReadiness({
      rows: [...olderComplete, ...newer],
      snapshot: null,
      now: NOW,
    });

    expect(verdict.passed).toBe(false);
    expect(verdict.state).toBe("BLOCKED_VALIDATION_ERROR");
  });

  it("rejects missing/forged attestation provenance", () => {
    const rows = cohort("GGS-PROBE-A", "2026-07-25T11:59:00.000Z").map((row) => ({
      ...row,
      raw_payload: {
        ...row.raw_payload,
        operator_attestation: {
          ...row.raw_payload.operator_attestation,
          attested: false,
        },
      },
    }));
    const verdict = evaluateGgsOperatorAttestedSentinelReadiness({
      rows,
      snapshot: null,
      now: NOW,
    });

    expect(verdict.state).toBe("BLOCKED_OPERATOR_ATTESTATION_MISSING");
    expect(verdict.passed).toBe(false);
  });

  it("accepts equivalent PostgREST timestamptz formatting without weakening cohort binding", () => {
    const rows = cohort("GGS-PROBE-A", "2026-07-25T11:59:00.000Z").map((row) => ({
      ...row,
      captured_at: "2026-07-25T11:59:00+00:00",
    }));
    const selection = selectLatestTrustedGgsOperatorSentinelCohort(rows);

    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.rows).toHaveLength(3);
    expect(selection.cohortId).toBe("ggs:GGS-PROBE-A:2026-07-25T11:59:00.000Z");
  });

  it("fails duplicate metrics within one cohort as incoherent", () => {
    const rows = cohort("GGS-PROBE-A", "2026-07-25T11:59:00.000Z");
    const verdict = evaluateGgsOperatorAttestedSentinelReadiness({
      rows: [...rows, { ...rows[0] }],
      snapshot: null,
      now: NOW,
    });

    expect(verdict.state).toBe("BLOCKED_COHORT_INCOHERENT");
    expect(verdict.passed).toBe(false);
  });

  it("is deterministic for repeated input", () => {
    const rows = [
      ...cohort("GGS-PROBE-B", "2026-07-25T11:59:00.000Z"),
      ...cohort("GGS-PROBE-A", "2026-07-25T11:59:00.000Z"),
    ];
    expect(selectLatestTrustedGgsOperatorSentinelCohort(rows)).toEqual(
      selectLatestTrustedGgsOperatorSentinelCohort(rows),
    );
  });
});
