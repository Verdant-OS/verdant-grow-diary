/**
 * Mirror stale-source-alert warning on ActionDetail.
 *
 * - Pure helper correctness (shouldWarnPendingActionHasClosedSourceAlert).
 * - Static UI/safety assertions on ActionDetail.tsx.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  shouldWarnPendingActionHasClosedSourceAlert,
} from "@/lib/actionQueueProvenanceRules";

const ROOT = resolve(__dirname, "../..");
const ACTION_DETAIL = readFileSync(
  resolve(ROOT, "src/pages/ActionDetail.tsx"),
  "utf8",
);

describe("shouldWarnPendingActionHasClosedSourceAlert", () => {
  it("true: pending action + resolved source alert", () => {
    expect(
      shouldWarnPendingActionHasClosedSourceAlert("pending_approval", "resolved"),
    ).toBe(true);
  });

  it("true: pending action + dismissed source alert", () => {
    expect(
      shouldWarnPendingActionHasClosedSourceAlert("pending_approval", "dismissed"),
    ).toBe(true);
  });

  it("false: pending action + open/acknowledged source alert", () => {
    expect(
      shouldWarnPendingActionHasClosedSourceAlert("pending_approval", "open"),
    ).toBe(false);
    expect(
      shouldWarnPendingActionHasClosedSourceAlert(
        "pending_approval",
        "acknowledged",
      ),
    ).toBe(false);
  });

  it("false: non-pending action statuses + closed source alert", () => {
    for (const s of [
      "approved",
      "rejected",
      "completed",
      "canceled",
      "simulated",
    ]) {
      expect(
        shouldWarnPendingActionHasClosedSourceAlert(s, "resolved"),
      ).toBe(false);
      expect(
        shouldWarnPendingActionHasClosedSourceAlert(s, "dismissed"),
      ).toBe(false);
    }
  });

  it("null-safe and deterministic", () => {
    expect(shouldWarnPendingActionHasClosedSourceAlert(null, null)).toBe(false);
    expect(
      shouldWarnPendingActionHasClosedSourceAlert(undefined, "resolved"),
    ).toBe(false);
    expect(
      shouldWarnPendingActionHasClosedSourceAlert("pending_approval", null),
    ).toBe(false);
    expect(
      shouldWarnPendingActionHasClosedSourceAlert("pending_approval", "RESOLVED"),
    ).toBe(false); // case-sensitive
    const a = shouldWarnPendingActionHasClosedSourceAlert(
      "pending_approval",
      "resolved",
    );
    const b = shouldWarnPendingActionHasClosedSourceAlert(
      "pending_approval",
      "resolved",
    );
    expect(a).toBe(b);
  });
});

describe("ActionDetail — stale source-alert warning", () => {
  it("imports and uses the shared helper (no inline closed-status check in JSX)", () => {
    expect(ACTION_DETAIL).toMatch(/shouldWarnPendingActionHasClosedSourceAlert/);
    expect(ACTION_DETAIL).toMatch(
      /from "@\/lib\/actionQueueProvenanceRules"/,
    );
    // The JSX should not inline the closed-status comparison itself.
    expect(ACTION_DETAIL).not.toMatch(
      /sourceAlertStatus\s*===\s*["']resolved["']/,
    );
    expect(ACTION_DETAIL).not.toMatch(
      /sourceAlertStatus\s*===\s*["']dismissed["']/,
    );
  });

  it("fetches the source alert only when an alert id is parseable from an alert-derived action", () => {
    // Gated by isAlertDerived + extractSourceAlertId before querying alerts.
    expect(ACTION_DETAIL).toMatch(/if \(!isAlertDerived\(row\)\) return;/);
    expect(ACTION_DETAIL).toMatch(
      /const sourceAlertId = extractSourceAlertId\(row\.reason\);/,
    );
    expect(ACTION_DETAIL).toMatch(/if \(!sourceAlertId\) return;/);
    expect(ACTION_DETAIL).toMatch(
      /\.from\("alerts"\)[\s\S]{0,200}\.eq\("id",\s*sourceAlertId\)/,
    );
  });

  it("renders the stale source-alert warning with the required copy", () => {
    expect(ACTION_DETAIL).toMatch(/data-testid="stale-source-alert-warning"/);
    expect(ACTION_DETAIL).toMatch(
      /The source alert is no longer open\. Re-check current grow\s+conditions before approving this action\./,
    );
  });

  it("warning block is read-only (no onClick, no insert/update/delete)", () => {
    const idx = ACTION_DETAIL.indexOf(
      'data-testid="stale-source-alert-warning"',
    );
    expect(idx).toBeGreaterThan(-1);
    const block = ACTION_DETAIL.slice(idx, idx + 600);
    expect(block).not.toMatch(/onClick|onSubmit/);
    expect(block).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });

  it("preserves the 'Open source alert' link", () => {
    expect(ACTION_DETAIL).toMatch(/Open source alert/);
    expect(ACTION_DETAIL).toMatch(/alertDetailPath\(sourceAlertId\)/);
  });

  it("preserves existing approve/reject/complete/cancel/simulate controls", () => {
    expect(ACTION_DETAIL).toMatch(/openDialog\("approve"\)/);
    expect(ACTION_DETAIL).toMatch(/openDialog\("reject"\)/);
    expect(ACTION_DETAIL).toMatch(/openDialog\("complete"\)/);
    expect(ACTION_DETAIL).toMatch(/openDialog\("cancel"\)/);
    expect(ACTION_DETAIL).toMatch(/openDialog\("simulate"\)/);
  });

  it("introduces no automation, device-control, or service_role surface", () => {
    expect(ACTION_DETAIL).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
    expect(ACTION_DETAIL).not.toMatch(
      /auto[_-]?cancel|auto[_-]?reject|auto[_-]?approve/i,
    );
  });
});
