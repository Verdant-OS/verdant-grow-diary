import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildAcknowledgeAlertPatch,
  buildResolveAlertPatch,
  buildDismissAlertPatch,
  buildReopenAlertPatch,
  safeAlertTransitionErrorCopy,
} from "@/lib/alertStatusTransitionRules";

const ACK_CHECK = (patch: { acknowledged_at: string | null; status: string }) =>
  patch.acknowledged_at === null || patch.status === "acknowledged";
const RES_CHECK = (patch: { resolved_at: string | null; status: string }) =>
  patch.resolved_at === null || patch.status === "resolved";

describe("alertStatusTransitionRules — patch builders", () => {
  it("buildResolveAlertPatch satisfies alerts_acknowledged_at_status_check", () => {
    const p = buildResolveAlertPatch("2026-06-18T00:00:00Z");
    expect(p.status).toBe("resolved");
    expect(p.resolved_at).toBe("2026-06-18T00:00:00Z");
    expect(p.acknowledged_at).toBeNull();
    expect(ACK_CHECK(p)).toBe(true);
    expect(RES_CHECK(p)).toBe(true);
  });

  it("buildAcknowledgeAlertPatch clears resolved_at and satisfies both CHECKs", () => {
    const p = buildAcknowledgeAlertPatch("2026-06-18T00:00:00Z");
    expect(p.status).toBe("acknowledged");
    expect(p.acknowledged_at).toBe("2026-06-18T00:00:00Z");
    expect(p.resolved_at).toBeNull();
    expect(ACK_CHECK(p)).toBe(true);
    expect(RES_CHECK(p)).toBe(true);
  });

  it("buildDismissAlertPatch clears both timestamps", () => {
    const p = buildDismissAlertPatch();
    expect(p.status).toBe("dismissed");
    expect(p.acknowledged_at).toBeNull();
    expect(p.resolved_at).toBeNull();
    expect(ACK_CHECK(p)).toBe(true);
    expect(RES_CHECK(p)).toBe(true);
  });

  it("buildReopenAlertPatch returns the row to a pristine open state", () => {
    const p = buildReopenAlertPatch();
    expect(p.status).toBe("open");
    expect(p.acknowledged_at).toBeNull();
    expect(p.resolved_at).toBeNull();
    expect(ACK_CHECK(p)).toBe(true);
    expect(RES_CHECK(p)).toBe(true);
  });

  it("resolve patch is deterministic when `now` is provided", () => {
    expect(buildResolveAlertPatch("2026-01-01T00:00:00Z")).toEqual(
      buildResolveAlertPatch("2026-01-01T00:00:00Z"),
    );
  });

  it("resolve patch accepts a Date instance", () => {
    const p = buildResolveAlertPatch(new Date("2026-02-02T03:04:05Z"));
    expect(p.resolved_at).toBe("2026-02-02T03:04:05.000Z");
  });
});

describe("alertStatusTransitionRules — safe error copy", () => {
  it("returns calm copy and never leaks raw constraint names", () => {
    const raw = new Error(
      'new row for relation "alerts" violates check constraint "alerts_acknowledged_at_status_check"',
    );
    const msg = safeAlertTransitionErrorCopy("resolve", raw);
    expect(msg).toBe("Couldn't resolve this alert. Please try again.");
    expect(msg).not.toMatch(/alerts_acknowledged_at_status_check/);
    expect(msg).not.toMatch(/violates check constraint/);
  });

  it("falls back when the error is missing or empty", () => {
    expect(safeAlertTransitionErrorCopy("acknowledge", null)).toMatch(
      /Couldn't acknowledge/,
    );
    expect(safeAlertTransitionErrorCopy("dismiss", undefined)).toMatch(
      /Couldn't dismiss/,
    );
    expect(safeAlertTransitionErrorCopy("reopen", "")).toMatch(
      /Couldn't reopen/,
    );
  });

  it("masks PGRST / SQLSTATE leakage", () => {
    expect(
      safeAlertTransitionErrorCopy("resolve", new Error("PGRST116 something")),
    ).not.toMatch(/PGRST/);
    expect(
      safeAlertTransitionErrorCopy("resolve", new Error("SQLSTATE 23514")),
    ).not.toMatch(/SQLSTATE/);
  });
});

describe("alertStatusTransitionRules — static safety", () => {
  const content = readFileSync(
    resolve(__dirname, "../lib/alertStatusTransitionRules.ts"),
    "utf8",
  );
  it("does not import Supabase or React", () => {
    expect(content).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(content).not.toMatch(/from\s+["']react["']/);
  });
  it("does not import AI/Action Queue/device-control surfaces", () => {
    expect(content).not.toMatch(/ai-?doctor|aiCoach|model-?call/i);
    expect(content).not.toMatch(/actionQueue|action_queue/);
    expect(content).not.toMatch(/deviceControl|device_control/);
  });
});
