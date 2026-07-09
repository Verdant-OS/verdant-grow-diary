/**
 * phenoHuntOnboardingViewModel — pure logic tests.
 */
import { describe, it, expect } from "vitest";
import {
  computePhenoHuntOnboardingViewModel,
  defaultEvidenceGoalSelection,
  PHENO_ONBOARDING_STEP_ORDER,
  type PhenoOnboardingDraft,
} from "@/lib/phenoHuntOnboardingViewModel";

function draft(over: Partial<PhenoOnboardingDraft> = {}): PhenoOnboardingDraft {
  return {
    name: "Summer Pheno Hunt",
    growId: "grow-1",
    tentId: "tent-1",
    notes: "",
    candidateIds: ["p1", "p2"],
    evidenceGoals: defaultEvidenceGoalSelection(),
    ...over,
  };
}

describe("computePhenoHuntOnboardingViewModel", () => {
  it("0 candidates → not comparison-ready, blocking reason present", () => {
    const vm = computePhenoHuntOnboardingViewModel(draft({ candidateIds: [] }));
    expect(vm.candidateStatus).toBe("none");
    expect(vm.readiness).toBe("not_ready");
    expect(vm.canCreate).toBe(false);
    expect(vm.blockingReasons).toContain("Select at least one candidate plant");
    // Candidate step and checklist step incomplete.
    const byId = Object.fromEntries(vm.steps.map((s) => [s.id, s]));
    expect(byId.candidates.complete).toBe(false);
    expect(byId.checklist.complete).toBe(false);
  });

  it("1 candidate → tracking only, still creatable, checklist calls out non-comparison state", () => {
    const vm = computePhenoHuntOnboardingViewModel(draft({ candidateIds: ["p1"] }));
    expect(vm.candidateStatus).toBe("tracking_only");
    expect(vm.candidateStatusLabel).toMatch(/tracking only/i);
    expect(vm.readiness).toBe("tracking_only");
    expect(vm.canCreate).toBe(true);
    const count = vm.checklist.find((c) => c.id === "candidate_count")!;
    expect(count.status).toBe("missing");
    expect(count.detail).toMatch(/not comparison-ready/i);
  });

  it("2+ candidates with goals → comparison_ready", () => {
    const vm = computePhenoHuntOnboardingViewModel(draft());
    expect(vm.candidateStatus).toBe("comparison_eligible");
    expect(vm.readiness).toBe("comparison_ready");
    expect(vm.canCreate).toBe(true);
    expect(vm.blockingReasons).toEqual([]);
  });

  it("missing evidence goals blocks creation and downgrades readiness", () => {
    const vm = computePhenoHuntOnboardingViewModel(draft({ evidenceGoals: [] }));
    expect(vm.readiness).toBe("not_ready");
    expect(vm.canCreate).toBe(false);
    expect(vm.blockingReasons).toContain("Select at least one evidence goal");
  });

  it("missing phenotype notes → checklist reports missing evidence", () => {
    const vm = computePhenoHuntOnboardingViewModel(
      draft({
        candidateEvidence: [
          { candidateId: "p1", hasPhenotypeNote: true },
          { candidateId: "p2", hasPhenotypeNote: false },
        ],
      }),
    );
    const note = vm.checklist.find((c) => c.id === "phenotype_notes")!;
    expect(note.status).toBe("missing");
    expect(note.detail).toMatch(/missing/i);
  });

  it("post-cure, replication readiness always start pending", () => {
    const vm = computePhenoHuntOnboardingViewModel(draft());
    const post = vm.checklist.find((c) => c.id === "post_cure")!;
    const repl = vm.checklist.find((c) => c.id === "replication_readiness")!;
    const postHarvest = vm.checklist.find((c) => c.id === "post_harvest")!;
    expect(post.status).toBe("pending");
    expect(post.detail).toMatch(/post-cure follow-up pending/i);
    expect(repl.status).toBe("pending");
    expect(postHarvest.status).toBe("pending");
  });

  it("empty hunt name blocks basics step and creation", () => {
    const vm = computePhenoHuntOnboardingViewModel(draft({ name: "   " }));
    expect(vm.canCreate).toBe(false);
    expect(vm.blockingReasons).toContain("Hunt name is required");
    const basics = vm.steps.find((s) => s.id === "basics")!;
    expect(basics.complete).toBe(false);
    expect(basics.reason).toMatch(/name/i);
  });

  it("missing growId blocks basics step and creation", () => {
    const vm = computePhenoHuntOnboardingViewModel(draft({ growId: null }));
    expect(vm.canCreate).toBe(false);
    expect(vm.blockingReasons).toContain("Linked grow is required");
  });

  it("evidence goal summary flags pending goals", () => {
    const vm = computePhenoHuntOnboardingViewModel(draft());
    const post = vm.evidenceGoalSummary.find((g) => g.id === "post_cure")!;
    const structure = vm.evidenceGoalSummary.find((g) => g.id === "structure")!;
    expect(post.pending).toBe(true);
    expect(structure.pending).toBe(false);
  });

  it("output is deterministic for identical input", () => {
    const d = draft();
    const a = computePhenoHuntOnboardingViewModel(d);
    const b = computePhenoHuntOnboardingViewModel(d);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("step order is fixed", () => {
    expect(PHENO_ONBOARDING_STEP_ORDER).toEqual([
      "basics",
      "candidates",
      "goals",
      "packet_preview",
      "checklist",
      "confirmation",
    ]);
  });

  it("confirmation step is only complete after setupCompleted flip", () => {
    const notConfirmed = computePhenoHuntOnboardingViewModel(draft());
    const confirmed = computePhenoHuntOnboardingViewModel(draft({ setupCompleted: true }));
    expect(notConfirmed.steps.find((s) => s.id === "confirmation")!.complete).toBe(false);
    expect(confirmed.steps.find((s) => s.id === "confirmation")!.complete).toBe(true);
  });

  // ---- Setup complete vs Comparison-ready separation ----

  it("setupCompleted true + missing evidence → Setup complete but not Comparison-ready", () => {
    // 1 candidate = tracking_only, no candidate evidence recorded.
    const vm = computePhenoHuntOnboardingViewModel(
      draft({ candidateIds: ["p1"], setupCompleted: true }),
    );
    const confirmation = vm.steps.find((s) => s.id === "confirmation")!;
    expect(confirmation.complete).toBe(true);
    // Readiness must not be comparison_ready just because setup is confirmed.
    expect(vm.readiness).not.toBe("comparison_ready");
    expect(vm.readinessLabel).not.toBe("Comparison-ready");
    expect(["Not comparison-ready yet", "Ready for tracking"]).toContain(vm.readinessLabel);
  });

  it("2+ candidates + goals + missing phenotype notes → Ready for tracking + Not comparison-ready in checklist", () => {
    const vm = computePhenoHuntOnboardingViewModel(
      draft({
        candidateIds: ["p1", "p2"],
        candidateEvidence: [
          { candidateId: "p1", hasPhenotypeNote: false },
          { candidateId: "p2", hasPhenotypeNote: false },
        ],
      }),
    );
    // The view model's `readiness` label reflects candidate eligibility; the
    // checklist reflects actual evidence gaps. Both must be visible.
    const note = vm.checklist.find((c) => c.id === "phenotype_notes")!;
    expect(note.status).toBe("missing");
    expect(note.detail).toMatch(/no phenotype notes/i);
    // The candidate count is comparison-eligible but evidence gaps remain.
    expect(vm.candidateStatus).toBe("comparison_eligible");
  });

  it("full required evidence + 2+ candidates → readiness label is Comparison-ready", () => {
    const vm = computePhenoHuntOnboardingViewModel(
      draft({
        candidateIds: ["p1", "p2"],
        candidateEvidence: [
          { candidateId: "p1", hasPhenotypeNote: true, hasPhotoOrObservation: true, hasLabel: true },
          { candidateId: "p2", hasPhenotypeNote: true, hasPhotoOrObservation: true, hasLabel: true },
        ],
      }),
    );
    expect(vm.readiness).toBe("comparison_ready");
    expect(vm.readinessLabel).toBe("Comparison-ready");
  });

  it("post-cure checklist item stays pending until cure", () => {
    const vm = computePhenoHuntOnboardingViewModel(draft());
    const post = vm.checklist.find((c) => c.id === "post_cure")!;
    expect(post.status).toBe("pending");
    expect(post.detail).toMatch(/pending until cure/i);
  });

  it("replication readiness stays pending, never inferred comparison-ready", () => {
    const vm = computePhenoHuntOnboardingViewModel(draft());
    const repl = vm.checklist.find((c) => c.id === "replication_readiness")!;
    expect(repl.status).toBe("pending");
    expect(repl.detail).toMatch(/pending/i);
    // Even with full early evidence, replication readiness stays pending.
    const full = computePhenoHuntOnboardingViewModel(
      draft({
        candidateEvidence: [
          { candidateId: "p1", hasPhenotypeNote: true, hasPhotoOrObservation: true, hasLabel: true },
          { candidateId: "p2", hasPhenotypeNote: true, hasPhotoOrObservation: true, hasLabel: true },
        ],
      }),
    );
    expect(full.checklist.find((c) => c.id === "replication_readiness")!.status).toBe("pending");
  });
});
