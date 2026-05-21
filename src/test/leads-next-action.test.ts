/**
 * Tests for the read-only Lead Next Action Advisor.
 *
 * Covers happy paths, missing/invalid fields, unknown status, closed/lost
 * terminal states, deterministic repeatability, and priority ordering.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  recommendNextAction,
  priorityRank,
} from "@/lib/leadNextActionRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const RULES = readSrc("lib/leadNextActionRules.ts");
const COMPONENT = readSrc("components/LeadNextActionPanel.tsx");
const DRAWER = readSrc("components/LeadDetailDrawer.tsx");

const NOW = new Date("2026-05-10T12:00:00Z").getTime();

const baseLead: LeadRow = {
  id: "lead-1",
  created_at: "2026-05-09T12:00:00Z",
  updated_at: null,
  name: "Ada Lovelace",
  email: "ada@example.com",
  company: "Analytical Engines",
  role: "Founder",
  lead_type: "investor",
  source: "landing",
  message: "Interested in beta",
  status: "new",
  operator_notes: null,
  contacted_at: null,
  follow_up_at: null,
};

describe("recommendNextAction — happy paths", () => {
  it("new lead under a day → Needs First Contact (medium)", () => {
    const r = recommendNextAction(
      { ...baseLead, created_at: "2026-05-10T08:00:00Z" },
      NOW,
    );
    expect(r.type).toBe("needs_first_contact");
    expect(r.priority).toBe("medium");
    expect(r.warning).toBeNull();
  });

  it("new lead older than a day → Needs First Contact (high)", () => {
    const r = recommendNextAction(
      { ...baseLead, created_at: "2026-05-01T08:00:00Z" },
      NOW,
    );
    expect(r.type).toBe("needs_first_contact");
    expect(r.priority).toBe("high");
  });

  it("follow_up status with overdue follow_up_at → Follow Up (high)", () => {
    const r = recommendNextAction(
      {
        ...baseLead,
        status: "follow_up",
        contacted_at: "2026-05-01T12:00:00Z",
        follow_up_at: "2026-05-05T12:00:00Z",
      },
      NOW,
    );
    expect(r.type).toBe("follow_up");
    expect(r.priority).toBe("high");
  });

  it("follow_up status with future follow_up_at → Follow Up (medium)", () => {
    const r = recommendNextAction(
      {
        ...baseLead,
        status: "follow_up",
        contacted_at: "2026-05-09T12:00:00Z",
        follow_up_at: "2026-05-20T12:00:00Z",
      },
      NOW,
    );
    expect(r.type).toBe("follow_up");
    expect(r.priority).toBe("medium");
  });

  it("contacted recently → Ready to Close (medium)", () => {
    const r = recommendNextAction(
      {
        ...baseLead,
        status: "contacted",
        contacted_at: "2026-05-10T06:00:00Z",
      },
      NOW,
    );
    expect(r.type).toBe("ready_to_close");
    expect(r.priority).toBe("medium");
  });

  it("contacted but stale → Ready to Close (high)", () => {
    const r = recommendNextAction(
      {
        ...baseLead,
        status: "contacted",
        contacted_at: "2026-05-01T06:00:00Z",
      },
      NOW,
    );
    expect(r.type).toBe("ready_to_close");
    expect(r.priority).toBe("high");
  });
});

describe("recommendNextAction — terminal states", () => {
  it("closed lead → Closed - No Action (none)", () => {
    const r = recommendNextAction({ ...baseLead, status: "closed" }, NOW);
    expect(r.type).toBe("closed_no_action");
    expect(r.priority).toBe("none");
  });

  it("spam lead → Lost - No Action (none)", () => {
    const r = recommendNextAction({ ...baseLead, status: "spam" }, NOW);
    expect(r.type).toBe("lost_no_action");
    expect(r.priority).toBe("none");
  });
});

describe("recommendNextAction — safety and ambiguity", () => {
  it("unknown status → Review Manually with warning", () => {
    const r = recommendNextAction(
      { ...baseLead, status: "weird" as unknown as LeadRow["status"] },
      NOW,
    );
    expect(r.type).toBe("review_manually");
    expect(r.warning).toMatch(/status/i);
    expect(r.priority).not.toBe("none");
  });

  it("follow_up status without follow_up_at → Review Manually + warning", () => {
    const r = recommendNextAction(
      { ...baseLead, status: "follow_up", follow_up_at: null },
      NOW,
    );
    expect(r.type).toBe("review_manually");
    expect(r.warning).toMatch(/follow_up_at/);
  });

  it("invalid follow_up_at string is treated as missing", () => {
    const r = recommendNextAction(
      { ...baseLead, status: "follow_up", follow_up_at: "not-a-date" },
      NOW,
    );
    expect(r.type).toBe("review_manually");
  });

  it("missing source/lead_type/created_at surface warnings, not silent health", () => {
    const r = recommendNextAction(
      {
        ...baseLead,
        created_at: "" as unknown as string,
        source: "   ",
        lead_type: "",
      },
      NOW,
    );
    expect(r.warning).toMatch(/source/i);
    expect(r.warning).toMatch(/lead type/i);
    expect(r.warning).toMatch(/created_at/i);
  });

  it("contacted status but missing contacted_at → Needs First Contact + warning", () => {
    const r = recommendNextAction(
      { ...baseLead, status: "contacted", contacted_at: null },
      NOW,
    );
    expect(r.type).toBe("needs_first_contact");
    expect(r.warning).toMatch(/contacted_at/);
  });
});

describe("recommendNextAction — determinism and ranking", () => {
  it("returns identical output for identical input across calls", () => {
    const a = recommendNextAction(baseLead, NOW);
    const b = recommendNextAction(baseLead, NOW);
    expect(a).toEqual(b);
  });

  it("sortWeight is stable and orders high before low priorities", () => {
    const overdueFollowUp = recommendNextAction(
      {
        ...baseLead,
        status: "follow_up",
        follow_up_at: "2026-05-05T12:00:00Z",
      },
      NOW,
    );
    const closed = recommendNextAction(
      { ...baseLead, status: "closed" },
      NOW,
    );
    expect(overdueFollowUp.sortWeight).toBeLessThan(closed.sortWeight);
  });

  it("priorityRank orders high < medium < low < none", () => {
    expect(priorityRank("high")).toBeLessThan(priorityRank("medium"));
    expect(priorityRank("medium")).toBeLessThan(priorityRank("low"));
    expect(priorityRank("low")).toBeLessThan(priorityRank("none"));
  });
});

describe("wiring and safety contracts", () => {
  it("LeadNextActionPanel is mounted in LeadDetailDrawer", () => {
    expect(DRAWER).toMatch(/LeadNextActionPanel/);
    expect(DRAWER).toMatch(/from "@\/components\/LeadNextActionPanel"/);
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
