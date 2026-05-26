/**
 * Stale-action safety warning: closed alert + pending related action queue items.
 *
 * Covers:
 *   - Pure helper `hasPendingActionsForClosedAlert` correctness.
 *   - Static UI assertions on AlertDetail.tsx (warning copy + safety).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  hasPendingActionsForClosedAlert,
  isClosedAlertStatus,
} from "@/lib/actionQueueProvenanceRules";

const ROOT = resolve(__dirname, "../..");
const ALERT_DETAIL = readFileSync(resolve(ROOT, "src/pages/AlertDetail.tsx"), "utf8");

describe("hasPendingActionsForClosedAlert", () => {
  it("returns true for resolved alert with a pending related action", () => {
    expect(hasPendingActionsForClosedAlert("resolved", [{ status: "pending_approval" }])).toBe(
      true,
    );
  });

  it("returns true for dismissed alert with a pending related action", () => {
    expect(
      hasPendingActionsForClosedAlert("dismissed", [
        { status: "completed" },
        { status: "pending_approval" },
      ]),
    ).toBe(true);
  });

  it("returns false for open alerts even with pending related actions", () => {
    expect(hasPendingActionsForClosedAlert("open", [{ status: "pending_approval" }])).toBe(false);
    expect(hasPendingActionsForClosedAlert("acknowledged", [{ status: "pending_approval" }])).toBe(
      false,
    );
  });

  it("returns false when all related actions are completed/rejected/canceled", () => {
    expect(
      hasPendingActionsForClosedAlert("resolved", [
        { status: "completed" },
        { status: "rejected" },
        { status: "canceled" },
        { status: "approved" },
      ]),
    ).toBe(false);
  });

  it("is null-safe and deterministic", () => {
    expect(hasPendingActionsForClosedAlert(null, null)).toBe(false);
    expect(hasPendingActionsForClosedAlert(undefined, undefined)).toBe(false);
    expect(hasPendingActionsForClosedAlert("resolved", [])).toBe(false);
    expect(hasPendingActionsForClosedAlert("resolved", [null, undefined])).toBe(false);
    const input = [{ status: "pending_approval" }];
    expect(hasPendingActionsForClosedAlert("resolved", input)).toBe(
      hasPendingActionsForClosedAlert("resolved", input),
    );
    // isClosedAlertStatus narrows correctly
    expect(isClosedAlertStatus("resolved")).toBe(true);
    expect(isClosedAlertStatus("dismissed")).toBe(true);
    expect(isClosedAlertStatus("open")).toBe(false);
    expect(isClosedAlertStatus(null)).toBe(false);
  });
});

describe("AlertDetail — stale-action warning", () => {
  it("imports and uses the helper rather than inlining the rule in JSX", () => {
    expect(ALERT_DETAIL).toMatch(/hasPendingActionsForClosedAlert/);
    expect(ALERT_DETAIL).toMatch(/from "@\/lib\/actionQueueProvenanceRules"/);
  });

  it("renders the stale-action warning with the required copy", () => {
    expect(ALERT_DETAIL).toMatch(/data-testid="stale-action-warning"/);
    expect(ALERT_DETAIL).toMatch(
      /This alert is no longer open, but related actions are still\s+pending review\. Confirm the current grow conditions before\s+approving\./,
    );
  });

  it("gates the warning on the pure helper (not raw status checks in JSX)", () => {
    expect(ALERT_DETAIL).toMatch(/showStaleActionWarning/);
    expect(ALERT_DETAIL).toMatch(
      /hasPendingActionsForClosedAlert\(alert\?\.status,\s*relatedActions\)/,
    );
  });

  it("warning is read-only — no mutation of action_queue or alerts from this path", () => {
    // The warning block itself must not invoke any insert/update/delete.
    const warnIdx = ALERT_DETAIL.indexOf('data-testid="stale-action-warning"');
    expect(warnIdx).toBeGreaterThan(-1);
    const block = ALERT_DETAIL.slice(warnIdx, warnIdx + 600);
    expect(block).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(block).not.toMatch(/onClick|onSubmit/);
  });

  it("preserves existing Add / Already in Action Queue behavior", () => {
    expect(ALERT_DETAIL).toMatch(/onClick=\{addAlertToActionQueue\}/);
    expect(ALERT_DETAIL).toMatch(/Add to Action Queue/);
    expect(ALERT_DETAIL).toMatch(/Action already queued/);
  });

  it("preserves the related items list rendering", () => {
    expect(ALERT_DETAIL).toMatch(/aria-label="Related Action Queue Items"/);
    expect(ALERT_DETAIL).toMatch(/actionDetailPath\(a\.id\)/);
  });

  it("introduces no automation, device-control, or service_role surface", () => {
    expect(ALERT_DETAIL).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
    // No auto-cancel of pending actions when alert closes.
    expect(ALERT_DETAIL).not.toMatch(/auto[_-]?cancel|cancelPendingActions|bulkCancel/i);
  });
});
