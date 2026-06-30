/**
 * Release Readiness Evidence Receipt v1 — pure helper tests.
 *
 * Verifies the deterministic posture rules: only a passing ci_full_suite
 * receipt with no active blockers can yield GO; everything else HOLD.
 */
import { describe, it, expect } from "vitest";
import {
  deriveReleaseEvidencePosture,
  groupEvidenceReceipts,
  sortEvidenceReceipts,
  RELEASE_GO_REQUIREMENT_COPY,
  LOCAL_TARGETED_DISCLAIMER,
  MANUAL_NOTE_DISCLAIMER,
  RELEASE_READINESS_EVIDENCE_RECEIPTS,
  RELEASE_READINESS_EVIDENCE_BLOCKERS,
  type EvidenceReceipt,
  type EvidenceBlocker,
} from "@/lib/releaseReadinessEvidenceReceiptViewModel";

function makeReceipt(over: Partial<EvidenceReceipt>): EvidenceReceipt {
  return {
    id: "r",
    label: "Receipt",
    category: "local_targeted",
    status: "pass",
    sourceLabel: "test",
    capturedAt: "",
    commandOrSource: "noop",
    summary: "",
    blocksReleaseGo: false,
    canUnlockReleaseGo: false,
    notes: "",
    ...over,
  };
}

const passingCi = (over: Partial<EvidenceReceipt> = {}) =>
  makeReceipt({
    id: "ci-pass",
    label: "Full suite",
    category: "ci_full_suite",
    status: "pass",
    canUnlockReleaseGo: true,
    blocksReleaseGo: false,
    ...over,
  });

describe("deriveReleaseEvidencePosture", () => {
  it("HOLD with only local targeted passes", () => {
    const r = [
      makeReceipt({ id: "a", category: "local_targeted", status: "pass" }),
    ];
    const p = deriveReleaseEvidencePosture(r, []);
    expect(p.posture).toBe("HOLD");
    expect(p.missingEvidence).toContain(RELEASE_GO_REQUIREMENT_COPY);
  });

  it("HOLD when only manual note says looks good", () => {
    const r = [
      makeReceipt({
        id: "n",
        category: "manual_operator_note",
        status: "pass",
        notes: "looks good",
      }),
    ];
    const p = deriveReleaseEvidencePosture(r, []);
    expect(p.posture).toBe("HOLD");
    expect(p.missingEvidence).toContain(RELEASE_GO_REQUIREMENT_COPY);
  });

  it("HOLD when CI is pending", () => {
    const r = [passingCi({ status: "pending", canUnlockReleaseGo: false })];
    const p = deriveReleaseEvidencePosture(r, []);
    expect(p.posture).toBe("HOLD");
    expect(p.primaryReason.toLowerCase()).toMatch(/pending|missing/);
  });

  it("HOLD when CI failed", () => {
    const r = [
      passingCi({
        status: "fail",
        canUnlockReleaseGo: false,
        blocksReleaseGo: true,
      }),
    ];
    const p = deriveReleaseEvidencePosture(r, []);
    expect(p.posture).toBe("HOLD");
    expect(p.primaryReason.toLowerCase()).toMatch(/failing|blocked/);
  });

  it("HOLD when CI receipt missing entirely", () => {
    const p = deriveReleaseEvidencePosture([], []);
    expect(p.posture).toBe("HOLD");
    expect(p.missingEvidence).toContain(RELEASE_GO_REQUIREMENT_COPY);
  });

  it("GO with passing full-suite CI and no blockers", () => {
    const r = [passingCi()];
    const p = deriveReleaseEvidencePosture(r, []);
    expect(p.posture).toBe("GO");
    expect(p.missingEvidence).toHaveLength(0);
  });

  it("HOLD with passing CI but an active blocker", () => {
    const r = [passingCi()];
    const blockers: EvidenceBlocker[] = [
      { id: "b", label: "Blocker", detail: "x" },
    ];
    const p = deriveReleaseEvidencePosture(r, blockers);
    expect(p.posture).toBe("HOLD");
  });

  it("HOLD with passing CI but another receipt blocks", () => {
    const r = [
      passingCi(),
      makeReceipt({
        id: "other",
        category: "ci_full_suite",
        status: "blocked",
        blocksReleaseGo: true,
      }),
    ];
    const p = deriveReleaseEvidencePosture(r, []);
    expect(p.posture).toBe("HOLD");
  });

  it("deterministic sort: category → status → label", () => {
    const r = [
      makeReceipt({ id: "z", category: "manual_operator_note", label: "Z" }),
      makeReceipt({
        id: "a",
        category: "ci_full_suite",
        status: "pending",
        label: "A-pending",
      }),
      makeReceipt({
        id: "b",
        category: "ci_full_suite",
        status: "fail",
        label: "A-fail",
      }),
      makeReceipt({ id: "c", category: "local_targeted", label: "L" }),
    ];
    const sorted = sortEvidenceReceipts(r);
    expect(sorted.map((x) => x.id)).toEqual(["b", "a", "c", "z"]);
  });

  it("groups receipts by category", () => {
    const grouped = groupEvidenceReceipts(
      RELEASE_READINESS_EVIDENCE_RECEIPTS,
    );
    expect(grouped.ci_full_suite.length).toBeGreaterThan(0);
    expect(grouped.local_targeted.length).toBeGreaterThan(0);
    expect(grouped.manual_operator_note.length).toBeGreaterThan(0);
  });

  it("seeded receipts + blockers yield HOLD with missing CI evidence", () => {
    const p = deriveReleaseEvidencePosture(
      RELEASE_READINESS_EVIDENCE_RECEIPTS,
      RELEASE_READINESS_EVIDENCE_BLOCKERS,
    );
    expect(p.posture).toBe("HOLD");
    expect(p.missingEvidence).toContain(RELEASE_GO_REQUIREMENT_COPY);
  });

  it("disclaimers are exposed for non-CI categories", () => {
    expect(LOCAL_TARGETED_DISCLAIMER).toMatch(/does not unlock release go/i);
    expect(MANUAL_NOTE_DISCLAIMER).toMatch(/context only/i);
  });
});

describe("Release Readiness Evidence — static safety", () => {
  it("view model file makes no network/backend/secret calls", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "lib",
        "releaseReadinessEvidenceReceiptViewModel.ts",
      ),
      "utf8",
    );
    for (const term of [
      "fetch(",
      "supabase",
      "functions.invoke",
      "api.github.com",
      "service_role",
      "access_token",
      "Date.now",
    ]) {
      expect(src, `must not contain ${term}`).not.toContain(term);
    }
  });
});
