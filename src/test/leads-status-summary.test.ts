/**
 * Tests for the read-only Lead Status Summary Strip.
 *
 * Covers happy path, empty input, invalid/missing statuses, divide-by-zero
 * safety, high-priority count, average quality score, deterministic
 * repeatability, and compatibility with leadNextActionRules /
 * leadQualityScoreRules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { summarizeLeadStatuses } from "@/lib/leadStatusSummaryRules";
import { recommendNextAction } from "@/lib/leadNextActionRules";
import { scoreLeadQuality } from "@/lib/leadQualityScoreRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const RULES = readSrc("lib/leadStatusSummaryRules.ts");
const COMPONENT = readSrc("components/LeadStatusSummaryStrip.tsx");
const PAGE = readSrc("pages/Leads.tsx");

const NOW = new Date("2026-05-10T12:00:00Z").getTime();

function lead(over: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "lead-x",
    created_at: "2026-05-09T12:00:00Z",
    updated_at: null,
    name: "Ada",
    email: "ada@example.com",
    company: null,
    role: null,
    lead_type: "investor",
    source: "landing",
    message: null,
    status: "new",
    operator_notes: null,
    contacted_at: null,
    follow_up_at: null,
    ...over,
  };
}

describe("summarizeLeadStatuses — happy path", () => {
  it("counts mixed statuses correctly", () => {
    const leads = [
      lead({ id: "n1", status: "new" }),
      lead({ id: "n2", status: "new" }),
      lead({
        id: "f1",
        status: "follow_up",
        follow_up_at: "2026-05-05T12:00:00Z",
        contacted_at: "2026-05-01T12:00:00Z",
      }),
      lead({
        id: "c1",
        status: "contacted",
        contacted_at: "2026-05-09T10:00:00Z",
      }),
      lead({ id: "x1", status: "closed" }),
      lead({ id: "s1", status: "spam" }),
    ];
    const s = summarizeLeadStatuses(leads, NOW);
    expect(s.total).toBe(6);
    expect(s.needsFirstContact).toBe(2);
    expect(s.followUp).toBe(1);
    expect(s.readyToClose).toBe(1);
    expect(s.closed).toBe(1);
    expect(s.lost).toBe(1);
    expect(s.reviewManually).toBe(0);
  });

  it("computes percentages and never inflates by counting closed/lost as action", () => {
    const leads = [
      lead({ id: "n1", status: "new" }),
      lead({ id: "x1", status: "closed" }),
      lead({ id: "s1", status: "spam" }),
      lead({ id: "x2", status: "closed" }),
    ];
    const s = summarizeLeadStatuses(leads, NOW);
    expect(s.percentClosed).toBe(50);
    expect(s.percentNeedingAction).toBe(25);
  });

  it("counts high priority leads via recommendNextAction", () => {
    const leads = [
      lead({
        id: "h1",
        status: "follow_up",
        follow_up_at: "2026-05-05T12:00:00Z",
      }),
      lead({
        id: "h2",
        status: "follow_up",
        follow_up_at: "2026-05-05T12:00:00Z",
      }),
      lead({ id: "m1", status: "new", created_at: "2026-05-10T11:00:00Z" }),
    ];
    const s = summarizeLeadStatuses(leads, NOW);
    expect(s.highPriority).toBe(2);
  });
});

describe("summarizeLeadStatuses — averages and safety", () => {
  it("averages quality score across leads", () => {
    const leads = [
      lead({ id: "a" }),
      lead({
        id: "b",
        status: "contacted",
        contacted_at: "2026-05-10T10:00:00Z",
        operator_notes: "x",
      }),
    ];
    const expected =
      (scoreLeadQuality(leads[0], NOW).score +
        scoreLeadQuality(leads[1], NOW).score) /
      2;
    const s = summarizeLeadStatuses(leads, NOW);
    expect(s.averageQualityScore).toBeCloseTo(
      Math.round(expected * 10) / 10,
      5,
    );
  });

  it("empty input returns a zero-safe summary with no divide-by-zero", () => {
    const s = summarizeLeadStatuses([], NOW);
    expect(s.total).toBe(0);
    expect(s.percentClosed).toBe(0);
    expect(s.percentNeedingAction).toBe(0);
    expect(s.averageQualityScore).toBe(0);
    expect(s.highPriority).toBe(0);
    expect(s.warnings).toEqual([]);
  });

  it("invalid/missing statuses route to reviewManually and emit a warning", () => {
    const leads = [
      lead({ id: "u1", status: "weird" as unknown as LeadRow["status"] }),
      lead({ id: "u2", status: "" as unknown as LeadRow["status"] }),
      lead({ id: "n1", status: "new" }),
    ];
    const s = summarizeLeadStatuses(leads, NOW);
    expect(s.reviewManually).toBe(2);
    expect(s.needsFirstContact).toBe(1);
    expect(s.warnings.join(" ")).toMatch(/unknown or missing status/);
  });
});

describe("summarizeLeadStatuses — determinism and compatibility", () => {
  it("produces identical output across repeated calls", () => {
    const leads = [
      lead({ id: "a", status: "new" }),
      lead({
        id: "b",
        status: "follow_up",
        follow_up_at: "2026-05-05T12:00:00Z",
      }),
      lead({ id: "c", status: "closed" }),
    ];
    expect(summarizeLeadStatuses(leads, NOW)).toEqual(
      summarizeLeadStatuses(leads, NOW),
    );
  });

  it("agrees with recommendNextAction classifications per lead", () => {
    const l = lead({
      status: "follow_up",
      follow_up_at: "2026-05-05T12:00:00Z",
    });
    const rec = recommendNextAction(l, NOW);
    const s = summarizeLeadStatuses([l], NOW);
    expect(rec.type).toBe("follow_up");
    expect(s.followUp).toBe(1);
    expect(s.needsFirstContact).toBe(0);
  });
});

describe("wiring and safety contracts", () => {
  it("LeadStatusSummaryStrip is mounted on the Leads page", () => {
    expect(PAGE).toMatch(/LeadStatusSummaryStrip/);
    expect(PAGE).toMatch(/from "@\/components\/LeadStatusSummaryStrip"/);
  });

  it("does not alter existing analytics/queue/saved-views wiring", () => {
    expect(PAGE).toMatch(/LeadAnalyticsPanel/);
    expect(PAGE).toMatch(/LeadPriorityQueuePanel/);
    expect(PAGE).toMatch(/LeadSavedViewsMenu/);
    expect(PAGE).toMatch(/QUICK_FILTERS/);
  });

  for (const [name, blob] of [
    ["rules", RULES],
    ["component", COMPONENT],
  ] as const) {
    it(`${name} has no forbidden strings`, () => {
      expect(blob).not.toMatch(/service_role/);
      expect(blob).not.toMatch(/\bwebhook\b/i);
      expect(blob).not.toMatch(/\bSMS\b/);
      expect(blob).not.toMatch(/send[-_ ]?email/i);
      expect(blob).not.toMatch(/mailgun|sendgrid|twilio|resend\.com/i);
      expect(blob).not.toMatch(/from "@\/integrations\/supabase/);
    });
  }
});
