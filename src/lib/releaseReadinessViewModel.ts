/**
 * Release Readiness — pure view model.
 *
 * Read-only, deterministic data for the Verdant Release Readiness Status
 * surface. All status here is STATIC / MANUAL — derived from documented
 * receipts, not from any live CI, GitHub, or backend call.
 *
 * Hard rules:
 *  - never claim CI is green here; the page reflects manual/static notes
 *    until a real parser-generated full-suite receipt exists
 *  - no I/O, no Supabase, no fetch, no Date.now() — fully deterministic
 *  - no secrets, tokens, raw payloads, prompts, or completions
 *  - Action Queue stays approval-required; this surface never mutates it
 */

export type ReadinessStatusLabel =
  | "PASS"
  | "HOLD"
  | "BLOCKED"
  | "PENDING"
  | "PRESERVED";

export type ReadinessSource = "static" | "manual" | "doc-receipt";

export interface ReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatusLabel;
  source: ReadinessSource;
  note: string;
}

export interface ReadinessBlocker {
  id: string;
  label: string;
  detail: string;
}

export interface ReadinessCommand {
  id: string;
  label: string;
  command: string;
  note?: string;
}

export interface ReleaseReadinessViewModel {
  /** Overall release posture. Stays HOLD until real CI receipt is GO. */
  overall: { status: ReadinessStatusLabel; summary: string };
  /** Demo posture — separated from release posture on purpose. */
  demo: { status: ReadinessStatusLabel; summary: string };
  /** Release posture — full-suite parser receipt gate. */
  release: { status: ReadinessStatusLabel; summary: string };
  /** Source-of-truth label rendered prominently in the UI. */
  sourceLabel: string;
  checks: ReadinessCheck[];
  blockers: ReadinessBlocker[];
  commands: ReadinessCommand[];
  safetyNotes: string[];
}

export const RELEASE_READINESS_VIEW_MODEL: ReleaseReadinessViewModel = {
  overall: {
    status: "HOLD",
    summary:
      "HOLD — pending CI billing restoration and final parser-generated receipts.",
  },
  demo: {
    status: "PASS",
    summary:
      "Safe for controlled demo. Status below is manual/static and matches documented receipts.",
  },
  release: {
    status: "HOLD",
    summary:
      "Not release-green until the full-suite parser receipt returns GO from a real CI run.",
  },
  sourceLabel:
    "Static / manual snapshot — not a live CI feed. Reflects documented receipts only.",
  checks: [
    {
      id: "localstorage-helper",
      label: "localStorage helper enforcement",
      status: "PASS",
      source: "manual",
      note: "Enforced by scripts/assert-test-localstorage-helper-usage.mjs and wired in CI.",
    },
    {
      id: "sensor-safety",
      label: "Sensor safety checks",
      status: "PASS",
      source: "manual",
      note: "scripts/sensor-safety-check.mjs + assert-sensor-intelligence-safety.mjs green locally.",
    },
    {
      id: "docs-demo-safety",
      label: "Docs / demo safety",
      status: "PASS",
      source: "manual",
      note: "bun run test:docs-demo-safety green locally.",
    },
    {
      id: "route-operator-gating",
      label: "Route / operator gating",
      status: "PASS",
      source: "doc-receipt",
      note: "Operator routes gated by RequireOperatorRole; route-manifest sync tests green per prior receipts.",
    },
    {
      id: "action-queue-approval",
      label: "Action Queue approval-required",
      status: "PRESERVED",
      source: "static",
      note: "No automation, no device control, no auto-execution paths added.",
    },
    {
      id: "ecowitt-bridge-ci",
      label: "Ecowitt bridge CI artifact",
      status: "PENDING",
      source: "manual",
      note: "Parity command + artifact upload wired; CI/Linux/VPS green receipt not yet captured.",
    },
    {
      id: "full-suite-parser",
      label: "Full-suite parser receipt",
      status: "PENDING",
      source: "manual",
      note: "PR #112 parser-generated full-suite receipt blocked behind CI billing.",
    },
  ],
  blockers: [
    {
      id: "ci-billing",
      label: "GitHub Actions billing / spending-limit",
      detail:
        "Runner startup is blocked until billing or spending limit is restored. No runs can complete.",
    },
    {
      id: "pr-112-receipt",
      label: "PR #112 full-suite parser receipt",
      detail:
        "Merge remains HOLD until a parser-generated full-suite receipt returns GO from a real CI run.",
    },
    {
      id: "ecowitt-artifact",
      label: "Ecowitt bridge CI green artifact",
      detail:
        "ecowitt-bridge-ci-validation artifact must contain exit code 0 and a complete vitest summary from CI/Linux/VPS.",
    },
  ],
  commands: [
    {
      id: "localstorage",
      label: "localStorage helper enforcement",
      command: "bun run test:localstorage-helper-enforcement",
    },
    {
      id: "sensor-safety",
      label: "Sensor safety check",
      command: "node scripts/sensor-safety-check.mjs",
    },
    {
      id: "sensor-intelligence",
      label: "Sensor intelligence safety",
      command: "node scripts/assert-sensor-intelligence-safety.mjs --quiet",
    },
    {
      id: "docs-demo-safety",
      label: "Docs / demo safety",
      command: "bun run test:docs-demo-safety",
    },
    {
      id: "ecowitt-bridge",
      label: "Ecowitt bridge CI parity",
      command: "bun run test:ecowitt-bridge:ci",
      note: "Sandbox-bound; authoritative environment is CI/Linux/VPS.",
    },
    {
      id: "parse-vitest-batches",
      label: "Parse vitest batched workflow logs",
      command:
        "node scripts/parse-vitest-batched-workflow-logs.mjs --run-url=<RUN_URL>",
      note: "Replace <RUN_URL> with a real GitHub Actions run URL once billing is restored.",
    },
  ],
  safetyNotes: [
    "No fake live data. All status is manual/static and tied to documented receipts.",
    "Demo, manual, and static labels are preserved — nothing on this page is claimed as live CI output.",
    "Bad or unknown telemetry is never treated as healthy.",
    "AI Doctor remains cautious; this surface does not invoke models.",
    "Action Queue stays approval-required; no automation or device control.",
    "Release stays HOLD until a real parser-generated full-suite receipt is GO.",
  ],
};

/** Forbidden phrases the UI must never render. Used by safety tests. */
export const RELEASE_READINESS_FORBIDDEN_PHRASES = [
  "live green",
  "auto-fixed",
  "auto fixed",
  "ci green",
  "release green",
  "release-green ✅",
  "all systems go",
  "shipped",
] as const;
