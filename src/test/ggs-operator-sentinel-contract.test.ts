import { describe, expect, it } from "vitest";
import {
  buildGgsRealPayloadCommitInput,
  GGS_REAL_PAYLOAD_SOURCE,
  GGS_REAL_PAYLOAD_SOURCE_APP,
} from "@/lib/ggsRealPayloadIngestRules";
import {
  GGS_OPERATOR_SENTINEL_METRICS,
  GGS_OPERATOR_SENTINEL_PROVENANCE,
  GGS_OPERATOR_SENTINEL_PROVENANCE_CONTAINS,
  GGS_OPERATOR_SENTINEL_QUALITY,
  GGS_OPERATOR_SENTINEL_SOURCE,
  GGS_OPERATOR_SENTINEL_VENDOR,
  isTrustedGgsOperatorSentinelRow,
} from "@/lib/ggsOperatorRealPayloadSentinelRules";
import type { GgsSentinelInputRow } from "@/lib/ggsSentinelSmokeRunner";

const NOW = new Date("2026-07-25T12:00:00.000Z");
const TENT_ID = "33333333-3333-4333-8333-333333333333";

function writerPlan() {
  return buildGgsRealPayloadCommitInput(
    {
      timestamp: "2026-07-25T11:59:00.000Z",
      sensor_id: "GGS-PROBE-001",
      tent_id: TENT_ID,
      soil_moisture_pct: 42.5,
      soil_temp_c: 22.3,
      soil_ec: 1.6,
    },
    {
      userId: "11111111-1111-4111-8111-111111111111",
      bridgeId: "55555555-5555-4555-8555-555555555555",
      tentId: TENT_ID,
      deviceId: "GGS-PROBE-001",
      operatorAttested: true,
      now: NOW,
    },
  );
}

describe("operator GGS writer / Sentinel cross-contract", () => {
  it("uses one exact source, metric, quality, and vendor contract", () => {
    const plan = writerPlan();
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(GGS_OPERATOR_SENTINEL_SOURCE).toBe(GGS_REAL_PAYLOAD_SOURCE);
    expect(GGS_OPERATOR_SENTINEL_VENDOR).toBe(GGS_REAL_PAYLOAD_SOURCE_APP);
    expect(GGS_OPERATOR_SENTINEL_PROVENANCE_CONTAINS).toEqual({
      source_app: "spider_farmer_ggs",
      provenance: "operator_attested_real_payload",
      operator_attestation: {
        attested: true,
        boundary: "operator-ggs-real-payload-commit",
      },
    });
    expect(GGS_OPERATOR_SENTINEL_PROVENANCE).toBe("operator_attested_real_payload");
    expect(plan.rows.map((row) => row.metric)).toEqual([...GGS_OPERATOR_SENTINEL_METRICS]);
    for (const row of plan.rows) {
      expect(row.source).toBe(GGS_OPERATOR_SENTINEL_SOURCE);
      expect(row.quality).toBe(GGS_OPERATOR_SENTINEL_QUALITY);
      expect(row.raw_payload.source_app).toBe(GGS_OPERATOR_SENTINEL_VENDOR);
      expect(row.raw_payload.operator_attestation.attested).toBe(true);
      expect(isTrustedGgsOperatorSentinelRow(row)).toBe(true);
    }
  });

  it.each(["degraded", "stale", "invalid", null, undefined])(
    "fails closed for quality %s",
    (quality) => {
      const plan = writerPlan();
      if (!plan.ok) throw new Error("expected writer plan");
      const row: GgsSentinelInputRow = {
        ...plan.rows[0],
        quality,
      };
      expect(isTrustedGgsOperatorSentinelRow(row)).toBe(false);
    },
  );

  it("fails closed for non-live source and unsafe/missing provenance", () => {
    const plan = writerPlan();
    if (!plan.ok) throw new Error("expected writer plan");
    expect(
      isTrustedGgsOperatorSentinelRow({
        ...plan.rows[0],
        source: "manual",
      }),
    ).toBe(false);
    expect(
      isTrustedGgsOperatorSentinelRow({
        ...plan.rows[0],
        raw_payload: { source_app: "unknown" },
      }),
    ).toBe(false);
    expect(
      isTrustedGgsOperatorSentinelRow({
        ...plan.rows[0],
        raw_payload: null,
      }),
    ).toBe(false);
  });

  it("is deterministic", () => {
    const plan = writerPlan();
    if (!plan.ok) throw new Error("expected writer plan");
    const row = plan.rows[0];
    expect(isTrustedGgsOperatorSentinelRow(row)).toBe(isTrustedGgsOperatorSentinelRow(row));
  });
});
