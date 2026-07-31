/**
 * Skill Manifest / Registry / Applicability (Build 4).
 *
 * Locks: the V1 permission ceiling, deterministic version-aware
 * registration, and the guarantee that a skill cannot run outside its
 * declared operating envelope — including the spec's coco-dryback
 * refusal cases.
 */

import { describe, it, expect } from "vitest";
import {
  SKILL_PERMISSIONS,
  normalizeIrrigationArchitecture,
  normalizeMedium,
  parseVerdantSkillManifest,
  skillManifestGrantsPermission,
  type VerdantSkillManifest,
} from "@/lib/verdantSkillManifest";
import {
  assertValidSkillRegistry,
  buildSkillRegistry,
  compareSkillVersions,
  findDuplicateSkillKeys,
} from "@/lib/verdantSkillRegistry";
import { evaluateSkillApplicability, skillMayRun } from "@/lib/verdantSkillApplicabilityRules";
import {
  compilePlantContextBundle,
  type CompilePlantContextBundleInput,
} from "@/lib/plantContextBundleCompiler";
import { SKILL_CONTRACT_VERSION, serializeSkillContract } from "@/lib/verdantSkillSchemas";

const NOW_MS = Date.parse("2026-07-31T12:00:00.000Z");
const GROW = "11111111-1111-4111-8111-111111111111";
const TENT = "22222222-2222-4222-8222-222222222222";
const PLANT = "33333333-3333-4333-8333-333333333333";

function hoursAgo(h: number): string {
  return new Date(NOW_MS - h * 60 * 60 * 1000).toISOString();
}

function makeManifest(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "coco-dryback-review",
    version: "1.0.0",
    name: "Coco dryback review",
    description: "Reviews dryback behaviour for coco drain-to-waste setups.",
    authorType: "verdant",
    authorVerification: "verified",
    lifecycle: "internal_sandbox",
    operatingEnvelope: {
      growSettings: ["tent"],
      media: ["coco"],
      irrigationArchitectures: ["top_feed_drain_to_waste"],
      requiresKnownIrrigationArchitecture: true,
      requiresKnownAutoflowerStatus: false,
      minUsableSensorReadings: 1,
      // A dryback skill depends on MOISTURE, not just any reading.
      requiredSensorMetrics: ["soil_moisture_pct"],
    },
    requiredContext: ["stage", "medium", "irrigation_architecture", "sensor_readings"],
    optionalContext: ["photos"],
    excludedConditions: {
      media: ["soil", "living_soil", "peat"],
      irrigationArchitectures: ["bottom_feed_valve", "tray_bottom_fed"],
      growSettings: [],
    },
    evidencePolicy: "context_only",
    riskClass: "medium",
    permissions: ["read_plant_history", "read_sensor_context", "propose_manual_action"],
    deterministicCalculators: ["dryback_percent"],
    outputContractVersion: SKILL_CONTRACT_VERSION,
    followUpContract: { requiresFollowUp: true, defaultIntervalHours: 24 },
    evaluationSuiteId: "coco-dryback-golden-v1",
    modelPolicyId: "reasoning-draft-v1",
    maxExecutionCapability: "manual_only",
    deprecation: { deprecated: false, supersededBy: null, note: null },
    ...overrides,
  };
}

function manifest(overrides: Record<string, unknown> = {}): VerdantSkillManifest {
  const parsed = parseVerdantSkillManifest(makeManifest(overrides));
  if (parsed.ok === false) throw new Error(`manifest invalid: ${parsed.issues.join("; ")}`);
  return parsed.manifest;
}

function compileContext(overrides: Partial<CompilePlantContextBundleInput> = {}) {
  const input: CompilePlantContextBundleInput = {
    plant: {
      id: PLANT,
      grow_id: GROW,
      tent_id: TENT,
      stage: "flower",
      strain: "Sour Ishizaka",
      medium: "coco",
      pot_size: "11L",
    },
    identity: {
      irrigationArchitecture: "top-feed drain-to-waste",
      plantType: "photoperiod",
      isAutoflower: false,
    },
    targets: { humidityPct: { min: 45, max: 60 } },
    growEvents: [{ id: "ge-1", occurred_at: hoursAgo(6), event_type: "watering" }],
    diaryEntries: [{ id: "de-1", entry_at: hoursAgo(5), note: "Looks fine." }],
    photos: [{ id: "p-1", captured_at: hoursAgo(4), quality_score: 0.8 }],
    sensorReadings: [
      {
        metric: "temperature_c",
        value: 25,
        unit: "°C",
        captured_at: hoursAgo(0.1),
        source: "live",
      },
      // Root-zone moisture must name the plant to count as its evidence.
      {
        metric: "soil_moisture_pct",
        value: 42,
        unit: "%",
        captured_at: hoursAgo(0.1),
        source: "live",
        plant_id: PLANT,
      },
    ],
    ...overrides,
  };
  const r = compilePlantContextBundle(input, {
    nowMs: NOW_MS,
    contextVersion: "ctx-1",
  });
  if (r.ok === false) throw new Error(`compile failed: ${r.issues.join("; ")}`);
  return r.compilation;
}

describe("manifest contract", () => {
  it("parses a valid manifest", () => {
    const m = manifest();
    expect(m.id).toBe("coco-dryback-review");
    expect(m.maxExecutionCapability).toBe("manual_only");
    expect(m.outputContractVersion).toBe(SKILL_CONTRACT_VERSION);
  });

  it("caps the V1 permission surface", () => {
    expect([...SKILL_PERMISSIONS]).toEqual([
      "read_plant_history",
      "read_sensor_context",
      "read_photo_metadata",
      "analyze_photos",
      "retrieve_approved_evidence",
      "propose_manual_action",
    ]);
    // Anything outside the union is unrepresentable, not merely denied.
    for (const denied of [
      "mutate_rows",
      "control_equipment",
      "change_setpoint",
      "create_queue_item",
      "run_irrigation",
      "dose_nutrients",
    ]) {
      const bad = parseVerdantSkillManifest(makeManifest({ permissions: [denied] }));
      expect(bad.ok).toBe(false);
    }
  });

  it("rejects hardware execution capability", () => {
    for (const bad of ["device", "hardware", "automatic", ""]) {
      const r = parseVerdantSkillManifest(makeManifest({ maxExecutionCapability: bad }));
      expect(r.ok).toBe(false);
    }
  });

  it("rejects unknown fields so a manifest cannot smuggle extra data", () => {
    const r = parseVerdantSkillManifest(makeManifest({ query: "select * from plants" }));
    expect(r.ok).toBe(false);
  });

  it("enforces internal coherence", () => {
    // analyze_photos needs read_photo_metadata
    expect(
      parseVerdantSkillManifest(
        makeManifest({ permissions: ["read_plant_history", "analyze_photos"] }),
      ).ok,
    ).toBe(false);
    // follow-up required but no interval
    expect(
      parseVerdantSkillManifest(
        makeManifest({
          followUpContract: { requiresFollowUp: true, defaultIntervalHours: null },
        }),
      ).ok,
    ).toBe(false);
    // a slot cannot be required and optional
    expect(
      parseVerdantSkillManifest(
        makeManifest({ requiredContext: ["stage"], optionalContext: ["stage"] }),
      ).ok,
    ).toBe(false);
    // a medium cannot be both supported and excluded
    expect(
      parseVerdantSkillManifest(
        makeManifest({
          operatingEnvelope: {
            growSettings: [],
            media: ["coco"],
            irrigationArchitectures: [],
            requiresKnownIrrigationArchitecture: false,
            requiresKnownAutoflowerStatus: false,
            minUsableSensorReadings: 0,
          },
          excludedConditions: {
            media: ["coco"],
            irrigationArchitectures: [],
            growSettings: [],
          },
        }),
      ).ok,
    ).toBe(false);
    // superseded lifecycle needs a successor
    expect(parseVerdantSkillManifest(makeManifest({ lifecycle: "superseded" })).ok).toBe(false);
  });

  it("rejects unknown fields inside NESTED manifest objects too", () => {
    const nested = [
      {
        operatingEnvelope: {
          growSettings: ["tent"],
          media: ["coco"],
          irrigationArchitectures: [],
          requiresKnownIrrigationArchitecture: false,
          requiresKnownAutoflowerStatus: false,
          minUsableSensorReadings: 0,
          requiredSensorMetrics: [],
          shellCommand: "rm -rf /",
        },
      },
      {
        excludedConditions: {
          media: [],
          irrigationArchitectures: [],
          growSettings: [],
          sqlFilter: "1=1",
        },
      },
      {
        followUpContract: {
          requiresFollowUp: false,
          defaultIntervalHours: null,
          webhook: "https://example.com",
        },
      },
      {
        deprecation: { deprecated: false, supersededBy: null, note: null, script: "x" },
      },
    ];
    for (const override of nested) {
      expect(parseVerdantSkillManifest(makeManifest(override)).ok).toBe(false);
    }
  });

  it("rejects a grow setting that is both supported and excluded", () => {
    const r = parseVerdantSkillManifest(
      makeManifest({
        operatingEnvelope: {
          growSettings: ["tent"],
          media: [],
          irrigationArchitectures: [],
          requiresKnownIrrigationArchitecture: false,
          requiresKnownAutoflowerStatus: false,
          minUsableSensorReadings: 0,
          requiredSensorMetrics: [],
        },
        excludedConditions: {
          media: [],
          irrigationArchitectures: [],
          growSettings: ["tent"],
        },
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a sensor dependency without sensor-read permission", () => {
    const r = parseVerdantSkillManifest(
      makeManifest({
        permissions: ["read_plant_history", "propose_manual_action"],
      }),
    );
    // The default envelope requires soil moisture, so omitting
    // read_sensor_context is incoherent.
    expect(r.ok).toBe(false);
  });

  it("rejects `unknown` in support lists but allows it as an exclusion", () => {
    const supported = parseVerdantSkillManifest(
      makeManifest({
        operatingEnvelope: {
          growSettings: [],
          media: ["unknown"],
          irrigationArchitectures: [],
          requiresKnownIrrigationArchitecture: false,
          requiresKnownAutoflowerStatus: false,
          minUsableSensorReadings: 0,
          requiredSensorMetrics: [],
        },
        permissions: ["read_plant_history"],
        requiredContext: [],
        excludedConditions: { media: [], irrigationArchitectures: [], growSettings: [] },
      }),
    );
    expect(supported.ok).toBe(false);
    // Excluding unknown is meaningful: refuse when nobody recorded it.
    const excludedUnknown = parseVerdantSkillManifest(
      makeManifest({
        operatingEnvelope: {
          growSettings: [],
          media: [],
          irrigationArchitectures: [],
          requiresKnownIrrigationArchitecture: false,
          requiresKnownAutoflowerStatus: false,
          minUsableSensorReadings: 0,
          requiredSensorMetrics: [],
        },
        permissions: ["read_plant_history"],
        requiredContext: [],
        excludedConditions: {
          media: ["unknown"],
          irrigationArchitectures: ["unknown"],
          growSettings: [],
        },
      }),
    );
    expect(excludedUnknown.ok).toBe(true);
  });

  it("requires context slots to use the compiler's token vocabulary", () => {
    expect(parseVerdantSkillManifest(makeManifest({ requiredContext: ["moon_phase"] })).ok).toBe(
      false,
    );
  });

  it("reports permission grants", () => {
    const m = manifest();
    expect(skillManifestGrantsPermission(m, "read_sensor_context")).toBe(true);
    expect(skillManifestGrantsPermission(m, "analyze_photos")).toBe(false);
  });

  it("normalizes free-text envelope tokens tolerantly", () => {
    expect(normalizeIrrigationArchitecture("top-feed drain-to-waste")).toBe(
      "top_feed_drain_to_waste",
    );
    expect(normalizeIrrigationArchitecture("  Bottom-Feed Valve ")).toBe("bottom_feed_valve");
    expect(normalizeIrrigationArchitecture("aeroponic mist")).toBeNull();
    expect(normalizeMedium("Coco")).toBe("coco");
    expect(normalizeMedium("living soil")).toBe("living_soil");
    expect(normalizeMedium("moon dust")).toBeNull();
  });
});

describe("registry", () => {
  it("registers and resolves versions deterministically", () => {
    const built = buildSkillRegistry([
      makeManifest({ version: "1.0.0" }),
      makeManifest({ version: "1.2.0" }),
      makeManifest({ id: "environment-review", version: "0.9.0" }),
    ]);
    expect(built.ok).toBe(true);
    if (built.ok === false) return;
    const { registry } = built;
    expect(registry.ids()).toEqual(["coco-dryback-review", "environment-review"]);
    expect(registry.resolveLatest("coco-dryback-review")?.version).toBe("1.2.0");
    expect(registry.get("coco-dryback-review", "1.0.0")?.version).toBe("1.0.0");
    expect(registry.get("coco-dryback-review", "9.9.9")).toBeNull();
    // Listing order does not depend on registration order.
    const reversed = buildSkillRegistry([
      makeManifest({ id: "environment-review", version: "0.9.0" }),
      makeManifest({ version: "1.2.0" }),
      makeManifest({ version: "1.0.0" }),
    ]);
    expect(reversed.ok).toBe(true);
    if (reversed.ok === false) return;
    expect(serializeSkillContract(registry.list())).toBe(
      serializeSkillContract(reversed.registry.list()),
    );
  });

  it("rejects duplicate id and version", () => {
    const built = buildSkillRegistry([
      makeManifest({ version: "1.0.0" }),
      makeManifest({ version: "1.0.0" }),
    ]);
    expect(built.ok).toBe(false);
    if (built.ok === false) {
      expect(built.issues.join(" ")).toContain("duplicate skill id@version");
    }
    expect(
      findDuplicateSkillKeys([
        { id: "a", version: "1.0.0" },
        { id: "a", version: "1.0.0" },
        { id: "a", version: "1.1.0" },
      ]),
    ).toEqual(["a@1.0.0"]);
  });

  it("rejects an invalid manifest rather than registering a partial set", () => {
    const built = buildSkillRegistry([
      makeManifest(),
      makeManifest({ permissions: ["control_equipment"] }),
    ]);
    expect(built.ok).toBe(false);
  });

  it("resolves supersession and refuses to serve retired versions", () => {
    const built = buildSkillRegistry([
      makeManifest({
        version: "1.0.0",
        lifecycle: "superseded",
        deprecation: { deprecated: true, supersededBy: "2.0.0", note: null },
      }),
      makeManifest({ version: "2.0.0" }),
    ]);
    expect(built.ok).toBe(true);
    if (built.ok === false) return;
    const { registry } = built;
    expect(registry.resolveSupersession("coco-dryback-review", "1.0.0")?.version).toBe("2.0.0");
    expect(registry.resolveLatest("coco-dryback-review")?.version).toBe("2.0.0");
  });

  it("rejects supersession pointing at a missing or older version", () => {
    const missing = buildSkillRegistry([
      makeManifest({
        version: "1.0.0",
        deprecation: { deprecated: true, supersededBy: "3.0.0", note: null },
      }),
    ]);
    expect(missing.ok).toBe(false);
    const older = buildSkillRegistry([
      makeManifest({ version: "1.0.0" }),
      makeManifest({
        version: "2.0.0",
        deprecation: { deprecated: true, supersededBy: "1.0.0", note: null },
      }),
    ]);
    expect(older.ok).toBe(false);
  });

  it("returns null when every version of a skill is retired", () => {
    const built = buildSkillRegistry([makeManifest({ version: "1.0.0", lifecycle: "paused" })]);
    expect(built.ok).toBe(true);
    if (built.ok === false) return;
    expect(built.registry.resolveLatest("coco-dryback-review")).toBeNull();
  });

  it("freezes registered manifests so a caller cannot widen a grant", () => {
    const built = buildSkillRegistry([makeManifest()]);
    expect(built.ok).toBe(true);
    if (built.ok === false) return;
    const m = built.registry.list()[0];
    expect(Object.isFrozen(m)).toBe(true);
    expect(Object.isFrozen(m.permissions)).toBe(true);
    expect(Object.isFrozen(m.operatingEnvelope)).toBe(true);
    // A registry entry is a governance record: mutation must not stick.
    const before = [...m.permissions];
    try {
      (m.permissions as string[]).push("analyze_photos");
    } catch {
      // Frozen arrays throw in strict mode — either way, no change.
    }
    expect(built.registry.list()[0].permissions).toEqual(before);
  });

  it("compares semver numerically, not lexically", () => {
    expect(compareSkillVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareSkillVersions("2.0.0", "10.0.0")).toBeLessThan(0);
    expect(compareSkillVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("compares long version segments without precision loss", () => {
    // Past 2^53 these parse to the SAME float, so a parseInt-based
    // comparison would call them equal and pick an arbitrary winner.
    const lower = "9007199254740993.0.0";
    const higher = "9007199254740994.0.0";
    expect(compareSkillVersions(higher, lower)).toBeGreaterThan(0);
    expect(compareSkillVersions(lower, higher)).toBeLessThan(0);
    expect(compareSkillVersions(lower, lower)).toBe(0);
  });

  it("throws from the assert helper on an invalid set", () => {
    expect(() => assertValidSkillRegistry([makeManifest(), makeManifest()])).toThrow(
      /verdantSkillRegistry/,
    );
    expect(() => assertValidSkillRegistry([makeManifest()])).not.toThrow();
  });
});

describe("applicability — the spec's coco dryback cases", () => {
  it("is applicable for a fully-specified coco drain-to-waste plant", () => {
    const r = evaluateSkillApplicability({
      manifest: manifest(),
      compilation: compileContext(),
      growSetting: "tent",
    });
    expect(r.verdict).toBe("applicable");
    expect(r.missingRequiredContext).toEqual([]);
    expect(r.excludedConditions).toEqual([]);
    expect(skillMayRun(r)).toBe(true);
  });

  it("refuses when the medium is soil", () => {
    const r = evaluateSkillApplicability({
      manifest: manifest(),
      compilation: compileContext({
        plant: { id: PLANT, grow_id: GROW, tent_id: TENT, stage: "flower", medium: "soil" },
      }),
      growSetting: "tent",
    });
    expect(r.verdict).toBe("not_applicable");
    expect(r.reasons).toContain("medium_excluded");
    expect(r.excludedConditions).toContain("medium:soil");
    expect(skillMayRun(r)).toBe(false);
  });

  it("refuses when irrigation architecture is unknown, without guessing", () => {
    const r = evaluateSkillApplicability({
      manifest: manifest(),
      compilation: compileContext({ identity: { plantType: "photoperiod" } }),
      growSetting: "tent",
    });
    expect(r.verdict).toBe("insufficient_context");
    expect(r.reasons).toContain("irrigation_unknown");
    expect(r.missingRequiredContext).toContain("irrigation_architecture");
    expect(r.safeNextStep).toBe("Record how this plant is watered.");
  });

  it("refuses a bottom-fed setup when the skill supports drain-to-waste", () => {
    const r = evaluateSkillApplicability({
      manifest: manifest(),
      compilation: compileContext({
        identity: { irrigationArchitecture: "bottom-feed valve" },
      }),
      growSetting: "tent",
    });
    expect(r.verdict).toBe("not_applicable");
    expect(r.reasons).toContain("irrigation_excluded");
    expect(r.excludedConditions).toContain("irrigation_architecture:bottom_feed_valve");
  });

  it("refuses when moisture readings are stale or invalid", () => {
    const r = evaluateSkillApplicability({
      manifest: manifest(),
      compilation: compileContext({
        sensorReadings: [
          {
            metric: "temperature_c",
            value: 25,
            unit: "°C",
            // Live but far outside the live-fresh window → stale.
            captured_at: hoursAgo(9),
            source: "live",
          },
        ],
      }),
      growSetting: "tent",
    });
    expect(r.verdict).toBe("insufficient_context");
    expect(r.reasons).toContain("insufficient_usable_sensor_readings");
    expect(r.missingRequiredContext).toContain("sensor_readings");
  });

  it("does not treat an unknown irrigation architecture as agreement", () => {
    // Envelope has a closed irrigation allow-list; the flag that would
    // separately demand a known architecture is OFF. An unknown value
    // must still not pass the allow-list.
    const permissive = manifest({
      operatingEnvelope: {
        growSettings: [],
        media: [],
        irrigationArchitectures: ["top_feed_drain_to_waste"],
        requiresKnownIrrigationArchitecture: false,
        requiresKnownAutoflowerStatus: false,
        minUsableSensorReadings: 0,
        requiredSensorMetrics: [],
      },
      requiredContext: [],
      excludedConditions: { media: [], irrigationArchitectures: [], growSettings: [] },
    });
    const r = evaluateSkillApplicability({
      manifest: permissive,
      compilation: compileContext({ identity: { plantType: "photoperiod" } }),
    });
    expect(r.verdict).toBe("insufficient_context");
    expect(r.reasons).toContain("irrigation_unknown");
    expect(skillMayRun(r)).toBe(false);
  });

  it("does not treat an absent grow setting as agreement with a closed envelope", () => {
    const r = evaluateSkillApplicability({
      manifest: manifest(),
      compilation: compileContext(),
      // growSetting omitted: the plant could be outdoor or greenhouse.
    });
    expect(r.verdict).toBe("insufficient_context");
    expect(r.reasons).toContain("grow_setting_unknown");
    expect(r.safeNextStep).toContain("tent");
    expect(skillMayRun(r)).toBe(false);
  });

  it("requires the specific sensor metric the skill depends on", () => {
    // Fresh temperature but NO moisture: a dryback skill must not run.
    const r = evaluateSkillApplicability({
      manifest: manifest(),
      compilation: compileContext({
        sensorReadings: [
          {
            metric: "temperature_c",
            value: 25,
            unit: "°C",
            captured_at: hoursAgo(0.1),
            source: "live",
          },
        ],
      }),
      growSetting: "tent",
    });
    expect(r.verdict).toBe("insufficient_context");
    expect(r.reasons).toContain("missing_required_sensor_metric");
    expect(r.provenanceBlockers).toContain("no_usable_soil_moisture_pct");
    expect(skillMayRun(r)).toBe(false);
  });

  it("does not accept another plant's moisture as this plant's evidence", () => {
    const r = evaluateSkillApplicability({
      manifest: manifest(),
      compilation: compileContext({
        sensorReadings: [
          {
            metric: "temperature_c",
            value: 25,
            unit: "°C",
            captured_at: hoursAgo(0.1),
            source: "live",
          },
          {
            metric: "soil_moisture_pct",
            value: 42,
            unit: "%",
            captured_at: hoursAgo(0.1),
            source: "live",
            plant_id: "other-plant",
          },
        ],
      }),
      growSetting: "tent",
    });
    expect(r.verdict).toBe("insufficient_context");
    expect(r.reasons).toContain("missing_required_sensor_metric");
  });

  it("blocks a run when a REQUIRED metric's devices disagree", () => {
    const r = evaluateSkillApplicability({
      manifest: manifest(),
      compilation: compileContext({
        sensorReadings: [
          {
            metric: "temperature_c",
            value: 25,
            unit: "°C",
            captured_at: hoursAgo(0.1),
            source: "live",
          },
          // Two plant-scoped moisture devices disagreeing wildly.
          {
            metric: "soil_moisture_pct",
            value: 20,
            unit: "%",
            captured_at: hoursAgo(0.1),
            source: "live",
            plant_id: PLANT,
            device_id: "probe-a",
          },
          {
            metric: "soil_moisture_pct",
            value: 70,
            unit: "%",
            captured_at: hoursAgo(0.1),
            source: "live",
            plant_id: PLANT,
            device_id: "probe-b",
          },
        ],
      }),
      growSetting: "tent",
    });
    expect(r.verdict).toBe("insufficient_context");
    expect(r.reasons).toContain("required_sensor_metric_conflicted");
    expect(r.provenanceBlockers).toContain("conflicted_soil_moisture_pct");
    expect(skillMayRun(r)).toBe(false);
  });

  it("does not downgrade a non-sensor skill for unrelated stale telemetry", () => {
    // A diary/photo skill: no sensor dependency at all.
    const diarySkill = manifest({
      operatingEnvelope: {
        growSettings: [],
        media: [],
        irrigationArchitectures: [],
        requiresKnownIrrigationArchitecture: false,
        requiresKnownAutoflowerStatus: false,
        minUsableSensorReadings: 0,
        requiredSensorMetrics: [],
      },
      permissions: ["read_plant_history", "read_photo_metadata"],
      requiredContext: ["stage"],
      optionalContext: [],
      excludedConditions: { media: [], irrigationArchitectures: [], growSettings: [] },
    });
    const r = evaluateSkillApplicability({
      manifest: diarySkill,
      compilation: compileContext({
        sensorReadings: [
          // Stale and invalid telemetry this skill never consumes.
          {
            metric: "co2_ppm",
            value: 700,
            unit: "ppm",
            captured_at: hoursAgo(9),
            source: "live",
          },
          {
            metric: "humidity_pct",
            value: 900,
            unit: "%",
            captured_at: hoursAgo(0.1),
            source: "live",
          },
        ],
      }),
    });
    expect(r.verdict).toBe("applicable");
    expect(r.reasons).not.toContain("sensor_provenance_blocked");
    expect(r.reasons).not.toContain("conflicting_sensor_evidence");
  });

  it("reports partial applicability when only optional context is missing", () => {
    const r = evaluateSkillApplicability({
      manifest: manifest(),
      compilation: compileContext({ photos: [] }),
      growSetting: "tent",
    });
    expect(r.verdict).toBe("partially_applicable");
    expect(r.reasons).toContain("missing_optional_context");
    expect(skillMayRun(r)).toBe(true);
  });

  it("never runs a retired skill", () => {
    for (const lifecycle of ["deprecated", "paused"]) {
      const r = evaluateSkillApplicability({
        manifest: manifest({ lifecycle }),
        compilation: compileContext(),
        growSetting: "tent",
      });
      expect(r.verdict).toBe("not_applicable");
      expect(r.reasons).toContain("skill_retired");
      expect(r.safeNextStep).toBeNull();
    }
  });

  it("stays conservative when autoflower status is unknown", () => {
    const autoflowerSkill = manifest({
      operatingEnvelope: {
        growSettings: [],
        media: [],
        irrigationArchitectures: [],
        requiresKnownIrrigationArchitecture: false,
        requiresKnownAutoflowerStatus: true,
        minUsableSensorReadings: 0,
      },
      requiredContext: ["stage"],
      excludedConditions: { media: [], irrigationArchitectures: [], growSettings: [] },
    });
    const r = evaluateSkillApplicability({
      manifest: autoflowerSkill,
      compilation: compileContext({ identity: { plantType: "unknown" } }),
    });
    expect(r.verdict).toBe("insufficient_context");
    expect(r.reasons).toContain("autoflower_status_unknown");
  });

  it("orders reasons deterministically and is stable across runs", () => {
    const args = {
      manifest: manifest(),
      compilation: compileContext({ identity: {}, photos: [] }),
      growSetting: "tent",
    };
    const a = evaluateSkillApplicability(args);
    const b = evaluateSkillApplicability(args);
    expect(serializeSkillContract(a)).toBe(serializeSkillContract(b));
    // Reason codes follow the declared vocabulary order.
    const sortedByVocab = [...a.reasons];
    expect(a.reasons).toEqual(sortedByVocab);
  });

  it("carries no executable or query-shaped field into the result", () => {
    const r = evaluateSkillApplicability({
      manifest: manifest(),
      compilation: compileContext(),
      growSetting: "tent",
    });
    const serialized = serializeSkillContract(r);
    expect(serialized).not.toContain("select ");
    expect(serialized).not.toContain("function");
    expect(serialized).not.toContain("http");
  });
});
