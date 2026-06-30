/**
 * Release Readiness Evidence Receipts — pure view model + posture deriver.
 *
 * Read-only, deterministic data + helpers for the operator-only Release
 * Readiness page. All data here is STATIC / MANUAL. No I/O, no fetch, no
 * backend, no GitHub API, no clock reads, no model calls. Purely typed.
 *
 * Hard rules enforced by `deriveReleaseEvidencePosture`:
 *  - Only a passing `ci_full_suite` receipt can unlock Release GO.
 *  - `local_targeted` receipts can support confidence but cannot unlock GO.
 *  - `manual_operator_note` receipts can explain context but cannot unlock GO.
 *  - Missing / pending / failed / blocked / unknown CI ⇒ HOLD.
 *  - Any active blocker ⇒ HOLD, even with passing CI.
 */

export type ReceiptCategory =
  | "ci_full_suite"
  | "local_targeted"
  | "manual_operator_note";

export type ReceiptStatus =
  | "pass"
  | "fail"
  | "blocked"
  | "pending"
  | "unknown";

export interface EvidenceReceipt {
  id: string;
  label: string;
  category: ReceiptCategory;
  status: ReceiptStatus;
  sourceLabel: string;
  /** Stable, deterministic timestamp string ("" when not captured). */
  capturedAt: string;
  commandOrSource: string;
  summary: string;
  blocksReleaseGo: boolean;
  canUnlockReleaseGo: boolean;
  notes: string;
}

export interface EvidenceBlocker {
  id: string;
  label: string;
  detail: string;
}

export type ReleaseEvidencePostureLabel = "GO" | "HOLD";

export interface ReleaseEvidencePosture {
  posture: ReleaseEvidencePostureLabel;
  primaryReason: string;
  supportingReceipts: EvidenceReceipt[];
  blockingReceipts: EvidenceReceipt[];
  missingEvidence: string[];
  operatorWarning: string;
}

export const RELEASE_GO_REQUIREMENT_COPY =
  "Missing parser-generated full-suite CI receipt.";

export const LOCAL_TARGETED_DISCLAIMER =
  "Supports confidence, does not unlock release GO.";

export const MANUAL_NOTE_DISCLAIMER =
  "Context only, does not unlock release GO.";

const CATEGORY_ORDER: Record<ReceiptCategory, number> = {
  ci_full_suite: 0,
  local_targeted: 1,
  manual_operator_note: 2,
};

const STATUS_ORDER: Record<ReceiptStatus, number> = {
  fail: 0,
  blocked: 1,
  pending: 2,
  unknown: 3,
  pass: 4,
};

/** Deterministic sort: category → status → label → id. */
export function sortEvidenceReceipts(
  receipts: readonly EvidenceReceipt[],
): EvidenceReceipt[] {
  return [...receipts].sort((a, b) => {
    const c = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (c !== 0) return c;
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    const l = a.label.localeCompare(b.label);
    if (l !== 0) return l;
    return a.id.localeCompare(b.id);
  });
}

/** Group receipts by category, deterministic order within each group. */
export function groupEvidenceReceipts(
  receipts: readonly EvidenceReceipt[],
): Record<ReceiptCategory, EvidenceReceipt[]> {
  const sorted = sortEvidenceReceipts(receipts);
  const out: Record<ReceiptCategory, EvidenceReceipt[]> = {
    ci_full_suite: [],
    local_targeted: [],
    manual_operator_note: [],
  };
  for (const r of sorted) out[r.category].push(r);
  return out;
}

/**
 * Derive release evidence posture from receipts + active blockers.
 *
 * GO only when: at least one `ci_full_suite` receipt with status `pass` AND
 * `canUnlockReleaseGo === true` AND no active blockers AND no other receipt
 * with `blocksReleaseGo === true`.
 *
 * Otherwise HOLD, with a clear primaryReason and missingEvidence list.
 */
export function deriveReleaseEvidencePosture(
  receipts: readonly EvidenceReceipt[],
  blockers: readonly EvidenceBlocker[],
): ReleaseEvidencePosture {
  const sorted = sortEvidenceReceipts(receipts);
  const ci = sorted.filter((r) => r.category === "ci_full_suite");
  const passingCi = ci.filter(
    (r) => r.status === "pass" && r.canUnlockReleaseGo === true,
  );
  const failingCi = ci.filter(
    (r) => r.status === "fail" || r.status === "blocked",
  );
  const pendingCi = ci.filter(
    (r) => r.status === "pending" || r.status === "unknown",
  );

  const blockingReceipts = sorted.filter((r) => r.blocksReleaseGo === true);
  const supportingReceipts = sorted.filter(
    (r) => r.status === "pass" && r.blocksReleaseGo === false,
  );

  const missingEvidence: string[] = [];
  if (ci.length === 0 || passingCi.length === 0) {
    missingEvidence.push(RELEASE_GO_REQUIREMENT_COPY);
  }

  const operatorWarning =
    "Local targeted tests and manual notes never unlock Release GO. " +
    "Only a passing parser-generated full-suite CI receipt can.";

  // HOLD cases (in priority order):
  if (failingCi.length > 0) {
    return {
      posture: "HOLD",
      primaryReason:
        "Full-suite CI receipt is failing or blocked. Release stays HOLD.",
      supportingReceipts,
      blockingReceipts,
      missingEvidence,
      operatorWarning,
    };
  }
  if (ci.length === 0) {
    return {
      posture: "HOLD",
      primaryReason: RELEASE_GO_REQUIREMENT_COPY,
      supportingReceipts,
      blockingReceipts,
      missingEvidence,
      operatorWarning,
    };
  }
  if (passingCi.length === 0) {
    return {
      posture: "HOLD",
      primaryReason:
        pendingCi.length > 0
          ? "Full-suite CI receipt is pending. Release stays HOLD."
          : RELEASE_GO_REQUIREMENT_COPY,
      supportingReceipts,
      blockingReceipts,
      missingEvidence,
      operatorWarning,
    };
  }
  if (blockers.length > 0) {
    return {
      posture: "HOLD",
      primaryReason:
        "Active blockers present. Release stays HOLD even with passing CI.",
      supportingReceipts,
      blockingReceipts,
      missingEvidence,
      operatorWarning,
    };
  }
  if (blockingReceipts.length > 0) {
    return {
      posture: "HOLD",
      primaryReason:
        "One or more receipts are marked as blocking release GO.",
      supportingReceipts,
      blockingReceipts,
      missingEvidence,
      operatorWarning,
    };
  }

  return {
    posture: "GO",
    primaryReason:
      "Passing parser-generated full-suite CI receipt with no active blockers.",
    supportingReceipts,
    blockingReceipts,
    missingEvidence,
    operatorWarning,
  };
}

/** Human label for a category. */
export function getCategoryLabel(category: ReceiptCategory): string {
  switch (category) {
    case "ci_full_suite":
      return "Full-suite CI receipt";
    case "local_targeted":
      return "Local targeted validation";
    case "manual_operator_note":
      return "Manual / operator notes";
  }
}

/** Disclaimer copy for a category. */
export function getCategoryDisclaimer(category: ReceiptCategory): string | null {
  switch (category) {
    case "ci_full_suite":
      return null;
    case "local_targeted":
      return LOCAL_TARGETED_DISCLAIMER;
    case "manual_operator_note":
      return MANUAL_NOTE_DISCLAIMER;
  }
}

/** Static seed receipts — reflects documented posture as of v1. */
export const RELEASE_READINESS_EVIDENCE_RECEIPTS: EvidenceReceipt[] = [
  {
    id: "ci-full-suite-pr-112",
    label: "PR #112 parser-generated full-suite",
    category: "ci_full_suite",
    status: "pass",
    sourceLabel: "doc-receipt",
    capturedAt: "",
    commandOrSource:
      "node scripts/parse-vitest-batched-workflow-logs.mjs --run-url=<RUN_URL>",
    summary:
      "Parser GO on PR head 4eb63ba (run 28463133281): 16/16 batches, 22,187 passed, 0 failed, 6 skipped, 0 OOMs. Merged into verdant-grow-diary at merge commit 5bc657fc.",
    blocksReleaseGo: false,
    canUnlockReleaseGo: true,
    notes:
      "Documented full-suite receipt. Merge method: merge commit. No deploy, no DB writes, no schema/RLS/Edge/auth/grant/env changes.",
  },
  {
    id: "ecowitt-bridge-ci-artifact",
    label: "Ecowitt bridge CI artifact (CI/Linux/VPS)",
    category: "ci_full_suite",
    status: "pending",
    sourceLabel: "doc-receipt",
    capturedAt: "",
    commandOrSource: "bun run test:ecowitt-bridge:ci",
    summary:
      "Standalone ecowitt-bridge-ci-validation artifact (exit 0 + complete vitest summary) not yet proven green on main.",
    blocksReleaseGo: true,
    canUnlockReleaseGo: false,
    notes:
      "Sandbox-bound locally; authoritative receipt must come from CI/Linux/VPS on main.",
  },
  {
    id: "local-targeted-localstorage-helper",
    label: "localStorage helper enforcement",
    category: "local_targeted",
    status: "pass",
    sourceLabel: "local-targeted",
    capturedAt: "",
    commandOrSource: "bun run test:localstorage-helper-enforcement",
    summary: "Local enforcement passes; cannot substitute for full-suite CI.",
    blocksReleaseGo: false,
    canUnlockReleaseGo: false,
    notes: LOCAL_TARGETED_DISCLAIMER,
  },
  {
    id: "local-targeted-sensor-safety",
    label: "Sensor safety check",
    category: "local_targeted",
    status: "pass",
    sourceLabel: "local-targeted",
    capturedAt: "",
    commandOrSource: "node scripts/sensor-safety-check.mjs",
    summary: "Local sensor safety scan passes.",
    blocksReleaseGo: false,
    canUnlockReleaseGo: false,
    notes: LOCAL_TARGETED_DISCLAIMER,
  },
  {
    id: "local-targeted-docs-demo-safety",
    label: "Docs / demo safety",
    category: "local_targeted",
    status: "pass",
    sourceLabel: "local-targeted",
    capturedAt: "",
    commandOrSource: "bun run test:docs-demo-safety",
    summary: "Local docs and demo safety scans pass.",
    blocksReleaseGo: false,
    canUnlockReleaseGo: false,
    notes: LOCAL_TARGETED_DISCLAIMER,
  },
  {
    id: "manual-note-auth-loading-smoke",
    label: "Auth loading smoke (repo-wide flake)",
    category: "manual_operator_note",
    status: "pending",
    sourceLabel: "operator-note",
    capturedAt: "",
    commandOrSource: "manual review",
    summary:
      "Auth loading smoke remains red/flaky repo-wide and non-required; explicitly overridden for PR #112 merge because it is red on main and not a PR #112 regression.",
    blocksReleaseGo: false,
    canUnlockReleaseGo: false,
    notes:
      "Tracked separately. Do not treat as a reliable release gate until repaired.",
  },
  {
    id: "manual-note-action-queue-preserved",
    label: "Action Queue stays approval-required",
    category: "manual_operator_note",
    status: "pass",
    sourceLabel: "operator-note",
    capturedAt: "",
    commandOrSource: "manual review",
    summary:
      "No automation, device control, or auto-execution paths added in this slice.",
    blocksReleaseGo: false,
    canUnlockReleaseGo: false,
    notes: MANUAL_NOTE_DISCLAIMER,
  },
];

export const RELEASE_READINESS_EVIDENCE_BLOCKERS: EvidenceBlocker[] = [
  {
    id: "ecowitt-artifact-on-main",
    label: "Ecowitt bridge CI green artifact (on main)",
    detail:
      "ecowitt-bridge-ci-validation artifact must be produced with exit 0 and a complete vitest summary from a CI/Linux/VPS run on main.",
  },
  {
    id: "auth-loading-smoke-flake",
    label: "Auth loading smoke flake repair",
    detail:
      "Repo-wide Auth loading smoke is red/flaky on main (non-required). Repair tracked separately before it can be treated as a reliable release gate.",
  },
];
