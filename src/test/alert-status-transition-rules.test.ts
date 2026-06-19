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

/**
 * Simulate the post-migration CHECK constraints in pure JS so we can
 * assert validity of a hypothetical post-update row.
 */
type RowState = {
  status: "open" | "acknowledged" | "resolved" | "dismissed";
  acknowledged_at: string | null;
  resolved_at: string | null;
};

const ACK_CHECK_NEW = (r: RowState) =>
  (r.status === "open" && r.acknowledged_at === null) ||
  (r.status === "acknowledged" && r.acknowledged_at !== null) ||
  r.status === "resolved" ||
  r.status === "dismissed";

const RES_CHECK = (r: RowState) =>
  r.resolved_at === null || r.status === "resolved";

function applyPatch<T extends Partial<RowState> & { status: RowState["status"] }>(
  before: RowState,
  patch: T,
): RowState {
  return { ...before, ...patch };
}

describe("alertStatusTransitionRules — patch builders", () => {
  it("buildResolveAlertPatch omits acknowledged_at so history is preserved", () => {
    const p = buildResolveAlertPatch("2026-06-18T00:00:00Z");
    expect(p.status).toBe("resolved");
    expect(p.resolved_at).toBe("2026-06-18T00:00:00Z");
    expect("acknowledged_at" in p).toBe(false);
  });

  it("acknowledged → resolved: preserves historical acknowledged_at and is constraint-valid", () => {
    const before: RowState = {
      status: "acknowledged",
      acknowledged_at: "2026-06-17T10:00:00Z",
      resolved_at: null,
    };
    const after = applyPatch(before, buildResolveAlertPatch("2026-06-18T00:00:00Z"));
    expect(after.acknowledged_at).toBe("2026-06-17T10:00:00Z");
    expect(after.status).toBe("resolved");
    expect(after.resolved_at).toBe("2026-06-18T00:00:00Z");
    expect(ACK_CHECK_NEW(after)).toBe(true);
    expect(RES_CHECK(after)).toBe(true);
  });

  it("acknowledged → dismissed: preserves historical acknowledged_at and is constraint-valid", () => {
    const before: RowState = {
      status: "acknowledged",
      acknowledged_at: "2026-06-17T10:00:00Z",
      resolved_at: null,
    };
    const after = applyPatch(before, buildDismissAlertPatch());
    expect(after.acknowledged_at).toBe("2026-06-17T10:00:00Z");
    expect(after.status).toBe("dismissed");
    expect(after.resolved_at).toBeNull();
    expect(ACK_CHECK_NEW(after)).toBe(true);
    expect(RES_CHECK(after)).toBe(true);
  });

  it("open → resolved (no prior acknowledgement) stays constraint-valid", () => {
    const before: RowState = {
      status: "open",
      acknowledged_at: null,
      resolved_at: null,
    };
    const after = applyPatch(before, buildResolveAlertPatch("2026-06-18T00:00:00Z"));
    expect(after.acknowledged_at).toBeNull();
    expect(ACK_CHECK_NEW(after)).toBe(true);
    expect(RES_CHECK(after)).toBe(true);
  });

  it("buildAcknowledgeAlertPatch stamps acknowledged_at and clears resolved_at", () => {
    const before: RowState = {
      status: "resolved",
      acknowledged_at: null,
      resolved_at: "2026-06-17T10:00:00Z",
    };
    const after = applyPatch(
      before,
      buildAcknowledgeAlertPatch("2026-06-18T00:00:00Z"),
    );
    expect(after.status).toBe("acknowledged");
    expect(after.acknowledged_at).toBe("2026-06-18T00:00:00Z");
    expect(after.resolved_at).toBeNull();
    expect(ACK_CHECK_NEW(after)).toBe(true);
    expect(RES_CHECK(after)).toBe(true);
  });

  it("buildDismissAlertPatch clears resolved_at and omits acknowledged_at", () => {
    const p = buildDismissAlertPatch();
    expect(p.status).toBe("dismissed");
    expect(p.resolved_at).toBeNull();
    expect("acknowledged_at" in p).toBe(false);
  });

  it("buildReopenAlertPatch returns the row to a pristine open state", () => {
    const p = buildReopenAlertPatch();
    expect(p.status).toBe("open");
    expect(p.acknowledged_at).toBeNull();
    expect(p.resolved_at).toBeNull();
    const after = applyPatch(
      {
        status: "acknowledged",
        acknowledged_at: "2026-06-17T10:00:00Z",
        resolved_at: null,
      },
      p,
    );
    expect(ACK_CHECK_NEW(after)).toBe(true);
    expect(RES_CHECK(after)).toBe(true);
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

  it("simulated CHECK still blocks an open row with acknowledged_at set", () => {
    const invalid: RowState = {
      status: "open",
      acknowledged_at: "2026-06-18T00:00:00Z",
      resolved_at: null,
    };
    expect(ACK_CHECK_NEW(invalid)).toBe(false);
  });

  it("simulated CHECK still blocks an acknowledged row missing acknowledged_at", () => {
    const invalid: RowState = {
      status: "acknowledged",
      acknowledged_at: null,
      resolved_at: null,
    };
    expect(ACK_CHECK_NEW(invalid)).toBe(false);
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
