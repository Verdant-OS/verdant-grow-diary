/**
 * buildPhenoComparisonActionState — pure helper unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildPhenoComparisonActionState,
  PHENO_COMPARISON_HELP_COPY,
  PHENO_WORKSPACE_ANCHORS,
} from "@/lib/phenoComparisonActionState";
import { PHENO_STATUS_LABELS } from "@/constants/phenoOnboardingCopy";

const base = {
  huntId: "h1",
  candidateCount: 2,
  goalsSelected: 2,
  allCandidatesHavePhenotypeNote: true,
  anyPostHarvestObservation: true,
  anyPostCureObservation: true,
};

describe("buildPhenoComparisonActionState", () => {
  it("fewer than 2 candidates → not_ready, disabled, no target", () => {
    const s = buildPhenoComparisonActionState({ ...base, candidateCount: 1 });
    expect(s.enabled).toBe(false);
    expect(s.readiness).toBe("not_ready");
    expect(s.nextStepTarget).toBeNull();
    expect(s.missingEvidence).toContain("Add at least 2 candidates");
    expect(s.reason).toBe(PHENO_COMPARISON_HELP_COPY);
  });

  it("no goals → not_ready", () => {
    const s = buildPhenoComparisonActionState({ ...base, goalsSelected: 0 });
    expect(s.enabled).toBe(false);
    expect(s.missingEvidence).toContain("Select at least one evidence goal");
  });

  it("missing phenotype notes → missing_evidence", () => {
    const s = buildPhenoComparisonActionState({
      ...base,
      allCandidatesHavePhenotypeNote: false,
    });
    expect(s.readiness).toBe("missing_evidence");
    expect(s.reason).toBe("Missing evidence");
    expect(s.enabled).toBe(false);
  });

  it("no post-harvest → pending_until_harvest", () => {
    const s = buildPhenoComparisonActionState({
      ...base,
      anyPostHarvestObservation: false,
    });
    expect(s.readiness).toBe("pending_until_harvest");
    expect(s.reason).toBe("Pending until harvest");
  });

  it("no post-cure → pending_until_cure", () => {
    const s = buildPhenoComparisonActionState({
      ...base,
      anyPostCureObservation: false,
    });
    expect(s.readiness).toBe("pending_until_cure");
    expect(s.reason).toBe("Pending until cure");
  });

  it("replication readiness explicitly false → not_ready", () => {
    const s = buildPhenoComparisonActionState({
      ...base,
      replicationReadinessRecorded: false,
    });
    expect(s.readiness).toBe("not_ready");
    expect(s.enabled).toBe(false);
    expect(s.missingEvidence.join(" ")).toMatch(/replication readiness/i);
  });

  it("all evidence present → comparison_ready, enabled, correct route", () => {
    const s = buildPhenoComparisonActionState(base);
    expect(s.readiness).toBe("comparison_ready");
    expect(s.enabled).toBe(true);
    expect(s.nextStepTarget).toBe("/pheno-hunts/h1/compare");
    expect(s.label).toBe("Compare candidates");
  });

  it("missing huntId → disabled even when otherwise ready", () => {
    const s = buildPhenoComparisonActionState({ ...base, huntId: null });
    expect(s.enabled).toBe(false);
    expect(s.nextStepTarget).toBeNull();
  });

  it("missing-evidence items carry safe workspace anchor targets (never /compare)", () => {
    const s = buildPhenoComparisonActionState({
      ...base,
      allCandidatesHavePhenotypeNote: false,
    });
    expect(s.missingEvidenceItems.length).toBeGreaterThan(0);
    for (const item of s.missingEvidenceItems) {
      if (item.nextStepTarget) {
        expect(item.nextStepTarget.startsWith("/pheno-hunts/h1/workspace#")).toBe(true);
        expect(item.nextStepTarget.includes("/compare")).toBe(false);
        expect(typeof item.nextStepLabel).toBe("string");
      } else {
        expect(item.nextStepLabel).toBeNull();
      }
    }
  });

  it("phenotype_notes item points at #phenotype-notes anchor", () => {
    const s = buildPhenoComparisonActionState({
      ...base,
      allCandidatesHavePhenotypeNote: false,
    });
    const item = s.missingEvidenceItems.find((i) => i.id === "phenotype_notes");
    expect(item?.nextStepTarget).toBe("/pheno-hunts/h1/workspace#phenotype-notes");
  });

  it("post_harvest item points at #post-harvest-notes anchor", () => {
    const s = buildPhenoComparisonActionState({
      ...base,
      anyPostHarvestObservation: false,
    });
    const item = s.missingEvidenceItems.find((i) => i.id === "post_harvest");
    expect(item?.nextStepTarget).toBe("/pheno-hunts/h1/workspace#post-harvest-notes");
  });

  it("post_cure item points at #post-cure-notes anchor", () => {
    const s = buildPhenoComparisonActionState({
      ...base,
      anyPostCureObservation: false,
    });
    const item = s.missingEvidenceItems.find((i) => i.id === "post_cure");
    expect(item?.nextStepTarget).toBe("/pheno-hunts/h1/workspace#post-cure-notes");
  });

  it("replication_readiness item is inert (null target — no anchor section yet)", () => {
    const s = buildPhenoComparisonActionState({
      ...base,
      replicationReadinessRecorded: false,
    });
    const item = s.missingEvidenceItems.find(
      (i) => i.id === "replication_readiness",
    );
    expect(item?.nextStepTarget).toBeNull();
    expect(item?.nextStepLabel).toBeNull();
  });

  it("missing huntId → all next-step targets are null (no fake links)", () => {
    const s = buildPhenoComparisonActionState({
      ...base,
      huntId: null,
      allCandidatesHavePhenotypeNote: false,
    });
    for (const item of s.missingEvidenceItems) {
      expect(item.nextStepTarget).toBeNull();
      expect(item.nextStepLabel).toBeNull();
    }
  });

  it("no duplicate anchor targets across items in a single state", () => {
    const s = buildPhenoComparisonActionState({
      ...base,
      candidateCount: 1,
      goalsSelected: 0,
    });
    const targets = s.missingEvidenceItems
      .map((i) => i.nextStepTarget)
      .filter((t): t is string => !!t);
    expect(new Set(targets).size).toBe(targets.length);
  });

  describe("disabled reason matrix — exact label, reason, and safe target", () => {
    const notReady = PHENO_STATUS_LABELS.notComparisonReadyYet;

    it("Missing evidence: correct label/reason, phenotype target, no /compare", () => {
      const s = buildPhenoComparisonActionState({
        ...base,
        allCandidatesHavePhenotypeNote: false,
      });
      expect(s.enabled).toBe(false);
      expect(s.readiness).toBe("missing_evidence");
      expect(s.label).toBe(notReady);
      expect(s.reason).toBe(PHENO_STATUS_LABELS.missingEvidence);
      const item = s.missingEvidenceItems.find(
        (i) => i.id === "phenotype_notes",
      );
      expect(item?.nextStepTarget).toBe(
        `/pheno-hunts/h1/workspace#${PHENO_WORKSPACE_ANCHORS.phenotype_notes}`,
      );
      expect(s.nextStepTarget).toBeNull();
      for (const it of s.missingEvidenceItems) {
        expect(it.nextStepTarget?.includes("/compare") ?? false).toBe(false);
      }
    });

    it("Pending until harvest: correct label/reason, post-harvest target", () => {
      const s = buildPhenoComparisonActionState({
        ...base,
        anyPostHarvestObservation: false,
      });
      expect(s.enabled).toBe(false);
      expect(s.readiness).toBe("pending_until_harvest");
      expect(s.label).toBe(notReady);
      expect(s.reason).toBe(PHENO_STATUS_LABELS.pendingUntilHarvest);
      const item = s.missingEvidenceItems.find(
        (i) => i.id === "post_harvest",
      );
      expect(item?.nextStepTarget).toBe(
        `/pheno-hunts/h1/workspace#${PHENO_WORKSPACE_ANCHORS.post_harvest}`,
      );
      expect(item?.nextStepTarget?.includes("/compare")).toBe(false);
    });

    it("Pending until cure: correct label/reason, post-cure target", () => {
      const s = buildPhenoComparisonActionState({
        ...base,
        anyPostCureObservation: false,
      });
      expect(s.enabled).toBe(false);
      expect(s.readiness).toBe("pending_until_cure");
      expect(s.label).toBe(notReady);
      expect(s.reason).toBe(PHENO_STATUS_LABELS.pendingUntilCure);
      const item = s.missingEvidenceItems.find((i) => i.id === "post_cure");
      expect(item?.nextStepTarget).toBe(
        `/pheno-hunts/h1/workspace#${PHENO_WORKSPACE_ANCHORS.post_cure}`,
      );
      expect(item?.nextStepTarget?.includes("/compare")).toBe(false);
    });

    it("Replication readiness pending: inert target (null), no /compare", () => {
      const s = buildPhenoComparisonActionState({
        ...base,
        replicationReadinessRecorded: false,
      });
      expect(s.enabled).toBe(false);
      expect(s.readiness).toBe("not_ready");
      expect(s.label).toBe(notReady);
      // No status-specific reason — generic help copy is surfaced.
      expect(s.reason).toBe(PHENO_COMPARISON_HELP_COPY);
      const item = s.missingEvidenceItems.find(
        (i) => i.id === "replication_readiness",
      );
      expect(item?.nextStepTarget).toBeNull();
      expect(item?.nextStepLabel).toBeNull();
      for (const it of s.missingEvidenceItems) {
        expect(it.nextStepTarget?.includes("/compare") ?? false).toBe(false);
      }
    });

    it("no disabled reason ever produces a /compare target on any item", () => {
      const perms: Array<Partial<typeof base> & { replicationReadinessRecorded?: boolean }> = [
        { candidateCount: 1 },
        { goalsSelected: 0 },
        { allCandidatesHavePhenotypeNote: false },
        { anyPostHarvestObservation: false },
        { anyPostCureObservation: false },
        { replicationReadinessRecorded: false },
      ];
      for (const p of perms) {
        const s = buildPhenoComparisonActionState({ ...base, ...p });
        for (const it of s.missingEvidenceItems) {
          expect(it.nextStepTarget?.includes("/compare") ?? false).toBe(false);
        }
      }
    });
  });
});
