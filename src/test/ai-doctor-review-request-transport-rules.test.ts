import { describe, expect, it } from "vitest";
import {
  buildAiDoctorReviewRequestEnvelope,
  createAiDoctorReviewIdempotencyKey,
  parseAiDoctorReviewRequestEnvelope,
  stripAiDoctorReviewRequestTransportFields,
} from "@/lib/aiDoctorReviewRequestTransportRules";

const GROW_ID = "11111111-1111-4111-8111-111111111111";
const IDEMPOTENCY_KEY = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const PACKET = {
  schemaVersion: 1,
  plant: { strain: "Northern Lights" },
};

const EVIDENCE_ACCEPTANCE = {
  reviewMode: "standard",
  importedHistory: { state: "none_available", scope: "tent_scoped" },
  rootZoneHistory: { state: "included", scope: "plant_only" },
};
function createDeepPacket(depth: number): Record<string, unknown> {
  let nested: Record<string, unknown> = { leaf: true };
  for (let index = 0; index < depth; index += 1) {
    nested = { nested };
  }
  return { ...PACKET, nested };
}

function createWidePacket(width: number): Record<string, unknown> {
  return {
    ...PACKET,
    readings: Array.from({ length: width }, (_value, index) => index),
  };
}

describe("AI Doctor review request transport", () => {
  it("puts a valid grow scope beside, not inside, the model-context packet", () => {
    const built = buildAiDoctorReviewRequestEnvelope(PACKET, GROW_ID, IDEMPOTENCY_KEY);

    expect(built).toEqual({
      ok: true,
      envelope: {
        packet: PACKET,
        grow_id: GROW_ID,
        idempotency_key: IDEMPOTENCY_KEY,
      },
    });
    if (built.ok === false) throw new Error("expected a valid request envelope");
    expect(built.envelope.packet).toBe(PACKET);
    expect(PACKET).not.toHaveProperty("grow_id");
    expect(PACKET).not.toHaveProperty("idempotency_key");
  });

  it("adds receipt metadata beside the packet and fails closed on malformed metadata", () => {
    expect(
      buildAiDoctorReviewRequestEnvelope(PACKET, GROW_ID, IDEMPOTENCY_KEY, {
        sessionId: SESSION_ID,
        evidenceAcceptance: EVIDENCE_ACCEPTANCE,
      }),
    ).toEqual({
      ok: true,
      envelope: {
        packet: PACKET,
        grow_id: GROW_ID,
        idempotency_key: IDEMPOTENCY_KEY,
        session_id: SESSION_ID,
        evidence_acceptance: EVIDENCE_ACCEPTANCE,
      },
    });
    expect(PACKET).not.toHaveProperty("session_id");
    expect(PACKET).not.toHaveProperty("evidence_acceptance");

    expect(
      buildAiDoctorReviewRequestEnvelope(PACKET, GROW_ID, IDEMPOTENCY_KEY, {
        sessionId: "not-a-uuid",
      }),
    ).toEqual({ ok: false, reason: "invalid_session_id" });
    expect(
      buildAiDoctorReviewRequestEnvelope(PACKET, GROW_ID, IDEMPOTENCY_KEY, {
        evidenceAcceptance: { reviewMode: "standard" },
      }),
    ).toEqual({ ok: false, reason: "invalid_evidence_acceptance" });
  });
  it("omits malformed/demo scope IDs and leaves credit validation server-side", () => {
    expect(buildAiDoctorReviewRequestEnvelope(PACKET, "demo-grow", IDEMPOTENCY_KEY)).toEqual({
      ok: true,
      envelope: { packet: PACKET, idempotency_key: IDEMPOTENCY_KEY },
    });
    expect(buildAiDoctorReviewRequestEnvelope(PACKET, null, IDEMPOTENCY_KEY)).toEqual({
      ok: true,
      envelope: { packet: PACKET, idempotency_key: IDEMPOTENCY_KEY },
    });
  });

  it("fails closed with a typed result when the replay identity is absent or malformed", () => {
    for (const value of [undefined, null, "not-a-uuid", 42]) {
      expect(() => buildAiDoctorReviewRequestEnvelope(PACKET, GROW_ID, value)).not.toThrow();
      expect(buildAiDoctorReviewRequestEnvelope(PACKET, GROW_ID, value)).toEqual({
        ok: false,
        reason: "invalid_idempotency_key",
      });
    }
  });

  it("validates an injected UUID generator and contains generator failures", () => {
    expect(createAiDoctorReviewIdempotencyKey(() => IDEMPOTENCY_KEY)).toEqual({
      ok: true,
      key: IDEMPOTENCY_KEY,
    });
    expect(createAiDoctorReviewIdempotencyKey(() => "invalid")).toEqual({
      ok: false,
      reason: "invalid_idempotency_key",
    });
    expect(
      createAiDoctorReviewIdempotencyKey(() => {
        throw new Error("random unavailable");
      }),
    ).toEqual({ ok: false, reason: "idempotency_key_generation_failed" });
  });

  it("parses the envelope and strips scope/idempotency fields before prompt assembly", () => {
    const nestedGrowId = "22222222-2222-4222-8222-222222222222";
    const parsed = parseAiDoctorReviewRequestEnvelope({
      packet: {
        ...PACKET,
        context: {
          grow_id: nestedGrowId,
          readings: [{ growId: nestedGrowId, idempotencyKey: "nested-key" }],
        },
      },
      grow_id: GROW_ID,
      idempotency_key: "request-key-123",
    });

    expect(parsed).toEqual({
      packet: {
        ...PACKET,
        context: { readings: [{}] },
      },
      growId: GROW_ID,
      idempotencyKey: "request-key-123",
      format: "envelope",
    });
  });

  it("parses receipt metadata only at the envelope boundary and strips nested aliases", () => {
    const parsed = parseAiDoctorReviewRequestEnvelope({
      packet: {
        ...PACKET,
        context: {
          session_id: "malicious-nested-session",
          evidenceAcceptance: { reviewMode: "malicious" },
          readings: [
            {
              sessionId: "another-nested-session",
              evidence_acceptance: { injected: true },
            },
          ],
        },
      },
      grow_id: GROW_ID,
      idempotency_key: IDEMPOTENCY_KEY,
      session_id: SESSION_ID,
      evidence_acceptance: EVIDENCE_ACCEPTANCE,
    });

    expect(parsed).toEqual({
      packet: { ...PACKET, context: { readings: [{}] } },
      growId: GROW_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      sessionId: SESSION_ID,
      evidenceAcceptance: EVIDENCE_ACCEPTANCE,
      format: "envelope",
    });
  });

  it("rejects duplicate snake/camel aliases instead of letting untrusted metadata shadow itself", () => {
    const conflicts = [
      { grow_id: GROW_ID, growId: GROW_ID },
      { idempotency_key: IDEMPOTENCY_KEY, idempotencyKey: IDEMPOTENCY_KEY },
      { session_id: SESSION_ID, sessionId: SESSION_ID },
      {
        evidence_acceptance: EVIDENCE_ACCEPTANCE,
        evidenceAcceptance: EVIDENCE_ACCEPTANCE,
      },
    ];

    for (const conflict of conflicts) {
      expect(parseAiDoctorReviewRequestEnvelope({ packet: PACKET, ...conflict })).toBeNull();
    }
  });
  it("accepts the prior flat request shape while stripping its transport fields", () => {
    const parsed = parseAiDoctorReviewRequestEnvelope({
      ...PACKET,
      growId: GROW_ID,
      idempotencyKey: "legacy-key-123",
    });

    expect(parsed).toEqual({
      packet: PACKET,
      growId: GROW_ID,
      idempotencyKey: "legacy-key-123",
      format: "legacy",
    });
  });

  it("fails closed on malformed envelopes and never mutates the source packet", () => {
    expect(parseAiDoctorReviewRequestEnvelope(null)).toBeNull();
    expect(parseAiDoctorReviewRequestEnvelope([])).toBeNull();
    expect(parseAiDoctorReviewRequestEnvelope({ packet: [] })).toBeNull();

    const original = {
      ...PACKET,
      grow_id: GROW_ID,
      context: { readings: [{ growId: GROW_ID }] },
    };
    const stripped = stripAiDoctorReviewRequestTransportFields(original);
    expect(stripped).toEqual({ ...PACKET, context: { readings: [{}] } });
    expect(original).toEqual({
      ...PACKET,
      grow_id: GROW_ID,
      context: { readings: [{ growId: GROW_ID }] },
    });
  });

  it("rejects an excessively nested packet without recursing until the runtime overflows", () => {
    const deeplyNestedPacket = createDeepPacket(20_000);

    expect(() => parseAiDoctorReviewRequestEnvelope({ packet: deeplyNestedPacket })).not.toThrow();
    expect(parseAiDoctorReviewRequestEnvelope({ packet: deeplyNestedPacket })).toBeNull();
    expect(stripAiDoctorReviewRequestTransportFields(deeplyNestedPacket)).toBeDefined();
  });

  it("rejects an excessively wide packet without cloning the full pre-credit payload", () => {
    const widePacket = createWidePacket(20_000);

    expect(() => parseAiDoctorReviewRequestEnvelope({ packet: widePacket })).not.toThrow();
    expect(parseAiDoctorReviewRequestEnvelope({ packet: widePacket })).toBeNull();
    const stripped = stripAiDoctorReviewRequestTransportFields(widePacket) as {
      readings?: unknown[];
    };
    expect(stripped.readings?.length).toBeLessThan(20_000);
  });
});
