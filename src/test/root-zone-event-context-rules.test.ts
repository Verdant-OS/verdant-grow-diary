import { describe, expect, it } from "vitest";
import {
  ROOT_ZONE_EVENT_CONTEXT_CONSISTENCY_STATES,
  ROOT_ZONE_EVENT_CONTEXT_DETAILS_KEY,
  ROOT_ZONE_EVENT_CONTEXT_EVIDENCE_TYPE,
  ROOT_ZONE_EVENT_CONTEXT_MAX_EVENT_SKEW_MS,
  ROOT_ZONE_EVENT_CONTEXT_SCHEMA_VERSION,
  ROOT_ZONE_EVENT_CONTEXT_SCOPES,
  ROOT_ZONE_EVENT_CONTEXT_SOURCE,
  buildRootZoneEventContextEnvelopeV1,
  normalizeRootZoneEventContextEnvelopeV1,
  projectRootZoneEventContextFromDetails,
  type BuildRootZoneEventContextEnvelopeV1Input,
  type RootZoneEventContextEnvelopeV1,
} from "@/lib/rootZoneEventContextRules";

const CAPTURED_AT = "2026-07-20T15:30:00.000Z";

const BASE_INPUT: BuildRootZoneEventContextEnvelopeV1Input = {
  capturedAt: CAPTURED_AT,
  target: {
    scope: "plant",
    growId: "grow-1",
    tentId: "tent-2",
    plantId: "plant-2",
  },
  plants: [
    {
      id: "plant-1",
      grow_id: "grow-1",
      tent_id: "tent-1",
      stage: "seedling",
      medium: "soil",
      pot_size: "1 gal",
    },
    {
      id: "plant-2",
      grow_id: "grow-1",
      tent_id: "tent-2",
      stage: "early flower",
      medium: "coco coir",
      pot_size: "5 gal fabric",
    },
  ],
  tents: [
    { id: "tent-1", grow_id: "grow-1", stage: "vegetative" },
    { id: "tent-2", grow_id: "grow-1", stage: "flowering" },
  ],
  grows: [{ id: "grow-1", stage: "flowering" }],
};

function build(patch: Partial<BuildRootZoneEventContextEnvelopeV1Input> = {}) {
  return buildRootZoneEventContextEnvelopeV1({
    ...BASE_INPUT,
    ...patch,
  });
}

function validEnvelope(): RootZoneEventContextEnvelopeV1 {
  const result = build();
  if (result.ok !== true) throw new Error(`fixture failed: ${result.reason}`);
  return structuredClone(result.envelope);
}

function tentInput(
  plants: BuildRootZoneEventContextEnvelopeV1Input["plants"],
): BuildRootZoneEventContextEnvelopeV1Input {
  return {
    ...BASE_INPUT,
    target: { scope: "tent", growId: "grow-1", tentId: "tent-2" },
    plants,
  };
}

describe("root-zone event context contract constants", () => {
  it("exports one frozen, versioned vocabulary", () => {
    expect(ROOT_ZONE_EVENT_CONTEXT_SCHEMA_VERSION).toBe(1);
    expect(ROOT_ZONE_EVENT_CONTEXT_EVIDENCE_TYPE).toBe("root_zone_event_context");
    expect(ROOT_ZONE_EVENT_CONTEXT_SOURCE).toBe("profile_snapshot");
    expect(ROOT_ZONE_EVENT_CONTEXT_SCOPES).toEqual(["plant", "tent"]);
    expect(ROOT_ZONE_EVENT_CONTEXT_CONSISTENCY_STATES).toEqual([
      "consistent",
      "mixed",
      "incomplete",
      "not_recorded",
    ]);
    expect(Object.isFrozen(ROOT_ZONE_EVENT_CONTEXT_SCOPES)).toBe(true);
    expect(Object.isFrozen(ROOT_ZONE_EVENT_CONTEXT_CONSISTENCY_STATES)).toBe(true);
  });
});

describe("plant-scoped event context", () => {
  it("captures the exact selected plant with stage, medium, and container provenance", () => {
    expect(build()).toEqual({
      ok: true,
      envelope: {
        schema_version: 1,
        source: "profile_snapshot",
        evidence_type: "root_zone_event_context",
        advisory_only: true,
        captured_at: CAPTURED_AT,
        scope: "plant",
        stage: { value: "early flower", source: "plant_record" },
        medium: {
          value: "coco coir",
          source: "plant_record",
          consistency: "consistent",
          recorded_count: 1,
          total_count: 1,
        },
        container: {
          value: "5 gal fabric",
          source: "plant_record",
          consistency: "consistent",
          recorded_count: 1,
          total_count: 1,
        },
      },
    });
  });

  it("falls stage back from plant to exact tent, then exact grow, with provenance", () => {
    const tentStage = build({
      plants: [{ ...BASE_INPUT.plants[1], stage: " " }],
    });
    expect(tentStage.ok && tentStage.envelope.stage).toEqual({
      value: "flowering",
      source: "tent_record",
    });

    const growStage = build({
      plants: [{ ...BASE_INPUT.plants[1], stage: null }],
      tents: [{ id: "tent-2", grow_id: "grow-1", stage: null }],
    });
    expect(growStage.ok && growStage.envelope.stage).toEqual({
      value: "flowering",
      source: "grow_record",
    });
  });

  it("keeps all missing profile context explicitly not recorded", () => {
    const result = build({
      plants: [{ id: "plant-2", grow_id: "grow-1", tent_id: "tent-2" }],
      tents: [{ id: "tent-2", grow_id: "grow-1" }],
      grows: [{ id: "grow-1" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.stage).toEqual({ value: null, source: "not_recorded" });
    expect(result.envelope.medium).toEqual({
      value: null,
      source: "not_recorded",
      consistency: "not_recorded",
      recorded_count: 0,
      total_count: 1,
    });
    expect(result.envelope.container).toEqual({
      value: null,
      source: "not_recorded",
      consistency: "not_recorded",
      recorded_count: 0,
      total_count: 1,
    });
  });

  it("does not invent context when the selected plant record is absent", () => {
    const result = build({ plants: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.stage.source).toBe("tent_record");
    expect(result.envelope.medium).toMatchObject({
      consistency: "not_recorded",
      recorded_count: 0,
      total_count: 0,
    });
    expect(result.envelope.container).toMatchObject({
      consistency: "not_recorded",
      recorded_count: 0,
      total_count: 0,
    });
  });
});

describe("tent-scoped consistency", () => {
  it("classifies equivalent recorded medium/container labels as consistent", () => {
    const result = buildRootZoneEventContextEnvelopeV1(
      tentInput([
        {
          id: "a",
          grow_id: "grow-1",
          tent_id: "tent-2",
          medium: "  Coco   Coir ",
          pot_size: "3 GAL",
        },
        {
          id: "b",
          grow_id: "grow-1",
          tent_id: "tent-2",
          medium: "coco coir",
          pot_size: "3 gal",
        },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.medium).toEqual({
      value: "Coco Coir",
      source: "tent_plant_records",
      consistency: "consistent",
      recorded_count: 2,
      total_count: 2,
    });
    expect(result.envelope.container).toEqual({
      value: "3 GAL",
      source: "tent_plant_records",
      consistency: "consistent",
      recorded_count: 2,
      total_count: 2,
    });
  });

  it("classifies fully recorded different media and containers as mixed", () => {
    const result = buildRootZoneEventContextEnvelopeV1(
      tentInput([
        { id: "a", grow_id: "grow-1", tent_id: "tent-2", medium: "soil", pot_size: "3 gal" },
        { id: "b", grow_id: "grow-1", tent_id: "tent-2", medium: "coco", pot_size: "5 gal" },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.medium).toMatchObject({
      value: null,
      source: "tent_plant_records",
      consistency: "mixed",
      recorded_count: 2,
      total_count: 2,
    });
    expect(result.envelope.container.consistency).toBe("mixed");
  });

  it("classifies partially recorded tent context as incomplete without inventing a room value", () => {
    const result = buildRootZoneEventContextEnvelopeV1(
      tentInput([
        { id: "a", grow_id: "grow-1", tent_id: "tent-2", medium: "coco", pot_size: null },
        { id: "b", grow_id: "grow-1", tent_id: "tent-2", medium: null, pot_size: "3 gal" },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.medium).toMatchObject({
      value: null,
      consistency: "incomplete",
      recorded_count: 1,
      total_count: 2,
    });
    expect(result.envelope.container).toMatchObject({
      value: null,
      consistency: "incomplete",
      recorded_count: 1,
      total_count: 2,
    });
  });

  it.each([
    { label: "no active plants", plants: [] },
    {
      label: "active plants with no recorded values",
      plants: [
        { id: "a", grow_id: "grow-1", tent_id: "tent-2" },
        { id: "b", grow_id: "grow-1", tent_id: "tent-2", medium: " " },
      ],
    },
  ])("keeps tent context not recorded for $label", ({ plants }) => {
    const result = buildRootZoneEventContextEnvelopeV1(tentInput(plants));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.medium).toMatchObject({
      value: null,
      source: "not_recorded",
      consistency: "not_recorded",
      recorded_count: 0,
      total_count: plants.length,
    });
  });

  it("uses only active plants in the exact selected tent", () => {
    const result = buildRootZoneEventContextEnvelopeV1(
      tentInput([
        { id: "active", grow_id: "grow-1", tent_id: "tent-2", medium: "coco", pot_size: "3 gal" },
        {
          id: "other-tent",
          grow_id: "grow-1",
          tent_id: "tent-9",
          medium: "soil",
          pot_size: "9 gal",
        },
        { id: "archived", grow_id: "grow-1", tent_id: "tent-2", medium: "soil", is_archived: true },
        {
          id: "merged",
          grow_id: "grow-1",
          tent_id: "tent-2",
          medium: "soil",
          last_note: "Merged into 11111111-1111-4111-8111-111111111111",
        },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.medium).toMatchObject({
      value: "coco",
      consistency: "consistent",
      recorded_count: 1,
      total_count: 1,
    });
  });

  it("never aggregates plant stage into tent stage", () => {
    const input = tentInput([
      { id: "a", grow_id: "grow-1", tent_id: "tent-2", stage: "seedling", medium: "soil" },
    ]);
    input.tents = [{ id: "tent-2", grow_id: "grow-1", stage: null }];
    input.grows = [{ id: "grow-1", stage: "flowering" }];
    const result = buildRootZoneEventContextEnvelopeV1(input);
    expect(result.ok && result.envelope.stage).toEqual({
      value: "flowering",
      source: "grow_record",
    });
  });
});

describe("builder boundaries and determinism", () => {
  it.each([
    { capturedAt: "2026-07-20T15:30:00Z", reason: "invalid_captured_at" },
    { capturedAt: "not-a-date", reason: "invalid_captured_at" },
  ])("rejects non-canonical captured time $capturedAt", ({ capturedAt, reason }) => {
    expect(build({ capturedAt })).toEqual({ ok: false, reason });
  });

  it.each([
    { target: { scope: "plant", growId: "grow-1", plantId: " " } },
    { target: { scope: "tent", growId: "grow-1", tentId: " " } },
    { target: { scope: "tent", growId: " ", tentId: "tent-2" } },
  ])("rejects malformed exact scope %#", ({ target }) => {
    expect(build({ target: target as BuildRootZoneEventContextEnvelopeV1Input["target"] })).toEqual(
      {
        ok: false,
        reason: "invalid_scope",
      },
    );
  });

  it.each([
    {
      label: "plant to grow",
      patch: { plants: [{ ...BASE_INPUT.plants[1], grow_id: "grow-9" }] },
    },
    {
      label: "plant to tent",
      patch: { plants: [{ ...BASE_INPUT.plants[1], tent_id: "tent-9" }] },
    },
    {
      label: "tent to grow",
      patch: { tents: [{ id: "tent-2", grow_id: "grow-9", stage: "flowering" }] },
    },
    {
      label: "duplicate selected plant",
      patch: { plants: [BASE_INPUT.plants[1], { ...BASE_INPUT.plants[1] }] },
    },
  ])("fails closed on $label scope-record mismatch", ({ patch }) => {
    expect(build(patch)).toEqual({ ok: false, reason: "scope_record_mismatch" });
  });

  it.each([
    { label: "overlong", value: "x".repeat(121) },
    { label: "control character", value: "coco\ncoir" },
    { label: "non-string", value: 7 as unknown as string },
    { label: "secret-like", value: "bridge_token=do-not-store" },
  ])("rejects $label explicit context values", ({ value }) => {
    expect(build({ plants: [{ ...BASE_INPUT.plants[1], medium: value }] })).toEqual({
      ok: false,
      reason: "invalid_context_value",
    });
  });

  it("is stable across input order, deeply frozen, and non-mutating", () => {
    const input = tentInput([
      { id: "b", grow_id: "grow-1", tent_id: "tent-2", medium: "coco", pot_size: "3 gal" },
      { id: "a", grow_id: "grow-1", tent_id: "tent-2", medium: "Coco", pot_size: "3 GAL" },
    ]);
    const before = structuredClone(input);
    const first = buildRootZoneEventContextEnvelopeV1(input);
    const second = buildRootZoneEventContextEnvelopeV1({
      ...input,
      plants: [...input.plants].reverse(),
    });

    expect(first).toEqual(second);
    expect(input).toEqual(before);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(Object.isFrozen(first.envelope)).toBe(true);
    expect(Object.isFrozen(first.envelope.stage)).toBe(true);
    expect(Object.isFrozen(first.envelope.medium)).toBe(true);
    expect(Object.isFrozen(first.envelope.container)).toBe(true);
  });
});

describe("strict untrusted-envelope normalization", () => {
  it("reconstructs a bounded camelCase model and freezes every level", () => {
    const normalized = normalizeRootZoneEventContextEnvelopeV1(validEnvelope());
    expect(normalized).toEqual({
      capturedAt: CAPTURED_AT,
      scope: "plant",
      source: "profile_snapshot",
      advisoryOnly: true,
      stage: { value: "early flower", source: "plant_record" },
      medium: {
        value: "coco coir",
        source: "plant_record",
        consistency: "consistent",
        recordedCount: 1,
        totalCount: 1,
      },
      container: {
        value: "5 gal fabric",
        source: "plant_record",
        consistency: "consistent",
        recordedCount: 1,
        totalCount: 1,
      },
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized?.medium)).toBe(true);
  });

  it("rejects enumerable, hidden, and symbol extras plus accessors and non-plain prototypes", () => {
    const rootExtra = { ...validEnvelope(), unexpected: true };
    const nestedExtra = {
      ...validEnvelope(),
      medium: { ...validEnvelope().medium, raw_payload: { token: "no" } },
    };
    const accessor = validEnvelope() as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, "captured_at", {
      enumerable: true,
      get() {
        throw new Error("hostile getter");
      },
    });
    const customPrototype = Object.assign(Object.create({ inherited: true }), validEnvelope());
    const hiddenExtra = validEnvelope() as unknown as Record<string, unknown>;
    Object.defineProperty(hiddenExtra, "hidden_extra", {
      configurable: true,
      enumerable: false,
      value: true,
    });
    const symbolExtra = validEnvelope() as unknown as Record<PropertyKey, unknown>;
    symbolExtra[Symbol("unexpected")] = true;

    for (const value of [
      rootExtra,
      nestedExtra,
      accessor,
      customPrototype,
      hiddenExtra,
      symbolExtra,
    ]) {
      expect(() => normalizeRootZoneEventContextEnvelopeV1(value)).not.toThrow();
      expect(normalizeRootZoneEventContextEnvelopeV1(value)).toBeNull();
    }
  });

  it("rejects cross-field population counts that no builder output can produce", () => {
    const envelope = validEnvelope();
    envelope.container = {
      value: null,
      source: "not_recorded",
      consistency: "not_recorded",
      recorded_count: 0,
      total_count: 0,
    };

    expect(envelope.medium.total_count).toBe(1);
    expect(normalizeRootZoneEventContextEnvelopeV1(envelope)).toBeNull();
  });

  it.each([
    {
      label: "plant mixed state",
      patch: { consistency: "mixed", value: null },
    },
    {
      label: "recorded exceeds total",
      patch: { recorded_count: 2, total_count: 1 },
    },
    {
      label: "consistent without value",
      patch: { value: null },
    },
    {
      label: "consistent with not-recorded source",
      patch: { source: "not_recorded" },
    },
    {
      label: "not-recorded with a count",
      patch: {
        consistency: "not_recorded",
        value: null,
        source: "not_recorded",
        recorded_count: 1,
      },
    },
  ])("rejects invalid aggregate invariant: $label", ({ patch }) => {
    const envelope = validEnvelope();
    envelope.medium = { ...envelope.medium, ...patch } as RootZoneEventContextEnvelopeV1["medium"];
    expect(normalizeRootZoneEventContextEnvelopeV1(envelope)).toBeNull();
  });

  it("rejects stage provenance that cannot belong to the scope", () => {
    const envelope = validEnvelope();
    envelope.scope = "tent";
    envelope.stage = { value: "flowering", source: "plant_record" };
    envelope.medium = {
      value: "coco",
      source: "tent_plant_records",
      consistency: "consistent",
      recorded_count: 1,
      total_count: 1,
    };
    envelope.container = { ...envelope.medium };
    expect(normalizeRootZoneEventContextEnvelopeV1(envelope)).toBeNull();
  });
});

describe("details projection and safety fences", () => {
  it("preserves unrelated or legacy details as absent", () => {
    expect(projectRootZoneEventContextFromDetails(null, CAPTURED_AT)).toEqual({
      status: "absent",
    });
    expect(
      projectRootZoneEventContextFromDetails(
        { linked_grow_event_id: "event-1", note: "legacy" },
        CAPTURED_AT,
      ),
    ).toEqual({ status: "absent" });
  });

  it("projects only the bounded exact-time context", () => {
    const projection = projectRootZoneEventContextFromDetails(
      {
        linked_grow_event_id: "event-secret-id",
        [ROOT_ZONE_EVENT_CONTEXT_DETAILS_KEY]: validEnvelope(),
        sensor_snapshot: { raw_payload: { bridge_token: "must-not-project" } },
      },
      CAPTURED_AT,
    );
    expect(projection.status).toBe("valid");
    expect(JSON.stringify(projection)).not.toMatch(
      /linked_grow_event_id|event-secret-id|sensor_snapshot|raw_payload|bridge_token|user_id|grow_id|tent_id|plant_id/i,
    );
  });

  it("requires exact parent-event time and rejects malformed parents", () => {
    const details = { [ROOT_ZONE_EVENT_CONTEXT_DETAILS_KEY]: validEnvelope() };
    expect(ROOT_ZONE_EVENT_CONTEXT_MAX_EVENT_SKEW_MS).toBe(0);
    expect(projectRootZoneEventContextFromDetails(details, CAPTURED_AT).status).toBe("valid");
    expect(projectRootZoneEventContextFromDetails(details, "2026-07-20T15:30:00.001Z")).toEqual({
      status: "invalid",
    });
    expect(projectRootZoneEventContextFromDetails(details, "not-a-time")).toEqual({
      status: "invalid",
    });
  });

  it("fails closed without throwing on a hostile reserved-key getter", () => {
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, ROOT_ZONE_EVENT_CONTEXT_DETAILS_KEY, {
      enumerable: true,
      get() {
        throw new Error("untrusted getter");
      },
    });
    expect(() => projectRootZoneEventContextFromDetails(hostile, CAPTURED_AT)).not.toThrow();
    expect(projectRootZoneEventContextFromDetails(hostile, CAPTURED_AT)).toEqual({
      status: "invalid",
    });
  });

  it("emits evidence context only, never schedules, dryback claims, actions, commands, or IDs", () => {
    const output = JSON.stringify(build());
    expect(output).not.toMatch(
      /dryback|schedule|frequency|cadence|recommend|target|diagnos|alert|action_queue|device|command|user_id|grow_id|tent_id|plant_id|raw_payload/i,
    );
    expect(Object.keys(validEnvelope())).toEqual([
      "schema_version",
      "source",
      "evidence_type",
      "advisory_only",
      "captured_at",
      "scope",
      "stage",
      "medium",
      "container",
    ]);
  });
});
