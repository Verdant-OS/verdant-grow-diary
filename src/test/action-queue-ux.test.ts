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

const PAGE = readFileSync(resolve(__dirname, "../..", "src/pages/ActionQueue.tsx"), "utf8");

function buttonOpeningTag(testId: string): string | undefined {
  const marker = `data-testid="${testId}"`;
  const markerIndex = PAGE.indexOf(marker);
  if (markerIndex < 0) return undefined;

  const buttonStart = PAGE.lastIndexOf("<Button", markerIndex);
  const previousButtonEnd = PAGE.lastIndexOf("</Button>", markerIndex);
  const buttonEnd = PAGE.indexOf("</Button>", markerIndex);
  if (buttonStart < 0 || buttonStart < previousButtonEnd || buttonEnd < 0) return undefined;

  return PAGE.slice(buttonStart, buttonEnd + "</Button>".length);
}

describe("ActionQueue — filter UI", () => {
  it("uses the shared page header and keeps refresh as a header action", () => {
    expect(PAGE).toMatch(/import PageHeader from ["']@\/components\/PageHeader["']/);
    expect(PAGE).toMatch(/<PageHeader[\s\S]*?actions=\{[\s\S]*?action-queue-refresh-button/);
    expect(PAGE).not.toMatch(/<h1[^>]*>[\s\S]*?action-queue-refresh-button/);
  });

  it("stacks every filter control full-width before the small breakpoint", () => {
    for (const label of [
      "Status filter",
      "Risk filter",
      "Source filter",
      "Trace filter",
      "Sort order",
    ]) {
      const controlStart = PAGE.indexOf(`aria-label="${label}"`);
      expect(controlStart).toBeGreaterThan(-1);
      const control = PAGE.slice(Math.max(0, controlStart - 160), controlStart + 80);
      expect(control).toMatch(/w-full sm:w-\[/);
    }
    expect(PAGE).toMatch(/grid grid-cols-1 gap-2 rounded-2xl p-3 sm:flex sm:flex-wrap/);
  });

  it("keeps every mobile filter, search, and pagination control at least 44px tall", () => {
    for (const label of [
      "Status filter",
      "Risk filter",
      "Source filter",
      "Trace filter",
      "Sort order",
      "Search actions",
      "Page size",
      "Previous page",
      "Next page",
    ]) {
      const labelIndex = PAGE.indexOf(`aria-label="${label}"`);
      expect(labelIndex, `${label} must exist`).toBeGreaterThan(-1);
      const control = PAGE.slice(Math.max(0, labelIndex - 240), labelIndex + 120);
      expect(control, `${label} must expose a 44px mobile touch target`).toContain("min-h-11");
    }
  });

  it("keeps refresh and pending decision controls at least 44px tall on mobile", () => {
    for (const testId of [
      "action-queue-refresh-button",
      "action-queue-row-approve",
      "action-queue-row-simulate",
      "action-queue-row-reject",
    ]) {
      const control = buttonOpeningTag(testId);
      expect(control, `${testId} must be a directly selectable Button`).toBeTruthy();
      expect(control, `${testId} must expose a 44px mobile touch target`).toContain("min-h-11");
      expect(control, `${testId} may return to the compact desktop height`).toContain("sm:min-h-9");
    }
  });

  it("allows narrow filter and pagination groups to shrink and wrap", () => {
    const filters = PAGE.slice(
      PAGE.lastIndexOf("<div", PAGE.indexOf('aria-label="Action queue filters"')),
      PAGE.indexOf('aria-label="Action queue filters"') + 80,
    );
    const pagination = PAGE.slice(
      PAGE.indexOf('data-testid="action-queue-pagination"'),
      PAGE.indexOf('data-testid="action-queue-no-results"'),
    );

    expect(filters).toContain("min-w-0");
    expect(pagination).toContain("min-w-0");
    expect(pagination).toContain("flex-wrap");
  });

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
    expect(PAGE).toMatch(/ACTION_QUEUE_EMPTY_PENDING_TITLE/);
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
    expect(PAGE).toMatch(/\.from\(\s*["']action_queue_events["']\s*\)[\s\S]{0,200}\.insert\(/);
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
