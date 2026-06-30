/**
 * Release Readiness — pure view model.
 *
 * Read-only, deterministic data for the Verdant Release Readiness Status
 * surface. All status here is STATIC / MANUAL — derived from documented
 * receipts, not from any live CI, GitHub, or backend call.
 *
 * Hard rules:
 *  - never claim CI is green here; the page reflects manual/static notes
 *    backed by documented receipts
 *  - never declare the product fully released / live green
 *  - no I/O, no Supabase, no fetch, no Date.now() — fully deterministic
 *  - no secrets, tokens, raw payloads, prompts, or completions
 *  - Action Queue stays approval-required; this surface never mutates it
 */

export type ReadinessStatusLabel =
  | "PASS"
  | "HOLD"
  | "BLOCKED"
  | "PENDING"
  | "PRESERVED"
  | "MERGED"
  | "SATISFIED"
  | "WARNING";

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
  /** Overall release posture. */
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
      "CI hardening satisfied — PR #112 merged. Overall release posture remains HOLD: verification pending until the repo-wide Auth loading smoke flake is repaired and any outstanding artifact gates are proven green on main. Parser-generated full-suite receipt for PR #112 is recorded below.",
  },
  demo: {
    status: "PASS",
    summary:
      "Safe for controlled demo. Status below is manual/static and matches documented receipts.",
  },
  release: {
    status: "HOLD",
    summary:
      "Verification pending. PR #112 parser-generated full-suite receipt is GO, but the repo-wide Auth loading smoke remains flaky/non-required and outstanding artifact gates have not yet been proven green on main.",
  },
  sourceLabel:
    "Static / manual snapshot — not a live CI feed. Reflects documented receipts only.",
  checks: [
    {
      id: "pr-112-batched-full-suite",
      label: "PR #112 batched full-suite hardening",
      status: "MERGED",
      source: "doc-receipt",
      note: "Merged at 5bc657fc after parser GO on 4eb63ba: 16/16 batches, 22,187 passed, 0 failed, 0 OOMs (parser run 28463133281).",
    },
    {
      id: "full-suite-parser",
      label: "Full-suite parser receipt (PR #112)",
      status: "SATISFIED",
      source: "doc-receipt",
      note: "Parser-generated full-suite receipt returned GO on PR head 4eb63ba (run 28463133281): 16/16 batches · 22,187 passed · 0 failed · 6 skipped · 0 OOMs.",
    },
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
      note: "Parity command + artifact upload wired; standalone CI/Linux/VPS green artifact receipt not yet proven on main.",
    },
    {
      id: "auth-loading-smoke",
      label: "Auth loading smoke",
      status: "WARNING",
      source: "manual",
      note: "Known repo-wide flaky Playwright check, red on main and not a PR #112 regression. Tracked separately; do not treat as a reliable release gate until repaired.",
    },
  ],
  blockers: [
    {
      id: "ecowitt-artifact",
      label: "Ecowitt bridge CI green artifact (on main)",
      detail:
        "ecowitt-bridge-ci-validation artifact must contain exit code 0 and a complete vitest summary captured from a CI/Linux/VPS run on main before this gate is considered satisfied.",
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
      note: "PR #112 receipt run: 28463133281 (head 4eb63ba, merge commit 5bc657fc).",
    },
  ],
  safetyNotes: [
    "No fake live data. All status is manual/static and tied to documented receipts.",
    "Demo, manual, and static labels are preserved — nothing on this page is claimed as live CI output.",
    "PR #112 row reflects a merge that has already occurred; this surface does not poll GitHub.",
    "Bad or unknown telemetry is never treated as healthy.",
    "AI Doctor remains cautious; this surface does not invoke models.",
    "Action Queue stays approval-required; no automation or device control.",
    "Overall release posture stays HOLD until remaining gates are proven green on main.",
  ],
};

/** Forbidden phrases the UI must never render. Used by safety tests. */
export const RELEASE_READINESS_FORBIDDEN_PHRASES = [
  "live green",
  "auto-fixed",
  "auto fixed",
  "all systems go",
  "release is green",
  "ci is green",
  "shipped to production",
  "fully released",
  "fully live",
] as const;
