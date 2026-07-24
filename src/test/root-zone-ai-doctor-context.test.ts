import { describe, expect, it } from "vitest";
import type { AiDoctorContextResult } from "@/lib/aiDoctorContextRules";
import {
  AI_DOCTOR_REVIEW_PACKET_ROOT_ZONE_CAP,
  buildAiDoctorReviewRequestPacket,
  type AiDoctorReviewRequestPacket,
} from "@/lib/aiDoctorReviewRequestPacket";
import {
  AI_DOCTOR_REVIEW_PACKET_MAX_ROOT_ZONE_OBSERVATIONS,
  AI_DOCTOR_REVIEW_PACKET_MAX_ROOT_ZONE_PRODUCTS,
  validateAndNormalizeAiDoctorReviewRequestPacket,
} from "@/lib/aiDoctorReviewRequestPacketValidationRules";
import {
  AI_DOCTOR_ROOT_ZONE_SAFETY_GUIDANCE,
  buildAiDoctorPromptMessages,
} from "@/lib/aiDoctorPromptAssembly";
import {
  buildRootZoneManualObservationCompanionIndex,
  buildRootZoneObservationFromGrowEvent,
  type RootZoneObservationV1,
  type RootZoneProductV1,
} from "@/lib/rootZoneObservationRules";

const context: AiDoctorContextResult = {
  readiness: "partial",
  missing: ["recent-manual-sensor-snapshot"],
  evidence: ["recent-watering-or-feeding"],
  counts: {
    recentEvents: 0,
    recentWateringOrFeeding: 1,
    recentManualSnapshots: 0,
    recentWarnings: 0,
  },
  latest: { manualSnapshotAt: null },
  safeNextStep: "Add current observations before review.",
  diagnosisClaimed: false,
};

function rootZoneObservation(index: number): RootZoneObservationV1 {
  const feeding = index % 2 === 1;
  return {
    occurredAt: new Date(Date.UTC(2026, 6, 19, 12, index)).toISOString(),
    eventType: feeding ? "feeding" : "watering",
    source: index % 3 === 0 ? "csv" : "manual",
    metrics: {
      schemaVersion: 1,
      volumeMl: 500 + index,
      inputPh: 5.8 + (index % 3) * 0.1,
      inputEcMsCm: 1.1 + (index % 4) * 0.1,
      outputEcMsCm: feeding ? 1.5 + (index % 2) * 0.1 : null,
      runoffMl: 50 + index,
      runoffPh: 6,
      runoffEcMsCm: 1.6,
      waterTempC: 21,
      nutrientLine: feeding ? `line-${index}` : null,
      products: feeding ? [{ name: `Product ${index}`, amount: 2, unit: "mL/L" }] : [],
    },
  };
}

function manualWateringObservation(): RootZoneObservationV1 {
  return { ...rootZoneObservation(0), source: "manual" };
}

function buildPacket(
  rootZoneObservations?: readonly RootZoneObservationV1[] | null,
): AiDoctorReviewRequestPacket {
  return buildAiDoctorReviewRequestPacket({
    plant: {
      strain: "Northern Lights Auto",
      stage: "flower",
      medium: "coco",
      potSize: "11 L",
    },
    timelineItems: [],
    context,
    now: new Date("2026-07-19T14:00:00.000Z"),
    rootZoneObservations,
  });
}

function clonePacket(packet: AiDoctorReviewRequestPacket): AiDoctorReviewRequestPacket {
  return JSON.parse(JSON.stringify(packet)) as AiDoctorReviewRequestPacket;
}

describe("root-zone AI Doctor packet → validator → prompt pipeline", () => {
  it("keeps root-zone context bounded, newest-first, deterministic, and metric-exact", () => {
    const observations = Array.from({ length: 25 }, (_value, index) => rootZoneObservation(index));
    const duplicate = clonePacket(buildPacket([observations[24]])).recentRootZoneObservations![0];
    const decorated = {
      ...observations[0],
      event_id: "event-id-leak-marker",
      grow_id: "grow-id-leak-marker",
      plant_id: "plant-id-leak-marker",
      tent_id: "tent-id-leak-marker",
      raw_payload: { bridge_token: "bridge-token-leak-marker" },
      metrics: {
        ...observations[0].metrics,
        raw_payload: { service_role: "service-role-leak-marker" },
      },
    } as RootZoneObservationV1;

    const first = buildPacket([
      decorated,
      ...observations.slice(1),
      {
        occurredAt: duplicate.at,
        eventType: duplicate.eventType,
        source: duplicate.source,
        metrics: {
          schemaVersion: 1,
          volumeMl: duplicate.volumeMl,
          inputPh: duplicate.inputPh,
          inputEcMsCm: duplicate.inputEcMsCm,
          outputEcMsCm: duplicate.outputEcMsCm,
          runoffMl: duplicate.runoffMl,
          runoffPh: duplicate.runoffPh,
          runoffEcMsCm: duplicate.runoffEcMsCm,
          waterTempC: duplicate.waterTempC,
          nutrientLine: duplicate.nutrientLine,
          products: duplicate.products,
        },
      },
    ]);
    const second = buildPacket([...observations].reverse());

    expect(AI_DOCTOR_REVIEW_PACKET_ROOT_ZONE_CAP).toBe(
      AI_DOCTOR_REVIEW_PACKET_MAX_ROOT_ZONE_OBSERVATIONS,
    );
    expect(first.recentRootZoneObservations).toHaveLength(AI_DOCTOR_REVIEW_PACKET_ROOT_ZONE_CAP);
    expect(first.recentRootZoneObservations).toEqual(second.recentRootZoneObservations);
    expect(first.recentRootZoneObservations?.[0]).toEqual({
      at: "2026-07-19T12:24:00.000Z",
      eventType: "watering",
      source: "csv",
      volumeMl: 524,
      inputPh: 5.8,
      inputEcMsCm: 1.1,
      outputEcMsCm: null,
      runoffMl: 74,
      runoffPh: 6,
      runoffEcMsCm: 1.6,
      waterTempC: 21,
      nutrientLine: null,
      products: [],
    });
    for (let index = 1; index < first.recentRootZoneObservations!.length; index += 1) {
      expect(
        first.recentRootZoneObservations![index - 1].at >=
          first.recentRootZoneObservations![index].at,
      ).toBe(true);
    }

    const dump = JSON.stringify(first);
    expect(dump).not.toMatch(
      /event-id-leak-marker|grow-id-leak-marker|plant-id-leak-marker|tent-id-leak-marker/i,
    );
    expect(dump).not.toMatch(
      /raw_payload|bridge-token-leak-marker|service_role|service-role-leak-marker/i,
    );
  });

  it("passes normalized root-zone context through strict validation into cautious prompt guidance", () => {
    const companionIndex = buildRootZoneManualObservationCompanionIndex([
      {
        id: "diary-id-leak-marker",
        grow_id: "grow-id-leak-marker",
        plant_id: "plant-id-leak-marker",
        tent_id: "tent-id-leak-marker",
        entry_at: "2026-07-19T13:00:00.000Z",
        linked_grow_event_id: "event-id-leak-marker",
        root_zone_manual_observation_v1: {
          schema_version: 1,
          source: "manual",
          evidence_type: "root_zone_manual_observation",
          advisory_only: true,
          observed_at: "2026-07-19T13:00:00.000Z",
          pot_weight_feel: "light",
          medium_surface: "dry",
          drainage: "normal",
        },
      },
    ]);
    const safeObservation = buildRootZoneObservationFromGrowEvent(
      {
        id: "event-id-leak-marker",
        grow_id: "grow-id-leak-marker",
        plant_id: "plant-id-leak-marker",
        tent_id: "tent-id-leak-marker",
        event_type: "watering",
        occurred_at: "2026-07-19T13:00:00.000Z",
        source: "manual",
        watering_events: {
          volume_ml: 700,
          ph: 5.9,
          ec_ms_cm: 1.4,
          runoff_ml: 100,
          runoff_ph: 6.1,
          runoff_ec: 2,
          water_temp_c: 20.5,
          raw_payload: { service_role: "secret-value-leak-marker" },
        },
      },
      companionIndex,
    );
    expect(safeObservation).not.toBeNull();
    expect(safeObservation?.manualObservation).toEqual({
      observedAt: "2026-07-19T13:00:00.000Z",
      source: "manual",
      advisoryOnly: true,
      potWeightFeel: "light",
      mediumSurface: "dry",
      drainage: "normal",
    });

    const packet = buildPacket([safeObservation!]);
    const normalized = validateAndNormalizeAiDoctorReviewRequestPacket(packet);
    expect(normalized).toEqual(packet);

    const prompt = buildAiDoctorPromptMessages(normalized);
    expect(prompt.system).toContain("Root-zone context safety rules:");
    for (const rule of AI_DOCTOR_ROOT_ZONE_SAFETY_GUIDANCE) {
      expect(prompt.system).toContain(rule);
    }
    expect(prompt.system).toMatch(/historical observations, not prescribed targets/i);
    expect(prompt.system).toMatch(/runoff or follow-up evidence is missing/i);
    expect(prompt.system).toMatch(/not sensor readings or measured dryback/i);
    expect(prompt.system).toMatch(/does not establish a watering target or schedule/i);
    expect(prompt.system).toMatch(/do not recommend aggressive irrigation or nutrient changes/i);
    expect(prompt.user).toContain('"recentRootZoneObservations"');
    expect(prompt.user).toContain('"volumeMl":700');
    expect(prompt.user).toContain('"inputEcMsCm":1.4');
    expect(prompt.user).toContain('"outputEcMsCm":null');
    expect(prompt.user).toContain(
      '"manualObservation":{"observedAt":"2026-07-19T13:00:00.000Z","source":"manual","advisoryOnly":true,"potWeightFeel":"light","mediumSurface":"dry","drainage":"normal"}',
    );

    const pipelineDump = JSON.stringify({ packet, normalized, prompt });
    expect(pipelineDump).not.toMatch(
      /event-id-leak-marker|diary-id-leak-marker|grow-id-leak-marker|plant-id-leak-marker|tent-id-leak-marker/i,
    );
    expect(pipelineDump).not.toMatch(/raw_payload|service_role|api_key|secret-value-leak-marker/i);
  });

  it("carries only fixed invalid-field names into Missing-information guidance", () => {
    const partial = buildRootZoneObservationFromGrowEvent({
      event_type: "watering",
      occurred_at: "2026-07-19T13:00:00.000Z",
      source: "manual",
      watering_events: { volume_ml: 700, ph: 99 },
    });
    expect(partial?.invalidFields).toEqual(["inputPh"]);

    const packet = buildPacket([partial!]);
    expect(packet.recentRootZoneObservations?.[0].invalidFields).toEqual(["inputPh"]);
    const normalized = validateAndNormalizeAiDoctorReviewRequestPacket(packet);
    expect(normalized?.recentRootZoneObservations?.[0].invalidFields).toEqual(["inputPh"]);
    const prompt = buildAiDoctorPromptMessages(normalized);
    expect(prompt.system).toMatch(/invalidFields.*Missing information/i);
    expect(prompt.user).toContain('"invalidFields":["inputPh"]');
  });

  it("reconstructs only whitelisted root-zone fields at the untrusted validator boundary", () => {
    const packet = buildPacket([rootZoneObservation(1)]);
    const decorated = clonePacket(packet) as AiDoctorReviewRequestPacket & Record<string, unknown>;
    const rootZone = decorated.recentRootZoneObservations![0] as unknown as Record<string, unknown>;
    rootZone.event_id = "event-id-leak-marker";
    rootZone.grow_id = "grow-id-leak-marker";
    rootZone.raw_payload = { bridge_token: "bridge-token-leak-marker" };
    (rootZone.products as Array<Record<string, unknown>>)[0].internal_id = "product-id-leak-marker";

    const normalized = validateAndNormalizeAiDoctorReviewRequestPacket(decorated);

    expect(normalized).toEqual(packet);
    expect(JSON.stringify(normalized)).not.toMatch(
      /event_id|grow_id|raw_payload|bridge_token|internal_id|leak-marker/i,
    );
  });

  it("projects only fixed product fields in the browser request builder", () => {
    const observation = rootZoneObservation(1);
    const decoratedProduct = observation.metrics.products[0] as RootZoneProductV1 &
      Record<string, unknown>;
    decoratedProduct.internal_id = "product-id-leak-marker";
    decoratedProduct.api_key = "secret-value-leak-marker";

    const packet = buildPacket([observation]);

    expect(packet.recentRootZoneObservations?.[0].products).toEqual([
      { name: "Product 1", amount: 2, unit: "mL/L" },
    ]);
    expect(JSON.stringify(packet)).not.toMatch(/internal_id|api_key|leak-marker/i);
  });

  it("reconstructs only fixed manual-observation labels at the server boundary", () => {
    const observation: RootZoneObservationV1 = {
      ...manualWateringObservation(),
      manualObservation: {
        observedAt: "2026-07-19T12:00:00.000Z",
        source: "manual",
        advisoryOnly: true,
        potWeightFeel: "moderate",
        mediumSurface: "moist",
        drainage: "slow",
      },
    };
    const packet = buildPacket([observation]);
    const decorated = clonePacket(packet);
    const manual = decorated.recentRootZoneObservations?.[0].manualObservation as unknown as Record<
      string,
      unknown
    >;
    manual.raw_payload = { service_role: "secret-value-leak-marker" };
    manual.device_id = "device-id-leak-marker";

    const normalized = validateAndNormalizeAiDoctorReviewRequestPacket(decorated);

    expect(normalized).toEqual(packet);
    expect(normalized?.recentRootZoneObservations?.[0].manualObservation).toEqual({
      observedAt: "2026-07-19T12:00:00.000Z",
      source: "manual",
      advisoryOnly: true,
      potWeightFeel: "moderate",
      mediumSurface: "moist",
      drainage: "slow",
    });
    expect(JSON.stringify(normalized)).not.toMatch(
      /raw_payload|service_role|device_id|secret-value-leak-marker|device-id-leak-marker/i,
    );
  });

  it("canonicalizes permissive date strings before they can carry prompt instructions or secrets", () => {
    const packet = buildPacket([manualWateringObservation()]);
    packet.recentRootZoneObservations![0].manualObservation = {
      observedAt: "Sun, 19 Jul 2026 12:00:00 GMT (api_key=sk_live_123)",
      source: "manual",
      advisoryOnly: true,
      potWeightFeel: "light",
      mediumSurface: null,
      drainage: null,
    };

    const normalized = validateAndNormalizeAiDoctorReviewRequestPacket(packet);
    expect(normalized?.recentRootZoneObservations?.[0].manualObservation?.observedAt).toBe(
      "2026-07-19T12:00:00.000Z",
    );
    const prompt = buildAiDoctorPromptMessages(normalized);
    expect(JSON.stringify({ normalized, prompt })).not.toMatch(
      /api_key|sk_live_123|parenthesized|ignore previous/i,
    );
  });

  it("rejects over-cap and malformed root-zone sections before prompt assembly", () => {
    const overObservationCap = buildPacket([rootZoneObservation(1)]);
    overObservationCap.recentRootZoneObservations = Array.from(
      { length: AI_DOCTOR_REVIEW_PACKET_MAX_ROOT_ZONE_OBSERVATIONS + 1 },
      (_value, index) => ({
        ...overObservationCap.recentRootZoneObservations![0],
        at: new Date(Date.UTC(2026, 6, 19, 10, index)).toISOString(),
      }),
    );

    const overProductCap = buildPacket([rootZoneObservation(1)]);
    overProductCap.recentRootZoneObservations![0].products = Array.from(
      { length: AI_DOCTOR_REVIEW_PACKET_MAX_ROOT_ZONE_PRODUCTS + 1 },
      (_value, index) => ({ name: `Product ${index}`, amount: index, unit: "mL/L" }),
    );

    const invalidVolume = buildPacket([rootZoneObservation(1)]);
    invalidVolume.recentRootZoneObservations![0].volumeMl = 0;

    const invalidTimestamp = buildPacket([rootZoneObservation(1)]);
    invalidTimestamp.recentRootZoneObservations![0].at = "not-a-date";

    const invalidManualObservation = buildPacket([manualWateringObservation()]);
    (invalidManualObservation.recentRootZoneObservations![0] as unknown as Record<string, unknown>)[
      "manualObservation"
    ] = {
      observedAt: "2026-07-19T12:00:00.000Z",
      source: "manual",
      advisoryOnly: true,
      potWeightFeel: "water-now",
      mediumSurface: null,
      drainage: null,
    };

    const emptyManualObservation = buildPacket([manualWateringObservation()]);
    (emptyManualObservation.recentRootZoneObservations![0] as unknown as Record<string, unknown>)[
      "manualObservation"
    ] = {
      observedAt: "2026-07-19T12:00:00.000Z",
      source: "manual",
      advisoryOnly: true,
      potWeightFeel: null,
      mediumSurface: null,
      drainage: null,
    };

    const misalignedManualObservation = buildPacket([manualWateringObservation()]);
    (
      misalignedManualObservation.recentRootZoneObservations![0] as unknown as Record<
        string,
        unknown
      >
    )["manualObservation"] = {
      observedAt: "2026-07-19T12:00:00.001Z",
      source: "manual",
      advisoryOnly: true,
      potWeightFeel: "light",
      mediumSurface: null,
      drainage: null,
    };

    const feedingManualObservation = buildPacket([rootZoneObservation(1)]);
    (feedingManualObservation.recentRootZoneObservations![0] as unknown as Record<string, unknown>)[
      "manualObservation"
    ] = {
      observedAt: "2026-07-19T12:01:00.000Z",
      source: "manual",
      advisoryOnly: true,
      potWeightFeel: "light",
      mediumSurface: null,
      drainage: null,
    };

    const nonManualObservation = buildPacket([rootZoneObservation(0)]);
    (nonManualObservation.recentRootZoneObservations![0] as unknown as Record<string, unknown>)[
      "manualObservation"
    ] = {
      observedAt: "2026-07-19T12:00:00.000Z",
      source: "manual",
      advisoryOnly: true,
      potWeightFeel: "light",
      mediumSurface: null,
      drainage: null,
    };

    const contradictoryManualObservation = buildPacket([manualWateringObservation()]);
    contradictoryManualObservation.recentRootZoneObservations![0].manualObservation = {
      observedAt: "2026-07-19T12:00:00.000Z",
      source: "manual",
      advisoryOnly: true,
      potWeightFeel: "light",
      mediumSurface: null,
      drainage: null,
    };
    contradictoryManualObservation.recentRootZoneObservations![0].invalidFields = [
      "manualObservation",
    ];

    for (const malformed of [
      overObservationCap,
      overProductCap,
      invalidVolume,
      invalidTimestamp,
      invalidManualObservation,
      emptyManualObservation,
      misalignedManualObservation,
      feedingManualObservation,
      nonManualObservation,
      contradictoryManualObservation,
    ]) {
      expect(validateAndNormalizeAiDoctorReviewRequestPacket(malformed)).toBeNull();
    }
  });

  it("never carries secret-like values from accepted root-zone fields into a prompt", () => {
    const malicious = buildPacket([rootZoneObservation(1)]);
    malicious.recentRootZoneObservations![0].nutrientLine = "service_role=secret-value-leak-marker";
    malicious.recentRootZoneObservations![0].products = [
      {
        name: "api_key=secret-value-leak-marker",
        amount: 1,
        unit: "bearer secret-value-leak-marker",
      },
    ];

    const normalized = validateAndNormalizeAiDoctorReviewRequestPacket(malicious);
    const prompt = normalized ? buildAiDoctorPromptMessages(normalized) : null;
    const pipelineDump = JSON.stringify({ normalized, prompt });

    expect(pipelineDump).not.toMatch(/service_role|api_key|bearer|secret-value-leak-marker/i);
  });

  it("keeps older packet and prompt behavior unchanged when root-zone context is absent", () => {
    const packet = buildPacket(undefined);

    expect(packet).not.toHaveProperty("recentRootZoneObservations");
    expect(validateAndNormalizeAiDoctorReviewRequestPacket(packet)).toEqual(packet);

    const prompt = buildAiDoctorPromptMessages(packet);
    expect(prompt.system).not.toContain("Root-zone context safety rules:");
    for (const rule of AI_DOCTOR_ROOT_ZONE_SAFETY_GUIDANCE) {
      expect(prompt.system).not.toContain(rule);
    }
    expect(prompt.user).not.toContain("recentRootZoneObservations");

    const nullPacket = buildPacket(null);
    expect(nullPacket).not.toHaveProperty("recentRootZoneObservations");
    expect(validateAndNormalizeAiDoctorReviewRequestPacket(nullPacket)).toEqual(nullPacket);
  });
});
