/**
 * Component tests for SafeByDesignNotice and static-source tests for the
 * Dashboard Approval-Required Action Queue section.
 *
 * These cover the requirements:
 *  - Safe-by-Design / Read-Only copy renders near recommendations.
 *  - Approve / Dismiss controls render but do not imply device execution.
 *  - Empty-state copy is intentional and safe.
 *  - No autopilot / auto-execute language is introduced.
 *  - No new write paths, no device-control surfaces, no AI rule edits.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import SafeByDesignNotice from "@/components/SafeByDesignNotice";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const VM = readFileSync(
  resolve(ROOT, "src/lib/dashboardActionQueueViewModel.ts"),
  "utf8",
);
const NOTICE = readFileSync(
  resolve(ROOT, "src/components/SafeByDesignNotice.tsx"),
  "utf8",
);

describe("SafeByDesignNotice — component", () => {
  it("renders Safe by Design / Read-Only / Approval Required tokens", () => {
    render(<SafeByDesignNotice />);
    const el = screen.getByTestId("safe-by-design-notice");
    expect(el.textContent).toContain("Safe by Design");
    expect(el.textContent).toContain("Read-Only");
    expect(el.textContent).toContain("Approval Required");
  });

  it("full variant includes the 'Verdant suggests / Grower approves' explainer", () => {
    render(<SafeByDesignNotice variant="full" />);
    const text = screen.getByTestId("safe-by-design-notice").textContent ?? "";
    expect(text.toLowerCase()).toContain("verdant suggests");
    expect(text.toLowerCase()).toContain("grower approves");
    expect(text.toLowerCase()).toContain("no device control");
  });

  it("compact variant omits the long-form explainer body", () => {
    render(<SafeByDesignNotice variant="compact" testId="sbd-compact" />);
    const text = screen.getByTestId("sbd-compact").textContent ?? "";
    expect(text.toLowerCase()).not.toContain("verdant suggests");
    // But badge tokens still render.
    expect(text).toContain("Safe by Design");
  });
});

describe("Dashboard Approval-Required Action Queue — static source", () => {
  it("renders the SafeByDesignNotice inside the pending actions section", () => {
    expect(DASHBOARD).toContain('data-testid="dashboard-approval-queue-section"');
    expect(DASHBOARD).toContain(
      'testId="dashboard-approval-queue-safe-by-design"',
    );
    expect(DASHBOARD).toContain("SafeByDesignNotice");
  });

  it("uses an intentional empty state, not generic 'No pending actions.' only", () => {
    expect(DASHBOARD).toContain('data-testid="dashboard-approval-queue-empty"');
    expect(DASHBOARD).toContain("APPROVAL_QUEUE_EMPTY_COPY");
  });

  it("renders Review & Approve and Dismiss controls that route to the action detail (no inline execution)", () => {
    expect(DASHBOARD).toContain(
      'data-testid="dashboard-approval-queue-item-approve"',
    );
    expect(DASHBOARD).toContain(
      'data-testid="dashboard-approval-queue-item-dismiss"',
    );
    // Both controls must be Links to actionDetailPath — no onClick handler
    // that writes/executes anything.
    expect(DASHBOARD).toMatch(
      /dashboard-approval-queue-item-approve[\s\S]{0,400}actionDetailPath\(a\.id\)/,
    );
    expect(DASHBOARD).toMatch(
      /dashboard-approval-queue-item-dismiss[\s\S]{0,400}actionDetailPath\(a\.id\)/,
    );
  });

  it("clarifies that approving never sends a device command", () => {
    expect(DASHBOARD).toMatch(/never sends a\s*command to fans, lights, pumps/);
  });

  it("displays related grow/tent/source/status context chips for each item", () => {
    expect(DASHBOARD).toContain("dashboard-approval-queue-item-tent");
    expect(DASHBOARD).toContain("dashboard-approval-queue-item-source");
    expect(DASHBOARD).toContain("dashboard-approval-queue-item-status");
  });

  it("uses a SeverityBadge derived from a pure mapper (no severity table in JSX)", () => {
    expect(DASHBOARD).toContain("mapRiskToSeverity(a.risk_level)");
    expect(VM).toContain("export function mapRiskToSeverity");
  });
});

describe("Static safety — no new device-control / automation / write surfaces", () => {
  const BANNED_TOKENS = [
    /\bautopilot\b/i,
    /\bauto[-_ ]?execute\b/i,
    /\bauto[-_ ]?apply\b/i,
    /\bexecute_action\b/i,
    /\bdispatch_command\b/i,
  ];

  it("view model is pure and write-free", () => {
    expect(VM).not.toMatch(/from\s*\(\s*['"][^'"]+['"]\s*\)\s*\.(insert|update|delete|upsert)/);
    expect(VM).not.toMatch(/\.rpc\(/);
    expect(VM).not.toMatch(/fetch\(|XMLHttpRequest|supabase/);
    for (const re of BANNED_TOKENS) expect(VM).not.toMatch(re);
  });

  it("notice component is pure and write-free", () => {
    expect(NOTICE).not.toMatch(/fetch\(|XMLHttpRequest|supabase/);
    expect(NOTICE).not.toMatch(/\.rpc\(/);
    for (const re of BANNED_TOKENS) expect(NOTICE).not.toMatch(re);
  });

  it("Dashboard section does not introduce autopilot/auto-execute language", () => {
    for (const re of BANNED_TOKENS) expect(DASHBOARD).not.toMatch(re);
  });
});
