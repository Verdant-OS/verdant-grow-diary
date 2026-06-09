/**
 * Tests for EcoWitt Live Evidence Snapshot Export — pure helper.
 */
import { describe, it, expect } from "vitest";
import {
  buildEcowittLiveEvidenceSnapshotExport,
  buildEcowittLiveEvidenceSnapshotFilename,
  serializeEcowittLiveEvidenceSnapshotExport,
  ECOWITT_LIVE_EVIDENCE_EXPORT_SAFETY_FLAGS,
  ECOWITT_LIVE_EVIDENCE_EXPORT_SCHEMA_VERSION,
  ECOWITT_LIVE_EVIDENCE_EXPORT_TYPE,
  ECOWITT_LIVE_EVIDENCE_EXPORT_ROUTE,
  ECOWITT_LIVE_EVIDENCE_EXPORT_WARNING,
  ECOWITT_LIVE_EVIDENCE_EXPORT_DISCLAIMER,
  ECOWITT_LIVE_EVIDENCE_EXPORT_EMPTY_NEXT_STEP,
  ECOWITT_LIVE_EVIDENCE_EXPORT_TEMPLATE_NEXT_STEP,
  ECOWITT_LIVE_EVIDENCE_EXPORT_REDACTED,
  ECOWITT_LIVE_EVIDENCE_EXPORT_STATIC_FILENAME,
  type EcowittLiveEvidenceExportInput,
} from "@/lib/ecowittLiveEvidenceExportRules";
import {
  buildLiveSourceTruthEvidenceFromForm,
  createInitialEcowittLiveEvidenceFormState,
  type EcowittLiveEvidenceFormState,
} from "@/lib/ecowittLiveEvidenceFormRules";
import {
  evaluateLiveSourceTruth,
  type LiveSourceTruthGateResult,
} from "@/lib/liveSourceTruthGateRules";
import { evaluateLiveEvidenceForPlants } from "@/lib/ecowittLiveEvidenceMultiPlantRules";
import { ECOWITT_LIVE_EVIDENCE_TEMPLATES } from "@/lib/ecowittLiveEvidenceTemplates";

function baseFormState(): EcowittLiveEvidenceFormState {
  return {
    ...createInitialEcowittLiveEvidenceFormState(),
    source: "live",
    captured_at: "2026-06-09T12:00:00Z",
    now: "2026-06-09T12:01:00Z",
    tent_id: "tent-real",
    plant_id: "plant-real",
    raw_payload_present: true,
    normalized_payload_present: true,
    operator_compared_controller: true,
  };
}

function evaluate(form: EcowittLiveEvidenceFormState): {
  overall: LiveSourceTruthGateResult;
  plants: ReturnType<typeof evaluateLiveEvidenceForPlants>;
} {
  const built = buildLiveSourceTruthEvidenceFromForm(form);
  const overall = evaluateLiveSourceTruth(built.evidence);
  const plants = evaluateLiveEvidenceForPlants({
    formState: form,
    plantIdsInput: "",
  });
  return { overall, plants };
}

function makeInput(
  form: EcowittLiveEvidenceFormState,
  overrides: Partial<EcowittLiveEvidenceExportInput> = {},
): EcowittLiveEvidenceExportInput {
  const { overall, plants } = evaluate(form);
  return {
    generated_at: "2026-06-09T12:34:56Z",
    form_state: form,
    overall_result: overall,
    plant_results: plants.per_plant,
    unit_warnings: plants.unit_warnings,
    form_warnings: plants.form_warnings,
    required_next_steps: plants.combined_next_steps,
    ...overrides,
  };
}

describe("buildEcowittLiveEvidenceSnapshotExport — shape & metadata", () => {
  it("builds stable shape with schema version, type, route, warning, disclaimer", () => {
    const snap = buildEcowittLiveEvidenceSnapshotExport(makeInput(baseFormState()));
    expect(snap.schema_version).toBe(ECOWITT_LIVE_EVIDENCE_EXPORT_SCHEMA_VERSION);
    expect(snap.export_type).toBe(ECOWITT_LIVE_EVIDENCE_EXPORT_TYPE);
    expect(snap.route).toBe(ECOWITT_LIVE_EVIDENCE_EXPORT_ROUTE);
    expect(snap.warning).toBe(ECOWITT_LIVE_EVIDENCE_EXPORT_WARNING);
    expect(snap.operator_disclaimer).toBe(ECOWITT_LIVE_EVIDENCE_EXPORT_DISCLAIMER);
    expect(snap.generated_at).toBe("2026-06-09T12:34:56Z");
  });

  it("includes every required top-level key in stable order", () => {
    const snap = buildEcowittLiveEvidenceSnapshotExport(makeInput(baseFormState()));
    const keys = Object.keys(snap);
    expect(keys).toEqual([
      "schema_version",
      "export_type",
      "generated_at",
      "route",
      "warning",
      "operator_disclaimer",
      "form_state",
      "overall_result",
      "plant_results",
      "unit_warnings",
      "form_warnings",
      "required_next_steps",
      "source_truth_summary",
      "safety_flags",
    ]);
  });

  it("includes every safety flag", () => {
    const snap = buildEcowittLiveEvidenceSnapshotExport(makeInput(baseFormState()));
    for (const flag of ECOWITT_LIVE_EVIDENCE_EXPORT_SAFETY_FLAGS) {
      expect(snap.safety_flags).toContain(flag);
    }
  });

  it("source_truth_summary reflects overall result", () => {
    const snap = buildEcowittLiveEvidenceSnapshotExport(makeInput(baseFormState()));
    expect(snap.source_truth_summary.overall_verdict).toBe(
      snap.overall_result.verdict,
    );
    expect(snap.source_truth_summary.overall_is_live_proof).toBe(
      snap.overall_result.is_live_proof === true,
    );
    expect(snap.source_truth_summary.per_plant_count).toBe(
      snap.plant_results.length,
    );
  });

  it("freezes the snapshot output", () => {
    const snap = buildEcowittLiveEvidenceSnapshotExport(makeInput(baseFormState()));
    expect(Object.isFrozen(snap)).toBe(true);
  });
});

describe("required_next_steps assembly", () => {
  it("dedupes and sorts required next steps", () => {
    const form = baseFormState();
    const input = makeInput(form, {
      required_next_steps: ["b step", "a step", "b step", "  ", "a step"],
    });
    const snap = buildEcowittLiveEvidenceSnapshotExport(input);
    expect(snap.required_next_steps).toEqual(["a step", "b step"]);
  });

  it("falls back to single 'no next steps' line when empty", () => {
    const form = baseFormState();
    const input = makeInput(form, { required_next_steps: [] });
    const snap = buildEcowittLiveEvidenceSnapshotExport(input);
    expect(snap.required_next_steps).toEqual([
      ECOWITT_LIVE_EVIDENCE_EXPORT_EMPTY_NEXT_STEP,
    ]);
  });

  it("appends template-replacement note when form uses an example template", () => {
    const tplForm = ECOWITT_LIVE_EVIDENCE_TEMPLATES.find(
      (t) => t.id === "live_verified_example",
    )!.build();
    const input = makeInput(tplForm, {
      required_next_steps: ["other step"],
    });
    const snap = buildEcowittLiveEvidenceSnapshotExport(input);
    expect(snap.required_next_steps).toContain(
      ECOWITT_LIVE_EVIDENCE_EXPORT_TEMPLATE_NEXT_STEP,
    );
    expect(snap.required_next_steps).toContain("other step");
  });

  it("does NOT append template note for real (non-example) tent/plant IDs", () => {
    const snap = buildEcowittLiveEvidenceSnapshotExport(makeInput(baseFormState()));
    expect(snap.required_next_steps).not.toContain(
      ECOWITT_LIVE_EVIDENCE_EXPORT_TEMPLATE_NEXT_STEP,
    );
  });
});

describe("recursive redaction", () => {
  function snapWithFormWarning(s: string) {
    return buildEcowittLiveEvidenceSnapshotExport(
      makeInput(baseFormState(), { form_warnings: [s] }),
    );
  }

  it("redacts service_role-like JWT strings", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzZXJ2aWNlX3JvbGUifQ.AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const snap = snapWithFormWarning(`leaked ${jwt} here`);
    expect(snap.form_warnings[0]).not.toContain(jwt);
    expect(snap.form_warnings[0]).toContain(
      ECOWITT_LIVE_EVIDENCE_EXPORT_REDACTED,
    );
  });

  it("redacts bridge-token-like values", () => {
    const snap = snapWithFormWarning(
      "BRIDGE_TOKEN=abc123def456ghi789jkl012mno345",
    );
    expect(snap.form_warnings[0]).toContain(
      ECOWITT_LIVE_EVIDENCE_EXPORT_REDACTED,
    );
    expect(snap.form_warnings[0]).not.toContain("abc123def456ghi789jkl012mno345");
  });

  it("redacts OpenAI-style keys", () => {
    const snap = snapWithFormWarning("sk-ABCDEFGHIJKLMNOPQRSTUVWX1234567890");
    expect(snap.form_warnings[0]).toContain(
      ECOWITT_LIVE_EVIDENCE_EXPORT_REDACTED,
    );
    expect(snap.form_warnings[0]).not.toMatch(/sk-[A-Za-z0-9]/);
  });

  it("redacts Bearer tokens", () => {
    const snap = snapWithFormWarning("Authorization: Bearer abcdef0123456789ABCDEF");
    expect(snap.form_warnings[0]).toContain(
      ECOWITT_LIVE_EVIDENCE_EXPORT_REDACTED,
    );
    expect(snap.form_warnings[0]).not.toContain("abcdef0123456789ABCDEF");
  });

  it("redacts long JWT-ish strings", () => {
    const snap = snapWithFormWarning(
      "eyJABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    );
    expect(snap.form_warnings[0]).toContain(
      ECOWITT_LIVE_EVIDENCE_EXPORT_REDACTED,
    );
  });

  it("redacts inside nested form_state strings", () => {
    const form: EcowittLiveEvidenceFormState = {
      ...baseFormState(),
      tent_id: "tent sk-ABCDEFGHIJKLMNOPQRSTUVWX1234567890",
    };
    const snap = buildEcowittLiveEvidenceSnapshotExport(makeInput(form));
    expect(snap.form_state.tent_id).toContain(
      ECOWITT_LIVE_EVIDENCE_EXPORT_REDACTED,
    );
  });
});

describe("input immutability & serialization", () => {
  it("does not mutate input form_state or arrays", () => {
    const form = baseFormState();
    const input = makeInput(form, {
      required_next_steps: ["b", "a", "b"],
    });
    const before = JSON.stringify(input);
    buildEcowittLiveEvidenceSnapshotExport(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("serializes to pretty JSON with 2-space indent and parses round-trip", () => {
    const snap = buildEcowittLiveEvidenceSnapshotExport(makeInput(baseFormState()));
    const text = serializeEcowittLiveEvidenceSnapshotExport(snap);
    expect(text).toContain("\n  ");
    const parsed = JSON.parse(text);
    expect(parsed.schema_version).toBe(ECOWITT_LIVE_EVIDENCE_EXPORT_SCHEMA_VERSION);
    expect(parsed.route).toBe(ECOWITT_LIVE_EVIDENCE_EXPORT_ROUTE);
  });
});

describe("buildEcowittLiveEvidenceSnapshotFilename", () => {
  it("uses generated_at with colons replaced by hyphens", () => {
    expect(buildEcowittLiveEvidenceSnapshotFilename("2026-06-09T12:34:56Z")).toBe(
      "verdant-ecowitt-live-evidence-2026-06-09T12-34-56Z.json",
    );
  });

  it("strips fractional seconds for filename stability", () => {
    expect(
      buildEcowittLiveEvidenceSnapshotFilename("2026-06-09T12:34:56.789Z"),
    ).toBe("verdant-ecowitt-live-evidence-2026-06-09T12-34-56Z.json");
  });

  it("falls back to static filename for missing/invalid values", () => {
    expect(buildEcowittLiveEvidenceSnapshotFilename("")).toBe(
      ECOWITT_LIVE_EVIDENCE_EXPORT_STATIC_FILENAME,
    );
    expect(buildEcowittLiveEvidenceSnapshotFilename("not-a-date")).toBe(
      ECOWITT_LIVE_EVIDENCE_EXPORT_STATIC_FILENAME,
    );
    expect(
      buildEcowittLiveEvidenceSnapshotFilename(null as unknown as string),
    ).toBe(ECOWITT_LIVE_EVIDENCE_EXPORT_STATIC_FILENAME);
  });

  it("never includes tent_id or plant_id in the filename", () => {
    const name = buildEcowittLiveEvidenceSnapshotFilename(
      "2026-06-09T12:34:56Z",
    );
    expect(name).not.toContain("tent");
    expect(name).not.toContain("plant");
    expect(name).not.toMatch(/\s/);
  });
});
