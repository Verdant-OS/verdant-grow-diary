/**
 * Reverse provenance: AlertDetail shows linked Action Queue items.
 *
 * - Pure helper correctness (isActionDerivedFromAlert).
 * - Static UI assertions on AlertDetail (presentation + safety).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isActionDerivedFromAlert,
  reconcileRelatedActionRows,
} from "@/lib/actionQueueProvenanceRules";

const ROOT = resolve(__dirname, "../..");
const ALERT_DETAIL = readFileSync(resolve(ROOT, "src/pages/AlertDetail.tsx"), "utf8");

describe("isActionDerivedFromAlert", () => {
  it("identifies an action carrying the matching back-pointer", () => {
    expect(
      isActionDerivedFromAlert(
        { source: "environment_alert", reason: "RH high [alert:abc-1]" },
        "abc-1",
      ),
    ).toBe(true);
  });

  it("rejects actions with a different alert id", () => {
    expect(
      isActionDerivedFromAlert(
        { source: "environment_alert", reason: "RH high [alert:other]" },
        "abc-1",
      ),
    ).toBe(false);
  });

  it("rejects malformed or missing alert tokens", () => {
    expect(
      isActionDerivedFromAlert({ source: "environment_alert", reason: "no token here" }, "abc-1"),
    ).toBe(false);
    expect(
      isActionDerivedFromAlert(
        { source: "environment_alert", reason: "[alert: spaced]" },
        "spaced",
      ),
    ).toBe(false);
    expect(
      isActionDerivedFromAlert({ source: "ai_coach", reason: "RH high [alert:abc-1]" }, "abc-1"),
    ).toBe(false);
  });

  it("is null-safe and deterministic", () => {
    expect(isActionDerivedFromAlert(null, "abc-1")).toBe(false);
    expect(isActionDerivedFromAlert({ source: "environment_alert", reason: null }, "abc-1")).toBe(
      false,
    );
    expect(
      isActionDerivedFromAlert({ source: "environment_alert", reason: "x [alert:abc-1]" }, null),
    ).toBe(false);
    expect(
      isActionDerivedFromAlert({ source: "environment_alert", reason: "x [alert:abc-1]" }, ""),
    ).toBe(false);
    // determinism
    const a = { source: "environment_alert", reason: "x [alert:zzz]" };
    expect(isActionDerivedFromAlert(a, "zzz")).toBe(isActionDerivedFromAlert(a, "zzz"));
  });
});

describe("reconcileRelatedActionRows", () => {
  const optimistic = {
    id: "action-new",
    status: "pending_approval",
    suggested_change: "Review the alert",
  };
  const historical = {
    id: "action-old",
    status: "completed",
    suggested_change: "Historical action",
  };

  it("preserves a current optimistic row missing from an older fetched snapshot", () => {
    expect(reconcileRelatedActionRows([optimistic], [])).toEqual([optimistic]);
  });

  it("keeps current-only rows first while preserving fetched server order", () => {
    expect(reconcileRelatedActionRows([optimistic], [historical])).toEqual([
      optimistic,
      historical,
    ]);
  });

  it("uses the fetched server representation when both inputs contain the same id", () => {
    const persisted = { ...optimistic, suggested_change: "Persisted server value" };
    expect(reconcileRelatedActionRows([optimistic], [persisted])).toEqual([persisted]);
  });

  it("is null-safe, deterministic, and does not mutate either input", () => {
    expect(reconcileRelatedActionRows(null, undefined)).toEqual([]);

    const current = [optimistic];
    const fetched = [historical];
    const currentBefore = [...current];
    const fetchedBefore = [...fetched];
    const first = reconcileRelatedActionRows(current, fetched);
    const second = reconcileRelatedActionRows(current, fetched);

    expect(first).toEqual(second);
    expect(current).toEqual(currentBefore);
    expect(fetched).toEqual(fetchedBefore);
  });
});

describe("AlertDetail — Related Action Queue Items section", () => {
  it("imports the shared provenance helper (no inline regex)", () => {
    expect(ALERT_DETAIL).toMatch(/from "@\/lib\/actionQueueProvenanceRules"/);
    expect(ALERT_DETAIL).toMatch(/isActionDerivedFromAlert/);
    // No inline [alert:...] regex in JSX
    expect(ALERT_DETAIL).not.toMatch(/new RegExp\(["']\\\[alert:/);
  });

  it("renders the Related Action Queue Items section", () => {
    expect(ALERT_DETAIL).toMatch(/aria-label="Related Action Queue Items"/);
    expect(ALERT_DETAIL).toMatch(/Related Action Queue Items/);
  });

  it("renders an empty state when no related items exist", () => {
    expect(ALERT_DETAIL).toMatch(/No queue items have been created from this alert yet/);
  });

  it("links each related item via actionDetailPath", () => {
    expect(ALERT_DETAIL).toMatch(/actionDetailPath\(a\.id\)/);
  });

  it("query scopes to same grow + environment_alert + back-pointer token", () => {
    expect(ALERT_DETAIL).toMatch(/\.eq\("grow_id",\s*alert\.grow_id\)/);
    expect(ALERT_DETAIL).toMatch(/\.eq\("source",\s*"environment_alert"\)/);
    expect(ALERT_DETAIL).toMatch(/\.like\("reason",\s*`%\[alert:\$\{alert\.id\}\]%`\)/);
  });

  it("does not auto-create action_queue items on render", () => {
    expect(ALERT_DETAIL).not.toMatch(/useEffect\([\s\S]{0,600}action_queue[\s\S]{0,200}\.insert\(/);
  });

  it("preserves the existing 'Add to Action Queue' click handler", () => {
    expect(ALERT_DETAIL).toMatch(/onClick=\{addAlertToActionQueue\}/);
    expect(ALERT_DETAIL).toMatch(/Add to Action Queue/);
    expect(ALERT_DETAIL).toMatch(/Action already queued/);
  });

  it("introduces no device-control or service_role surface", () => {
    expect(ALERT_DETAIL).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
  });
});
