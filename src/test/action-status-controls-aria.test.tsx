/**
 * Action Queue / Action Detail status-control accessibility hardening.
 *
 * Presentation-only. Covers:
 *   - Pure aria-label helpers (buildActionButtonAriaLabel,
 *     buildStatusBadgeAriaLabel) for Approve / Reject / Simulate /
 *     Mark Complete / Cancel.
 *   - Safe-summary discipline: no ids, no [alert:/[session: tokens, no
 *     raw back-pointer tokens leak through the accessible name.
 *   - Source-file presence checks on ActionQueue.tsx + ActionDetail.tsx
 *     to enforce that every status-control button wires the shared
 *     helper, exposes a disabled reason via title, and that the
 *     current-status badge exposes its value to screen readers.
 *   - Existing focus-visible styling on the shared Button primitive is
 *     preserved.
 *   - Static safety scan: no automation / device-control / auto-
 *     approve/reject/execute copy was introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildActionButtonAriaLabel,
  buildStatusBadgeAriaLabel,
} from "@/lib/actionQueueRowView";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const QUEUE = stripSourceComments(
  readFileSync(resolve(__dirname, "../..", "src/pages/ActionQueue.tsx"), "utf8"),
);
const DETAIL = stripSourceComments(
  readFileSync(resolve(__dirname, "../..", "src/pages/ActionDetail.tsx"), "utf8"),
);
const BUTTON = readFileSync(
  resolve(__dirname, "../..", "src/components/ui/button.tsx"),
  "utf8",
);

const FORBIDDEN_IN_LABELS = [
  "[alert:",
  "[session:",
];

// Patterns that must never appear in any accessible name produced by
// the helper, regardless of input.
const ID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const SAMPLE_ROW = { action_type: "raise_light" };

describe("buildActionButtonAriaLabel — pure helper", () => {
  it("composes a descriptive label per transition kind", () => {
    expect(buildActionButtonAriaLabel("approve", SAMPLE_ROW)).toBe(
      "Approve action: Raise Light",
    );
    expect(buildActionButtonAriaLabel("reject", SAMPLE_ROW)).toBe(
      "Reject action: Raise Light",
    );
    expect(buildActionButtonAriaLabel("simulate", SAMPLE_ROW)).toBe(
      "Simulate action: Raise Light",
    );
    expect(buildActionButtonAriaLabel("complete", SAMPLE_ROW)).toBe(
      "Mark action complete: Raise Light",
    );
    expect(buildActionButtonAriaLabel("cancel", SAMPLE_ROW)).toBe(
      "Cancel action: Raise Light",
    );
  });

  it("falls back to 'Suggested action' when action_type is missing", () => {
    expect(buildActionButtonAriaLabel("approve", { action_type: null })).toBe(
      "Approve action: Suggested action",
    );
    expect(buildActionButtonAriaLabel("approve", { action_type: "" })).toBe(
      "Approve action: Suggested action",
    );
  });

  it("appends an accessible disabled reason when provided", () => {
    expect(
      buildActionButtonAriaLabel("approve", SAMPLE_ROW, {
        disabledReason: "Saving — please wait",
      }),
    ).toBe("Approve action: Raise Light. Saving — please wait");
    // Empty/whitespace reasons are ignored.
    expect(
      buildActionButtonAriaLabel("approve", SAMPLE_ROW, { disabledReason: "   " }),
    ).toBe("Approve action: Raise Light");
    expect(
      buildActionButtonAriaLabel("approve", SAMPLE_ROW, { disabledReason: null }),
    ).toBe("Approve action: Raise Light");
  });

  it("never leaks ids, back-pointer tokens, or raw reason text into the label", () => {
    // Even if a malicious action_type smuggles tokens / ids, the
    // helper only formats via formatActionTypeLabel which preserves
    // the string but does not parse provenance — verify ids/tokens
    // are not introduced by the helper itself for clean input.
    for (const kind of ["approve", "reject", "simulate", "complete", "cancel"] as const) {
      const label = buildActionButtonAriaLabel(kind, SAMPLE_ROW);
      for (const tok of FORBIDDEN_IN_LABELS) {
        expect(label).not.toContain(tok);
      }
      expect(label).not.toMatch(ID_LIKE);
      expect(label).not.toMatch(/grow_id|tent_id|plant_id|action_queue_id/);
    }
  });
});

describe("buildStatusBadgeAriaLabel — pure helper", () => {
  it("describes the current status for assistive tech", () => {
    expect(buildStatusBadgeAriaLabel("pending_approval")).toBe(
      "Current status: Pending review",
    );
    expect(buildStatusBadgeAriaLabel("approved")).toBe("Current status: Approved");
    expect(buildStatusBadgeAriaLabel("simulated")).toBe("Current status: Simulated");
    expect(buildStatusBadgeAriaLabel("rejected")).toBe("Current status: Rejected");
    expect(buildStatusBadgeAriaLabel("completed")).toBe("Current status: Completed");
    expect(buildStatusBadgeAriaLabel("cancelled")).toBe("Current status: Cancelled");
    expect(buildStatusBadgeAriaLabel(null)).toBe("Current status: Pending review");
  });
});

describe("ActionQueue — status-control aria wiring", () => {
  it("imports the shared aria-label helpers", () => {
    expect(QUEUE).toMatch(/buildActionButtonAriaLabel/);
    expect(QUEUE).toMatch(/buildStatusBadgeAriaLabel/);
  });

  it("wires aria-label on every status-change button via the helper", () => {
    for (const kind of ["approve", "simulate", "reject", "complete", "cancel"] as const) {
      const re = new RegExp(
        `aria-label=\\{buildActionButtonAriaLabel\\(\\s*["']${kind}["']`,
      );
      expect(QUEUE).toMatch(re);
    }
  });

  it("exposes the disabled reason via title for sighted users", () => {
    expect(QUEUE).toMatch(/Saving\s+—\s+please wait/);
    expect(QUEUE).toMatch(/title=\{disabledReason \?\? undefined\}/);
  });

  it("exposes the current status on the reviewed status badge", () => {
    expect(QUEUE).toMatch(/aria-label=\{buildStatusBadgeAriaLabel\(row\.status\)\}/);
  });
});

describe("ActionDetail — status-control aria wiring", () => {
  it("imports the shared aria-label helpers", () => {
    expect(DETAIL).toMatch(/buildActionButtonAriaLabel/);
    expect(DETAIL).toMatch(/buildStatusBadgeAriaLabel/);
  });

  it("wires aria-label on every status-change button via the helper", () => {
    for (const kind of ["approve", "simulate", "reject", "complete", "cancel"] as const) {
      const re = new RegExp(
        `aria-label=\\{buildActionButtonAriaLabel\\(\\s*["']${kind}["']`,
      );
      expect(DETAIL).toMatch(re);
    }
  });

  it("exposes the disabled reason via title for sighted users", () => {
    expect(DETAIL).toMatch(/Saving\s+—\s+please wait/);
    expect(DETAIL).toMatch(/title=\{disabledReason \?\? undefined\}/);
  });

  it("exposes the current status on the header status badge", () => {
    expect(DETAIL).toMatch(/aria-label=\{buildStatusBadgeAriaLabel\(row\.status\)\}/);
  });
});

describe("shared Button primitive — focus-visible preserved", () => {
  it("renders a focus-visible ring on all interactive status controls", () => {
    expect(BUTTON).toMatch(/focus-visible:outline-none/);
    expect(BUTTON).toMatch(/focus-visible:ring-2/);
    expect(BUTTON).toMatch(/focus-visible:ring-ring/);
  });
});

describe("static safety — no automation/device-command copy introduced", () => {
  const FORBIDDEN = [
    /\bauto[-_\s]?approve\b/i,
    /\bauto[-_\s]?reject\b/i,
    /\bauto[-_\s]?execute\b/i,
    /\bautopilot\b/i,
    /\bmqtt\b/i,
    /\bhome[-_\s]?assistant\b/i,
    /\bpi[-_\s]?bridge\b/i,
    /\brelay\b/i,
    /\bactuator\b/i,
    /\bservice_role\b/i,
    /functions\.invoke/i,
  ];
  it("ActionQueue.tsx executable code is clean", () => {
    for (const re of FORBIDDEN) expect(QUEUE).not.toMatch(re);
  });
  it("ActionDetail.tsx executable code is clean", () => {
    for (const re of FORBIDDEN) expect(DETAIL).not.toMatch(re);
  });
  it("client never inserts user_id on the audit row", () => {
    const m = QUEUE.match(
      /\.from\(\s*["']action_queue_events["']\s*\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*\)/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/\buser_id\s*:/);
  });
});
