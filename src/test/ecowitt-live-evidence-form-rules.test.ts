/**
 * EcoWitt Live Evidence form-rules tests.
 *
 * Validates the pure helper that turns operator-entered form state into a
 * LiveSourceTruthEvidence object for evaluateLiveSourceTruth. No network,
 * no persistence, no Date.now().
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildLiveSourceTruthEvidenceFromForm,
  createInitialEcowittLiveEvidenceFormState,
  ECOWITT_FORM_METRIC_KEYS,
  type EcowittLiveEvidenceFormState,
} from "@/lib/ecowittLiveEvidenceFormRules";

function withMetric(
  state: EcowittLiveEvidenceFormState,
  key: (typeof ECOWITT_FORM_METRIC_KEYS)[number],
  patch: Partial<{
    enabled: boolean;
    backend_value: string;
    controller_value: string;
    unit: string;
    tolerance: string;
  }>,
): EcowittLiveEvidenceFormState {
  return {
    ...state,
    metric_rows: state.metric_rows.map((r) =>
      r.key === key ? { ...r, ...patch } : r,
    ),
  };
}

describe("buildLiveSourceTruthEvidenceFromForm", () => {
  it("omits disabled metric rows", () => {
    const state = createInitialEcowittLiveEvidenceFormState();
    const { evidence } = buildLiveSourceTruthEvidenceFromForm(state);
    expect(evidence.metrics).toEqual([]);
  });

  it("parses enabled backend and controller values", () => {
    let s = createInitialEcowittLiveEvidenceFormState();
    s = withMetric(s, "temp_f", {
      enabled: true,
      backend_value: "72.5",
      controller_value: "72.6",
    });
    const { evidence, form_warnings } =
      buildLiveSourceTruthEvidenceFromForm(s);
    expect(form_warnings).toEqual([]);
    expect(evidence.metrics).toEqual([
      {
        key: "temp_f",
        backend_value: 72.5,
        controller_value: 72.6,
        unit: null,
        tolerance: null,
      },
    ]);
  });

  it("blank controller value becomes missing controller (null)", () => {
    let s = createInitialEcowittLiveEvidenceFormState();
    s = withMetric(s, "humidity_pct", {
      enabled: true,
      backend_value: "55",
      controller_value: "",
    });
    const { evidence } = buildLiveSourceTruthEvidenceFromForm(s);
    expect(evidence.metrics?.[0].controller_value).toBeNull();
    expect(evidence.metrics?.[0].backend_value).toBe(55);
  });

  it("blank backend value becomes missing backend (null)", () => {
    let s = createInitialEcowittLiveEvidenceFormState();
    s = withMetric(s, "humidity_pct", {
      enabled: true,
      backend_value: "",
      controller_value: "60",
    });
    const { evidence } = buildLiveSourceTruthEvidenceFromForm(s);
    expect(evidence.metrics?.[0].backend_value).toBeNull();
    expect(evidence.metrics?.[0].controller_value).toBe(60);
  });

  it("blank tolerance leaves tolerance null (default applies in evaluator)", () => {
    let s = createInitialEcowittLiveEvidenceFormState();
    s = withMetric(s, "temp_f", {
      enabled: true,
      backend_value: "72",
      controller_value: "72",
      tolerance: "",
    });
    const { evidence, form_warnings } =
      buildLiveSourceTruthEvidenceFromForm(s);
    expect(evidence.metrics?.[0].tolerance).toBeNull();
    expect(form_warnings).toEqual([]);
  });

  it("numeric tolerance override is passed through", () => {
    let s = createInitialEcowittLiveEvidenceFormState();
    s = withMetric(s, "temp_f", {
      enabled: true,
      backend_value: "72",
      controller_value: "72",
      tolerance: "0.5",
    });
    const { evidence, form_warnings } =
      buildLiveSourceTruthEvidenceFromForm(s);
    expect(evidence.metrics?.[0].tolerance).toBe(0.5);
    expect(form_warnings).toEqual([]);
  });

  it("negative tolerance is rejected with a form warning", () => {
    let s = createInitialEcowittLiveEvidenceFormState();
    s = withMetric(s, "temp_f", {
      enabled: true,
      backend_value: "72",
      controller_value: "72",
      tolerance: "-1",
    });
    const { evidence, form_warnings } =
      buildLiveSourceTruthEvidenceFromForm(s);
    expect(evidence.metrics?.[0].tolerance).toBeNull();
    expect(form_warnings.join(" ")).toMatch(/negative/i);
  });

  it("non-numeric tolerance is rejected with a form warning", () => {
    let s = createInitialEcowittLiveEvidenceFormState();
    s = withMetric(s, "temp_f", {
      enabled: true,
      backend_value: "72",
      controller_value: "72",
      tolerance: "abc",
    });
    const { evidence, form_warnings } =
      buildLiveSourceTruthEvidenceFromForm(s);
    expect(evidence.metrics?.[0].tolerance).toBeNull();
    expect(form_warnings.join(" ")).toMatch(/not a valid number/i);
  });

  it("preserves stable metric order regardless of row order", () => {
    let s = createInitialEcowittLiveEvidenceFormState();
    s = withMetric(s, "ph", { enabled: true, backend_value: "6", controller_value: "6" });
    s = withMetric(s, "temp_f", { enabled: true, backend_value: "72", controller_value: "72" });
    s = withMetric(s, "humidity_pct", { enabled: true, backend_value: "55", controller_value: "55" });
    // Shuffle the rows
    s = { ...s, metric_rows: [...s.metric_rows].reverse() };
    const { evidence } = buildLiveSourceTruthEvidenceFromForm(s);
    const keys = (evidence.metrics ?? []).map((m) => m.key);
    expect(keys).toEqual(["temp_f", "humidity_pct", "ph"]);
  });

  it("passes through identifying fields and presence flags", () => {
    const s: EcowittLiveEvidenceFormState = {
      ...createInitialEcowittLiveEvidenceFormState(),
      source: "live",
      tent_id: "tent-1",
      plant_id: "plant-1",
      captured_at: "2026-06-09T12:00:00Z",
      now: "2026-06-09T12:01:00Z",
      raw_payload_present: true,
      normalized_payload_present: true,
      operator_compared_controller: true,
    };
    const { evidence } = buildLiveSourceTruthEvidenceFromForm(s);
    expect(evidence.source).toBe("live");
    expect(evidence.tent_id).toBe("tent-1");
    expect(evidence.plant_id).toBe("plant-1");
    expect(evidence.captured_at).toBe("2026-06-09T12:00:00Z");
    expect(evidence.now).toBe("2026-06-09T12:01:00Z");
    expect(evidence.raw_payload_present).toBe(true);
    expect(evidence.normalized_payload_present).toBe(true);
    expect(evidence.operator_compared_controller).toBe(true);
  });

  it("blank tent_id and plant_id map to null", () => {
    const { evidence } = buildLiveSourceTruthEvidenceFromForm(
      createInitialEcowittLiveEvidenceFormState(),
    );
    expect(evidence.tent_id).toBeNull();
    expect(evidence.plant_id).toBeNull();
  });
});

describe("ecowittLiveEvidenceFormRules — static safety", () => {
  const rawSrc = readFileSync(
    resolve(__dirname, "../../src/lib/ecowittLiveEvidenceFormRules.ts"),
    "utf8",
  );
  const src = rawSrc
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  it("does not call Date.now()", () => {
    expect(src).not.toMatch(/Date\.now\s*\(/);
  });

  it("has no unsafe imports", () => {
    const fromMatches = rawSrc.match(/from\s+["'][^"']+["']/g) || [];
    for (const m of fromMatches) {
      expect(m).toMatch(/liveSourceTruthGateRules/);
    }
  });

  it("has no fetch / supabase / persistence references", () => {
    expect(src).not.toMatch(/fetch\s*\(/);
    expect(src).not.toMatch(/supabase\./i);
    expect(src).not.toMatch(/from\s+["'][^"']*supabase/i);
    expect(src).not.toContain("localStorage");
    expect(src).not.toContain("sessionStorage");
    expect(src).not.toContain("navigator.clipboard");
  });
});
