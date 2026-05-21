/**
 * Tests for the read-only Lead Activity Timeline.
 *
 * Verifies the pure rules in src/lib/leadActivityRules.ts and the wiring of
 * the presenter component into the Lead Detail Drawer. No DB calls, no
 * external communication.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildLeadActivityTimeline,
  sortActivityEvents,
  type LeadActivityEvent,
} from "@/lib/leadActivityRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

const RULES = readSrc("lib/leadActivityRules.ts");
const COMPONENT = readSrc("components/LeadActivityTimeline.tsx");
import { readLeadDetailDrawerBundle } from "./_leadDrawerBundle";
const DRAWER = readLeadDetailDrawerBundle();
const PAGE = readSrc("pages/Leads.tsx");

const baseLead: LeadRow = {
  id: "lead-1",
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-02T10:00:00Z",
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

describe("buildLeadActivityTimeline — happy path", () => {
  it("derives baseline events from a brand-new lead", () => {
    const events = buildLeadActivityTimeline(baseLead);
    const types = events.map((e) => e.type);
    expect(types).toContain("lead_created");
    expect(types).toContain("source_captured");
    expect(types).toContain("lead_type_captured");
    expect(types).toContain("status_current");
    // No contact / follow-up / closed / notes for a brand-new lead.
    expect(types).not.toContain("contacted");
    expect(types).not.toContain("follow_up_scheduled");
    expect(types).not.toContain("closed");
    expect(types).not.toContain("notes_present");
  });

  it("includes contacted, follow_up_scheduled, notes_present, and closed when fields are present", () => {
    const lead: LeadRow = {
      ...baseLead,
      status: "closed",
      operator_notes: "  spoke with founder  ",
      contacted_at: "2026-05-03T12:00:00Z",
      follow_up_at: "2026-05-10T09:00:00Z",
    };
    const types = buildLeadActivityTimeline(lead).map((e) => e.type);
    expect(types).toContain("contacted");
    expect(types).toContain("follow_up_scheduled");
    expect(types).toContain("notes_present");
    expect(types).toContain("closed");
    expect(types).toContain("status_current");
  });

  it("exposes current status as the status_current detail", () => {
    const lead: LeadRow = { ...baseLead, status: "follow_up" };
    const ev = buildLeadActivityTimeline(lead).find(
      (e) => e.type === "status_current",
    );
    expect(ev?.detail).toBe("Follow-up");
  });
});

describe("buildLeadActivityTimeline — safety", () => {
  it("handles missing created_at safely (no throw, at is null)", () => {
    const lead = { ...baseLead, created_at: "" as unknown as string };
    const events = buildLeadActivityTimeline(lead);
    const created = events.find((e) => e.type === "lead_created");
    expect(created).toBeDefined();
    expect(created?.at).toBeNull();
  });

  it("treats invalid contacted_at / follow_up_at as missing", () => {
    const lead: LeadRow = {
      ...baseLead,
      contacted_at: "not-a-date",
      follow_up_at: "also-bad",
    };
    const types = buildLeadActivityTimeline(lead).map((e) => e.type);
    expect(types).not.toContain("contacted");
    expect(types).not.toContain("follow_up_scheduled");
  });

  it("treats blank/whitespace strings as missing for source/type/notes", () => {
    const lead: LeadRow = {
      ...baseLead,
      source: "   ",
      lead_type: "",
      operator_notes: "   ",
    };
    const types = buildLeadActivityTimeline(lead).map((e) => e.type);
    expect(types).not.toContain("source_captured");
    expect(types).not.toContain("lead_type_captured");
    expect(types).not.toContain("notes_present");
  });
});

describe("sortActivityEvents — determinism", () => {
  it("orders newest-first with stable tie-breakers and undated last", () => {
    const events: LeadActivityEvent[] = [
      { id: "a", type: "lead_created", label: "A", at: "2026-05-01T10:00:00Z", order: 0 },
      { id: "b", type: "contacted", label: "B", at: "2026-05-03T10:00:00Z", order: 4 },
      { id: "c", type: "status_current", label: "C", at: null, order: 7 },
      { id: "d", type: "source_captured", label: "D", at: "2026-05-01T10:00:00Z", order: 1 },
    ];
    const sorted = sortActivityEvents(events).map((e) => e.id);
    // newest dated first, ties broken by higher order, undated last
    expect(sorted).toEqual(["b", "d", "a", "c"]);
  });

  it("produces a stable result when invoked twice on the same lead", () => {
    const lead: LeadRow = {
      ...baseLead,
      contacted_at: "2026-05-03T12:00:00Z",
      follow_up_at: "2026-05-10T09:00:00Z",
      operator_notes: "x",
      status: "closed",
    };
    const a = buildLeadActivityTimeline(lead).map((e) => e.id);
    const b = buildLeadActivityTimeline(lead).map((e) => e.id);
    expect(a).toEqual(b);
  });
});

describe("LeadActivityTimeline component wiring", () => {
  it("renders an empty-state branch when no lead is provided", () => {
    expect(COMPONENT).toMatch(/data-testid="lead-activity-timeline-empty"/);
    expect(COMPONENT).toMatch(/data-testid="lead-activity-timeline"/);
  });

  it("is mounted in the LeadDetailDrawer", () => {
    expect(DRAWER).toMatch(/LeadActivityTimeline/);
    expect(DRAWER).toMatch(/from "@\/components\/LeadActivityTimeline"/);
  });
});

describe("safety contracts", () => {
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

  it("does not change Leads page filter/analytics/saved-views wiring", () => {
    // Sanity: these existing integrations must remain.
    expect(PAGE).toMatch(/LeadAnalyticsPanel/);
    expect(PAGE).toMatch(/LeadSavedViewsMenu/);
    expect(PAGE).toMatch(/QUICK_FILTERS/);
  });
});
