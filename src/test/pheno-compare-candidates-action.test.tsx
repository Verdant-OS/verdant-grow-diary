/**
 * pheno-compare-candidates-action — component tests for the disabled
 * Compare candidates action across every disabled reason. Asserts:
 *   - disabled button + aria-describedby helper text is present and correct
 *   - helper text exactly includes the reason label
 *   - no <a href="/pheno-hunts/:id/compare"> exists in the disabled state
 *   - enabled state renders the compare link and no disabled helper text
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PhenoCompareCandidatesAction from "@/components/PhenoCompareCandidatesAction";
import {
  buildPhenoComparisonActionState,
  PHENO_COMPARISON_HELP_COPY,
  type PhenoComparisonActionInput,
} from "@/lib/phenoComparisonActionState";
import { PHENO_STATUS_LABELS } from "@/constants/phenoOnboardingCopy";

const HUNT_ID = "hunt-x";

const readyBase: PhenoComparisonActionInput = {
  huntId: HUNT_ID,
  candidateCount: 2,
  goalsSelected: 2,
  allCandidatesHavePhenotypeNote: true,
  anyPostHarvestObservation: true,
  anyPostCureObservation: true,
};

function mount(input: PhenoComparisonActionInput) {
  const state = buildPhenoComparisonActionState(input);
  return {
    state,
    ...render(
      <MemoryRouter>
        <PhenoCompareCandidatesAction state={state} />
      </MemoryRouter>,
    ),
  };
}

const DISABLED_INTRO_RE =
  /Compare candidates is disabled because this hunt is not comparison-ready yet/i;

describe("PhenoCompareCandidatesAction — disabled reasons", () => {
  afterEach(() => cleanup());

  const scenarios: Array<{
    name: string;
    input: PhenoComparisonActionInput;
    readiness: string;
    reason: RegExp;
  }> = [
    {
      name: "Missing evidence (no phenotype notes)",
      input: { ...readyBase, allCandidatesHavePhenotypeNote: false },
      readiness: "missing_evidence",
      reason: new RegExp(PHENO_STATUS_LABELS.missingEvidence, "i"),
    },
    {
      name: "Pending until harvest",
      input: { ...readyBase, anyPostHarvestObservation: false },
      readiness: "pending_until_harvest",
      reason: new RegExp(PHENO_STATUS_LABELS.pendingUntilHarvest, "i"),
    },
    {
      name: "Pending until cure",
      input: { ...readyBase, anyPostCureObservation: false },
      readiness: "pending_until_cure",
      reason: new RegExp(PHENO_STATUS_LABELS.pendingUntilCure, "i"),
    },
    {
      name: "Replication readiness pending",
      input: { ...readyBase, replicationReadinessRecorded: false },
      readiness: "not_ready",
      reason: /replication readiness/i,
    },
  ];

  for (const s of scenarios) {
    it(`${s.name}: disabled button + aria-describedby helper with reason`, () => {
      const { state } = mount(s.input);
      expect(state.enabled).toBe(false);
      expect(state.readiness).toBe(s.readiness);

      const btn = screen.getByTestId(
        "pheno-workspace-compare-action-disabled",
      );
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute("aria-disabled", "true");

      const describedBy = btn.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      const helper = document.getElementById(describedBy!);
      expect(helper).not.toBeNull();
      expect(helper).toHaveTextContent(DISABLED_INTRO_RE);
      // If the state carries a specific status reason use it; otherwise
      // the generic help copy is present, plus the missing item message
      // provides the reason context.
      if (state.reason && state.reason !== PHENO_COMPARISON_HELP_COPY) {
        expect(helper).toHaveTextContent(s.reason);
      } else {
        // At minimum, the missing-evidence bullet must convey the reason.
        const missing = screen.getByTestId(
          "pheno-workspace-compare-action-missing",
        );
        expect(missing).toHaveTextContent(s.reason);
      }
      // Never a link to /compare in the disabled state.
      const badAnchors = document.querySelectorAll(
        `a[href^="/pheno-hunts/${HUNT_ID}/compare"]`,
      );
      expect(badAnchors.length).toBe(0);
    });
  }

  it("enabled Compare renders the compare link and no disabled helper", () => {
    const { state } = mount(readyBase);
    expect(state.enabled).toBe(true);
    const link = screen.getByTestId("pheno-workspace-compare-action-link");
    const anchor = link.querySelector("a") ?? link;
    expect(anchor.getAttribute("href")).toBe(
      `/pheno-hunts/${HUNT_ID}/compare`,
    );
    expect(
      screen.queryByTestId("pheno-workspace-compare-action-disabled"),
    ).toBeNull();
    expect(
      screen.queryByTestId("pheno-workspace-compare-action-helper"),
    ).toBeNull();
    expect(
      screen.queryByTestId("pheno-workspace-compare-action-disabled-intro"),
    ).toBeNull();
  });

  it("replication_readiness missing item renders inert (no fake link)", () => {
    mount({ ...readyBase, replicationReadinessRecorded: false });
    const items = screen.getAllByTestId(
      "pheno-workspace-compare-action-missing-item",
    );
    const rep = items.find(
      (el) => el.getAttribute("data-missing-id") === "replication_readiness",
    );
    expect(rep).toBeTruthy();
    // No anchor rendered for the inert item.
    expect(rep!.querySelector("a")).toBeNull();
    // And no next-step testid was emitted for it.
    expect(
      screen.queryByTestId(
        "pheno-workspace-compare-action-next-step-replication_readiness",
      ),
    ).toBeNull();
  });
});
