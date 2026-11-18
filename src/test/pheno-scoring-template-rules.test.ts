import { describe, expect, it } from "vitest";
import {
  evaluatePhenoScoringResponse,
  resolveFieldScale,
  validateFieldValue,
  validatePhenoScoringTemplate,
  type PhenoScoringTemplate,
} from "@/lib/phenoScoringTemplateRules";
import {
  PHENO_SCORING_EXAMPLE_TEMPLATES,
  VERDANT_TASTING_SCORECARD_TEMPLATE,
  VERDANT_PHENO_SCORECARD_TEMPLATE,
} from "@/constants/phenoScoringTemplates";

/** Minimal synthetic template: one field of every kind, on a 1–5 scale. */
function makeTemplate(overrides: Partial<PhenoScoringTemplate> = {}): PhenoScoringTemplate {
  return {
    id: "test-template",
    version: 1,
    title: "Test template",
    status: "draft",
    visibility: "internal",
    scale: { min: 1, max: 5, step: 1 },
    sections: [
      {
        id: "main",
        title: "Main",
        fields: [
          { id: "vigor", kind: "scale", label: "Vigor", required: true },
          {
            id: "fine",
            kind: "scale",
            label: "Fine scale",
            scale: { min: 0, max: 10, step: 0.5 },
          },
          {
            id: "structure",
            kind: "single",
            label: "Structure",
            options: [
              { id: "open", label: "Open" },
              { id: "dense", label: "Dense" },
            ],
          },
          {
            id: "notes",
            kind: "multi",
            label: "Aroma notes",
            maxSelections: 2,
            options: [
              { id: "citrus", label: "Citrus" },
              { id: "earthy", label: "Earthy" },
              { id: "pine", label: "Pine" },
            ],
          },
          { id: "height", kind: "measure", label: "Height", unit: "cm", min: 0, max: 400 },
          { id: "comment", kind: "note", label: "Comment", maxLength: 20 },
        ],
      },
    ],
    ...overrides,
  };
}

function field(t: PhenoScoringTemplate, id: string) {
  const f = t.sections.flatMap((s) => s.fields).find((x) => x.id === id);
  if (!f) throw new Error(`missing field ${id}`);
  return f;
}

describe("validatePhenoScoringTemplate", () => {
  it("accepts a well-formed template", () => {
    expect(validatePhenoScoringTemplate(makeTemplate())).toEqual({ ok: true, issues: [] });
  });

  it("accepts every shipped example template", () => {
    for (const t of PHENO_SCORING_EXAMPLE_TEMPLATES) {
      expect(validatePhenoScoringTemplate(t)).toEqual({ ok: true, issues: [] });
    }
  });

  it("rejects a scale whose min is not below its max", () => {
    const r = validatePhenoScoringTemplate(makeTemplate({ scale: { min: 5, max: 5, step: 1 } }));
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("scale_range_invalid");
  });

  it("rejects a non-positive step and a step that does not divide the range", () => {
    expect(
      validatePhenoScoringTemplate(makeTemplate({ scale: { min: 1, max: 5, step: 0 } })).issues.map(
        (i) => i.code,
      ),
    ).toContain("scale_step_invalid");
    expect(
      validatePhenoScoringTemplate(
        makeTemplate({ scale: { min: 0, max: 10, step: 3 } }),
      ).issues.map((i) => i.code),
    ).toContain("scale_step_invalid");
  });

  it("rejects a missing id, a non-integer version and duplicate field ids", () => {
    const base = makeTemplate();
    const dup = {
      ...base,
      id: " ",
      version: 1.5,
      sections: [...base.sections, { id: "extra", title: "Extra", fields: [field(base, "vigor")] }],
    };
    const codes = validatePhenoScoringTemplate(dup).issues.map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "template_id_missing",
        "template_version_invalid",
        "field_id_duplicate",
      ]),
    );
  });

  it("rejects choice fields with no options or duplicate option ids", () => {
    const t = makeTemplate({
      sections: [
        {
          id: "s",
          title: "S",
          fields: [
            { id: "a", kind: "single", label: "A", options: [] },
            {
              id: "b",
              kind: "multi",
              label: "B",
              options: [
                { id: "x", label: "X" },
                { id: "x", label: "X again" },
              ],
            },
          ],
        },
      ],
    });
    const codes = validatePhenoScoringTemplate(t).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["options_missing", "option_id_duplicate"]));
  });

  it("is null-safe on garbage input", () => {
    expect(validatePhenoScoringTemplate(null).ok).toBe(false);
    expect(validatePhenoScoringTemplate(undefined).ok).toBe(false);
    expect(validatePhenoScoringTemplate({}).ok).toBe(false);
  });
});

describe("scale is a template parameter", () => {
  it("a field without its own scale uses the template scale", () => {
    const t = makeTemplate();
    expect(resolveFieldScale(t, field(t, "vigor"))).toEqual({ min: 1, max: 5, step: 1 });
  });

  it("a field-level scale overrides the template scale", () => {
    const t = makeTemplate();
    expect(resolveFieldScale(t, field(t, "fine"))).toEqual({ min: 0, max: 10, step: 0.5 });
  });

  it("the same value is valid on a 0–10 template and out of range on a 1–5 one", () => {
    const fiveScale = makeTemplate();
    const tenScale = makeTemplate({ scale: { min: 0, max: 10, step: 1 } });
    expect(validateFieldValue(tenScale, field(tenScale, "vigor"), 8)).toEqual({
      status: "valid",
      value: 8,
    });
    expect(validateFieldValue(fiveScale, field(fiveScale, "vigor"), 8)).toEqual({
      status: "invalid",
      reason: "out_of_range",
    });
  });
});

describe("validateFieldValue", () => {
  const t = makeTemplate();

  it("treats null and undefined as not scored, never as zero", () => {
    expect(validateFieldValue(t, field(t, "vigor"), null)).toEqual({ status: "not_scored" });
    expect(validateFieldValue(t, field(t, "vigor"), undefined)).toEqual({ status: "not_scored" });
  });

  it("accepts zero when the scale starts at zero", () => {
    expect(validateFieldValue(t, field(t, "fine"), 0)).toEqual({ status: "valid", value: 0 });
  });

  it("flags off-step values without rounding them", () => {
    expect(validateFieldValue(t, field(t, "vigor"), 3.5)).toEqual({
      status: "invalid",
      reason: "off_step",
    });
    expect(validateFieldValue(t, field(t, "fine"), 7.5)).toEqual({ status: "valid", value: 7.5 });
    expect(validateFieldValue(t, field(t, "fine"), 7.25)).toEqual({
      status: "invalid",
      reason: "off_step",
    });
  });

  it("does not coerce strings or non-finite numbers", () => {
    expect(validateFieldValue(t, field(t, "vigor"), "3")).toEqual({
      status: "invalid",
      reason: "wrong_type",
    });
    expect(validateFieldValue(t, field(t, "vigor"), Number.NaN)).toEqual({
      status: "invalid",
      reason: "wrong_type",
    });
    expect(validateFieldValue(t, field(t, "height"), Number.POSITIVE_INFINITY)).toEqual({
      status: "invalid",
      reason: "wrong_type",
    });
  });

  it("checks single-choice options", () => {
    expect(validateFieldValue(t, field(t, "structure"), "dense")).toEqual({
      status: "valid",
      value: "dense",
    });
    expect(validateFieldValue(t, field(t, "structure"), "lanky")).toEqual({
      status: "invalid",
      reason: "unknown_option",
    });
  });

  it("checks multi-choice options, duplicates and the selection cap", () => {
    expect(validateFieldValue(t, field(t, "notes"), ["citrus", "pine"])).toEqual({
      status: "valid",
      value: ["citrus", "pine"],
    });
    expect(validateFieldValue(t, field(t, "notes"), [])).toEqual({ status: "not_scored" });
    expect(validateFieldValue(t, field(t, "notes"), ["citrus", "citrus"])).toEqual({
      status: "invalid",
      reason: "duplicate_option",
    });
    expect(validateFieldValue(t, field(t, "notes"), ["citrus", "pine", "earthy"])).toEqual({
      status: "invalid",
      reason: "too_many_selections",
    });
    expect(validateFieldValue(t, field(t, "notes"), ["citrus", "gas"])).toEqual({
      status: "invalid",
      reason: "unknown_option",
    });
  });

  it("checks measure bounds", () => {
    expect(validateFieldValue(t, field(t, "height"), 92.4)).toEqual({
      status: "valid",
      value: 92.4,
    });
    expect(validateFieldValue(t, field(t, "height"), -1)).toEqual({
      status: "invalid",
      reason: "out_of_range",
    });
  });

  it("checks note length and treats a blank note as not scored", () => {
    expect(validateFieldValue(t, field(t, "comment"), "  ")).toEqual({ status: "not_scored" });
    expect(validateFieldValue(t, field(t, "comment"), "Sticky by day 50")).toEqual({
      status: "valid",
      value: "Sticky by day 50",
    });
    expect(validateFieldValue(t, field(t, "comment"), "x".repeat(21))).toEqual({
      status: "invalid",
      reason: "too_long",
    });
  });
});

describe("evaluatePhenoScoringResponse", () => {
  const t = makeTemplate();

  it("reports each field in template order with honest counts", () => {
    const r = evaluatePhenoScoringResponse(t, {
      templateId: "test-template",
      templateVersion: 1,
      values: { comment: "ok", vigor: 4, structure: "lanky", fine: null },
    });
    if (r.status !== "evaluated") throw new Error("expected evaluated");
    expect(r.fields.map((f) => f.fieldId)).toEqual([
      "vigor",
      "fine",
      "structure",
      "notes",
      "height",
      "comment",
    ]);
    expect(r.scoredCount).toBe(2);
    expect(r.invalidCount).toBe(1);
    expect(r.notScoredCount).toBe(3);
    expect(r.fieldCount).toBe(6);
    expect(r.requiredMissing).toEqual([]);
    expect(r.complete).toBe(false);
  });

  it("lists required fields that are not scored", () => {
    const r = evaluatePhenoScoringResponse(t, {
      templateId: "test-template",
      templateVersion: 1,
      values: {},
    });
    if (r.status !== "evaluated") throw new Error("expected evaluated");
    expect(r.requiredMissing).toEqual(["vigor"]);
    expect(r.scoredCount).toBe(0);
  });

  it("reports value keys the template does not define instead of dropping them silently", () => {
    const r = evaluatePhenoScoringResponse(t, {
      templateId: "test-template",
      templateVersion: 1,
      values: { vigor: 3, mystery: 9, another: 1 },
    });
    if (r.status !== "evaluated") throw new Error("expected evaluated");
    expect(r.unknownFieldIds).toEqual(["another", "mystery"]);
  });

  it("refuses to read a response saved against another template or version", () => {
    expect(
      evaluatePhenoScoringResponse(t, {
        templateId: "test-template",
        templateVersion: 2,
        values: {},
      }),
    ).toEqual({ status: "template_mismatch" });
    expect(
      evaluatePhenoScoringResponse(t, { templateId: "other", templateVersion: 1, values: {} }),
    ).toEqual({ status: "template_mismatch" });
  });

  it("is complete only when every field is scored and none is invalid", () => {
    const r = evaluatePhenoScoringResponse(t, {
      templateId: "test-template",
      templateVersion: 1,
      values: {
        vigor: 5,
        fine: 9.5,
        structure: "open",
        notes: ["earthy"],
        height: 120,
        comment: "done",
      },
    });
    if (r.status !== "evaluated") throw new Error("expected evaluated");
    expect(r.complete).toBe(true);
  });

  it("produces no total, average or composite", () => {
    const r = evaluatePhenoScoringResponse(t, {
      templateId: "test-template",
      templateVersion: 1,
      values: { vigor: 5, fine: 10 },
    });
    const keys = Object.keys(r);
    for (const banned of ["total", "average", "composite", "score", "rank"]) {
      expect(keys).not.toContain(banned);
    }
  });

  it("is deterministic and does not mutate its inputs", () => {
    const values = { vigor: 2, notes: ["pine", "citrus"] };
    const snapshot = JSON.stringify({ t, values });
    const a = evaluatePhenoScoringResponse(t, {
      templateId: "test-template",
      templateVersion: 1,
      values,
    });
    const b = evaluatePhenoScoringResponse(t, {
      templateId: "test-template",
      templateVersion: 1,
      values,
    });
    expect(a).toEqual(b);
    expect(JSON.stringify({ t, values })).toBe(snapshot);
  });

  it("is null-safe on a missing response", () => {
    expect(evaluatePhenoScoringResponse(t, null)).toEqual({ status: "template_mismatch" });
  });
});

describe("example templates", () => {
  it("stay draft and internal until a grower-facing launch is decided", () => {
    for (const t of PHENO_SCORING_EXAMPLE_TEMPLATES) {
      expect(t.status).toBe("draft");
      expect(t.visibility).toBe("internal");
    }
  });

  it("use different scales, proving the scale is not hard-coded", () => {
    expect(VERDANT_PHENO_SCORECARD_TEMPLATE.scale).not.toEqual(
      VERDANT_TASTING_SCORECARD_TEMPLATE.scale,
    );
  });

  it("have unique ids", () => {
    const ids = PHENO_SCORING_EXAMPLE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carry no ranking or keeper-picking language", () => {
    const text = JSON.stringify(PHENO_SCORING_EXAMPLE_TEMPLATES).toLowerCase();
    for (const phrase of ["winner", "top pick", "recommended keeper", "guaranteed", "best pheno"]) {
      expect(text).not.toContain(phrase);
    }
  });
});
