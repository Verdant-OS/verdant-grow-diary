/**
 * Static UX tests for the Action Queue operator improvements.
 *
 * Asserts:
 *  - Status, risk, and sort filters are rendered.
 *  - Pending vs reviewed grouping uses the "Needs Review" / "Already Reviewed" labels.
 *  - All required empty-state strings exist.
 *  - Inline EventHistory is rendered per row in both groups.
 *  - Approve / Reject / Simulate still flow through transition()+audit.
 *  - No device-control surface introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE = readFileSync(
  resolve(__dirname, "../..", "src/pages/ActionQueue.tsx"),
  "utf8",
);

describe("ActionQueue — filter UI", () => {
  it("exposes a status filter with Pending/Simulated/Approved/Rejected/All", () => {
    expect(PAGE).toMatch(/aria-label=\s*["']Status filter["']/);
    for (const label of ["All statuses", "Pending", "Simulated", "Approved", "Rejected"]) {
      expect(PAGE).toContain(label);
    }
  });

  it("exposes a risk filter with All/Low/Medium/High/Critical", () => {
    expect(PAGE).toMatch(/aria-label=\s*["']Risk filter["']/);
    for (const label of ["All risks", "Low", "Medium", "High", "Critical"]) {
      expect(PAGE).toContain(label);
    }
  });

  it("exposes a sort selector with Newest/Oldest/Highest risk", () => {
    expect(PAGE).toMatch(/aria-label=\s*["']Sort order["']/);
    for (const label of ["Newest first", "Oldest first", "Highest risk first"]) {
      expect(PAGE).toContain(label);
    }
  });
});

describe("ActionQueue — grouping & empty states", () => {
  it("renders a Needs Review group", () => {
    expect(PAGE).toMatch(/Needs Review/);
    expect(PAGE).toMatch(/aria-label=\s*["']Needs Review["']/);
  });

  it("renders an Already Reviewed group", () => {
    expect(PAGE).toMatch(/Already Reviewed/);
    expect(PAGE).toMatch(/aria-label=\s*["']Already Reviewed["']/);
  });

  it("has all three required empty-state messages", () => {
    expect(PAGE).toContain("No pending actions.");
    expect(PAGE).toContain("No reviewed actions.");
    expect(PAGE).toContain("No actions match these filters.");
  });

  it("renders EventHistory inline in both pending and reviewed lists", () => {
    const matches = PAGE.match(/<EventHistory\b/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe("ActionQueue — transition/audit flow preserved", () => {
  it("approve/reject/simulate still flow through transition() via the note dialog", () => {
    expect(PAGE).toMatch(/function\s+approve[\s\S]*?openNoteDialog\(/);
    expect(PAGE).toMatch(/function\s+reject[\s\S]*?openNoteDialog\(/);
    expect(PAGE).toMatch(/function\s+simulate[\s\S]*?openNoteDialog\(/);
    expect(PAGE).toMatch(/function\s+confirmNoteDialog[\s\S]*?transition\(/);
  });

  it("transition() writes to action_queue_events", () => {
    expect(PAGE).toMatch(
      /\.from\(\s*["']action_queue_events["']\s*\)[\s\S]{0,200}\.insert\(/,
    );
  });

  it("approve never sends user_id from the client", () => {
    const m = PAGE.match(
      /\.from\(\s*["']action_queue_events["']\s*\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*\)/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/\buser_id\s*:/);
  });
});

describe("ActionQueue — safety", () => {
  it("no device-control surface introduced", () => {
    expect(PAGE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
  });

  it("simulate still states no device command is sent", () => {
    expect(PAGE).toMatch(/no device command sent/i);
  });
});
