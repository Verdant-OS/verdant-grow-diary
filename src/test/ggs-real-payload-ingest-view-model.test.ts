/**
 * Tests for buildGgsRealPayloadIngestViewModel.
 *
 * Covers: happy path, blank/unparseable JSON, planner refusals propagation,
 * attestation gate, raw_payload-not-leaked invariant, deterministic clock.
 */
import { describe, it, expect } from "vitest";
import {
  buildGgsRealPayloadIngestViewModel,
  describeGgsRealPayloadCommitFailure,
  describeRefusal,
} from "@/lib/ggsRealPayloadIngestViewModel";

const CTX = {
  userId: "11111111-1111-1111-1111-111111111111",
  bridgeId: "bridge-token-id",
  tentId: "22222222-2222-2222-2222-222222222222",
  deviceId: "GGS-PROBE-A1B2",
};

const REAL_PAYLOAD = JSON.stringify({
  timestamp: "2026-06-17T18:30:00Z",
  sensor_id: CTX.deviceId,
  soil_moisture_pct: 42.5,
  soil_temp_c: 22.3,
  soil_ec: 0.85,
  tent_id: CTX.tentId,
});

const NOW = new Date("2026-06-17T18:31:00Z");

describe("buildGgsRealPayloadIngestViewModel", () => {
  it("returns ok with safe preview for a real payload", () => {
    const vm = buildGgsRealPayloadIngestViewModel({
      payloadText: REAL_PAYLOAD,
      context: CTX,
      attested: true,
      now: NOW,
    });
    expect(vm.status).toBe("ok");
    if (vm.status !== "ok") return;
    expect(vm.preview.source).toBe("manual");
    expect(vm.preview.vendor).toBe("spider_farmer_ggs");
    expect(vm.preview.rowCount).toBeGreaterThan(0);
    expect(vm.preview.ageSeconds).toBe(60);
    expect(vm.canCommit).toBe(true);
    const metrics = vm.preview.metrics.map((m) => m.metric).sort();
    expect(metrics).toEqual(["ec", "soil_moisture_pct", "soil_temp_c"]);
  });

  it("never exposes raw_payload.payload body in the preview shape", () => {
    const vm = buildGgsRealPayloadIngestViewModel({
      payloadText: REAL_PAYLOAD,
      context: CTX,
      attested: true,
      now: NOW,
    });
    if (vm.status !== "ok") throw new Error("expected ok");
    const serialized = JSON.stringify(vm.preview);
    // The verbatim probe id from the payload must not leak into preview JSON.
    expect(serialized).not.toContain("moisture_vwc");
    expect(serialized).not.toContain("ec_ms_cm");
    // The preview object must NOT have a `payload` field at all.
    expect((vm.preview as unknown as Record<string, unknown>).payload).toBeUndefined();
  });

  it("blocks commit when attestation is not checked", () => {
    const vm = buildGgsRealPayloadIngestViewModel({
      payloadText: REAL_PAYLOAD,
      context: CTX,
      attested: false,
      now: NOW,
    });
    if (vm.status !== "ok") throw new Error("expected ok");
    expect(vm.canCommit).toBe(false);
    expect(vm.blockers).toContain("attestation_required");
  });

  it("refuses blank payload", () => {
    const vm = buildGgsRealPayloadIngestViewModel({
      payloadText: "   ",
      context: CTX,
      attested: true,
      now: NOW,
    });
    expect(vm.status).toBe("refused");
    if (vm.status !== "refused") return;
    expect(vm.reason).toBe("payload_blank");
    expect(vm.canCommit).toBe(false);
  });

  it("refuses unparseable JSON", () => {
    const vm = buildGgsRealPayloadIngestViewModel({
      payloadText: "{not json",
      context: CTX,
      attested: true,
      now: NOW,
    });
    expect(vm.status).toBe("refused");
    if (vm.status !== "refused") return;
    expect(vm.reason).toBe("payload_unparseable");
  });

  it("propagates strict declared-source refusal", () => {
    const bad = JSON.stringify({
      ...JSON.parse(REAL_PAYLOAD),
      source: "ggs_live",
    });
    const vm = buildGgsRealPayloadIngestViewModel({
      payloadText: bad,
      context: CTX,
      attested: true,
      now: NOW,
    });
    expect(vm.status).toBe("refused");
    if (vm.status !== "refused") return;
    expect(vm.reason).toBe("declared_source_not_allowed");
  });

  it("refuses when device id is missing in context", () => {
    const vm = buildGgsRealPayloadIngestViewModel({
      payloadText: REAL_PAYLOAD,
      context: { ...CTX, deviceId: "" },
      attested: true,
      now: NOW,
    });
    expect(vm.status).toBe("refused");
    if (vm.status !== "refused") return;
    expect(vm.reason).toBe("device_id_missing");
  });

  it("describeRefusal returns a non-empty string for every reason", () => {
    const reasons = [
      "payload_blank",
      "payload_unparseable",
      "payload_missing",
      "payload_not_object",
      "context_missing",
      "user_id_missing",
      "bridge_id_missing",
      "tent_id_missing",
      "device_id_missing",
      "payload_device_id_missing",
      "payload_device_id_mismatch",
      "captured_at_missing_or_malformed",
      "declared_source_not_allowed",
      "non_finite_value",
      "soil_temp_out_of_range",
      "soil_ec_unit_mismatch_suspected",
      "incomplete_canonical_readings",
      "no_canonical_readings",
      "normalizer_refused",
    ] as const;
    for (const r of reasons) {
      expect(describeRefusal(r).length).toBeGreaterThan(0);
    }
  });

  it("describes unconfirmed commit counts without claiming completion", () => {
    const feedback = describeGgsRealPayloadCommitFailure("commit_not_confirmed");
    expect(feedback.title).toBe("Commit not confirmed");
    expect(feedback.description).toMatch(/complete new three-reading cohort/i);
    expect(feedback.description).toMatch(/not marked complete/i);
    expect(feedback.description).not.toMatch(/commit complete|successfully saved/i);
  });

  it("keeps auth outages retryable instead of blaming credentials", () => {
    const feedback = describeGgsRealPayloadCommitFailure("authorization_unavailable");
    expect(feedback.title).toBe("Access check unavailable");
    expect(feedback.description).toMatch(/try again shortly/i);
    expect(feedback.description).not.toMatch(/invalid credentials|sign in again/i);
  });
});
