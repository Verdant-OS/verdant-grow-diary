/**
 * EcoWitt Tonight Mode view model — pure deterministic tests.
 */
import { describe, it, expect } from "vitest";
import { buildEcowittTonightModeViewModel } from "@/lib/ecowittTonightModeViewModel";
import { evaluateLiveSourceTruth } from "@/lib/liveSourceTruthGateRules";
import {
  buildLiveSourceTruthEvidenceFromForm,
  createInitialEcowittLiveEvidenceFormState,
  type EcowittLiveEvidenceFormState,
} from "@/lib/ecowittLiveEvidenceFormRules";

const FORBIDDEN_COPY = [
  /execute/i,
  /run command/i,
  /send command/i,
  /control device/i,
  /turn on/i,
  /turn off/i,
  /set fan/i,
  /set light/i,
  /flush immediately/i,
  /guaranteed/i,
  /definitely/i,
  /certainly/i,
];

function liveVerifiedForm(): EcowittLiveEvidenceFormState {
  const base = createInitialEcowittLiveEvidenceFormState();
  return {
    ...base,
    source: "live",
    tent_id: "tent-1",
    captured_at: "2026-06-09T12:00:00Z",
    now: "2026-06-09T12:01:00Z",
    raw_payload_present: true,
    normalized_payload_present: true,
    operator_compared_controller: true,
    metric_rows: base.metric_rows.map((r) =>
      r.key === "temp_f"
        ? { ...r, enabled: true, backend_value: "72", controller_value: "72" }
        : r,
    ),
  };
}

function evaluateForm(form: EcowittLiveEvidenceFormState) {
  const built = buildLiveSourceTruthEvidenceFromForm(form);
  return {
    result: evaluateLiveSourceTruth(built.evidence),
    formWarnings: built.form_warnings,
  };
}

function vmText(vm: ReturnType<typeof buildEcowittTonightModeViewModel>): string {
  return [
    vm.headline,
    vm.summary,
    vm.next_best_action,
    vm.safety_note,
    ...vm.top_blockers,
    ...vm.checklist_items.flatMap((c) => [c.label, c.helper, c.status]),
  ].join("\n");
}

describe("buildEcowittTonightModeViewModel", () => {
  it("default state with no evaluator result is blocked", () => {
    const vm = buildEcowittTonightModeViewModel({});
    expect(vm.status).toBe("blocked");
    expect(vm.can_export_snapshot).toBe(false);
    expect(vm.can_claim_live_proof).toBe(false);
    expect(vm.next_best_action).toMatch(/enter.*evidence.*evaluate/i);
  });

  it("safety note is present and mentions no device control", () => {
    const vm = buildEcowittTonightModeViewModel({});
    expect(vm.safety_note).toMatch(/does not.*control devices/i);
  });

  it("verified_live with no blockers → live_proof_supported and can claim live proof", () => {
    const { result, formWarnings } = evaluateForm(liveVerifiedForm());
    expect(result.verdict).toBe("verified_live");
    const vm = buildEcowittTonightModeViewModel({
      evaluator_result: result,
      form_warnings: formWarnings,
      export_ready: true,
    });
    expect(vm.status).toBe("live_proof_supported");
    expect(vm.can_claim_live_proof).toBe(true);
    expect(vm.can_export_snapshot).toBe(true);
    expect(vm.next_best_action).toMatch(/export.*snapshot/i);
    expect(vm.summary).toMatch(/operator review|repeat the check/i);
  });

  it("verified_live with blocking unit warning prevents live proof", () => {
    const { result } = evaluateForm(liveVerifiedForm());
    const vm = buildEcowittTonightModeViewModel({
      evaluator_result: result,
      unit_warnings: [
        {
          metric_key: "temp_f",
          severity: "blocks_live_proof",
          message: "Backend F vs controller C",
          operator_fix: "Normalize units.",
        },
      ],
      export_ready: true,
    });
    expect(vm.status).toBe("needs_review");
    expect(vm.can_claim_live_proof).toBe(false);
  });

  it("verified_live but a plant result is not verified → not live_proof_supported", () => {
    const { result } = evaluateForm(liveVerifiedForm());
    const stale = evaluateForm({
      ...liveVerifiedForm(),
      captured_at: "2026-06-09T10:00:00Z",
    }).result;
    const vm = buildEcowittTonightModeViewModel({
      evaluator_result: result,
      plant_results: [
        { plant_id: "p-1", result },
        { plant_id: "p-2", result: stale },
      ],
      export_ready: true,
    });
    expect(vm.can_claim_live_proof).toBe(false);
    expect(vm.status).toBe("needs_review");
  });

  it("verified_live but optional timestamp gate blocked → not live_proof_supported", () => {
    const { result } = evaluateForm(liveVerifiedForm());
    const vm = buildEcowittTonightModeViewModel({
      evaluator_result: result,
      timestamp_gate: { state: "blocked", blocker_message: "Clock skew detected." },
      export_ready: true,
    });
    expect(vm.can_claim_live_proof).toBe(false);
    expect(vm.top_blockers.join("\n")).toMatch(/clock skew/i);
  });

  it("each verdict maps to its specific next best action", () => {
    const verdicts: Array<[string, RegExp]> = [
      ["unverified_live", /controller\/app comparison/i],
      ["mismatch", /units, channel mapping/i],
      ["stale", /recent captured_at/i],
      ["invalid", /missing, malformed, or suspicious/i],
      ["not_live_proof", /replace demo\/manual\/imported/i],
    ];
    for (const [verdict, re] of verdicts) {
      const result = {
        verdict,
        is_live_proof: false,
        confidence_label: "none",
        summary: "x",
        evidence: {} as never,
        limitations: [],
        warnings: [],
        required_next_steps: [],
        metric_results: [],
      } as never;
      const vm = buildEcowittTonightModeViewModel({ evaluator_result: result });
      expect(vm.next_best_action).toMatch(re);
    }
  });

  it("top blockers dedupe and cap at 3", () => {
    const result = {
      verdict: "invalid",
      is_live_proof: false,
      confidence_label: "none",
      summary: "x",
      evidence: {} as never,
      limitations: ["A", "A", "B"],
      warnings: ["C", "D", "E", "F"],
      required_next_steps: ["B", "G"],
      metric_results: [],
    } as never;
    const vm = buildEcowittTonightModeViewModel({ evaluator_result: result });
    expect(vm.top_blockers.length).toBeLessThanOrEqual(3);
    const uniq = new Set(vm.top_blockers);
    expect(uniq.size).toBe(vm.top_blockers.length);
  });

  it("checklist items render in stable order", () => {
    const vm = buildEcowittTonightModeViewModel({});
    expect(vm.checklist_items.map((c) => c.id)).toEqual([
      "network-checked",
      "evidence-entered",
      "timestamp-sane",
      "device-identity-confirmed",
      "controller-comparison-complete",
      "unit-warnings-clear",
      "source-truth-evaluated",
      "snapshot-exported",
    ]);
  });

  it("snapshot exported stays missing until input says exported", () => {
    const { result } = evaluateForm(liveVerifiedForm());
    const vm = buildEcowittTonightModeViewModel({
      evaluator_result: result,
      export_ready: true,
    });
    const item = vm.checklist_items.find((c) => c.id === "snapshot-exported")!;
    expect(item.status).toBe("missing");
    const vm2 = buildEcowittTonightModeViewModel({
      evaluator_result: result,
      export_ready: true,
      snapshot_exported: true,
    });
    expect(
      vm2.checklist_items.find((c) => c.id === "snapshot-exported")!.status,
    ).toBe("done");
  });

  it("does not mutate input", () => {
    const input = {
      evaluator_result: null,
      form_warnings: ["a"],
      unit_warnings: [],
      required_next_steps: ["x"],
    };
    const snapshot = JSON.stringify(input);
    buildEcowittTonightModeViewModel(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("output is deterministic", () => {
    const { result } = evaluateForm(liveVerifiedForm());
    const a = buildEcowittTonightModeViewModel({
      evaluator_result: result,
      export_ready: true,
    });
    const b = buildEcowittTonightModeViewModel({
      evaluator_result: result,
      export_ready: true,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("output is frozen", () => {
    const vm = buildEcowittTonightModeViewModel({});
    expect(Object.isFrozen(vm)).toBe(true);
  });

  it("contains no forbidden execution copy", () => {
    const { result } = evaluateForm(liveVerifiedForm());
    const variants = [
      buildEcowittTonightModeViewModel({}),
      buildEcowittTonightModeViewModel({
        evaluator_result: result,
        export_ready: true,
      }),
    ];
    for (const vm of variants) {
      const text = vmText(vm);
      for (const re of FORBIDDEN_COPY) {
        expect(text).not.toMatch(re);
      }
    }
  });
});
