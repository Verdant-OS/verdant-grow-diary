/**
 * Leads Command Center — contract / integration test suite.
 *
 * High-level behavior contracts across all derived command-center layers.
 * Uses existing pure rule helpers — no UI rendering, no I/O, no persistence.
 */
import { describe, it, expect } from "vitest";

import type { LeadRow } from "@/hooks/useLeadsList";
import { summarizeLeadStatuses } from "@/lib/leadStatusSummaryRules";
import { evaluatePipelineHealth } from "@/lib/leadPipelineHealthRules";
import { buildPriorityQueue } from "@/lib/leadPriorityQueueRules";
import { auditLeadDataQuality } from "@/lib/leadDataQualityAuditRules";
import { buildLeadSourceInsights } from "@/lib/leadSourceInsightRules";
import { summarizeAnalytics } from "@/lib/leadAnalyticsRules";
import { evaluateCommandCenterGuidance } from "@/lib/leadCommandCenterGuidanceRules";
import { buildLeadExecutiveSummary } from "@/lib/leadExecutiveSummaryRules";
import { buildLeadDetailSnapshot } from "@/lib/leadDetailSnapshotRules";
import { recommendNextAction } from "@/lib/leadNextActionRules";
import { scoreLeadQuality } from "@/lib/leadQualityScoreRules";
import { buildLeadActivityTimeline } from "@/lib/leadActivityRules";
import { filterAndSortLeads } from "@/lib/leadFollowupRules";
import { searchLeads, sortLeads } from "@/lib/leadSearchRules";

const NOW = new Date("2026-05-20T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function lead(over: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "lead-x",
    created_at: new Date(NOW - DAY).toISOString(),
    updated_at: null,
    name: "Default Name",
    email: "default@example.com",
    company: "Default Co",
    role: "Founder",
    lead_type: "investor",
    source: "landing",
    message: "hello",
    status: "new",
    operator_notes: null,
    contacted_at: null,
    follow_up_at: null,
    ...over,
  } as LeadRow;
}

const SENSITIVE = {
  name: "ZZZ_SECRET_NAME_ZZZ",
  email: "secret_email_zzz@example.com",
  notes: "PRIVATE_OPERATOR_NOTES_ZZZ",
  message: "PRIVATE_MESSAGE_ZZZ",
  company: "SECRET_COMPANY_ZZZ",
};

function fixtureLeads(): LeadRow[] {
  return [
    // complete high-quality lead, already closed
    lead({
      id: "complete-closed",
      name: SENSITIVE.name,
      email: SENSITIVE.email,
      company: SENSITIVE.company,
      operator_notes: SENSITIVE.notes,
      message: SENSITIVE.message,
      status: "closed",
      lead_type: "investor",
      source: "referral",
      contacted_at: new Date(NOW - 10 * DAY).toISOString(),
      created_at: new Date(NOW - 20 * DAY).toISOString(),
    }),
    // needs first contact
    lead({
      id: "needs-first",
      name: "Brand New",
      email: "new@example.com",
      status: "new",
      contacted_at: null,
      created_at: new Date(NOW - 2 * DAY).toISOString(),
    }),
    // follow-up
    lead({
      id: "follow",
      name: "Following Up",
      status: "follow_up",
      contacted_at: new Date(NOW - 7 * DAY).toISOString(),
      follow_up_at: new Date(NOW - 1 * DAY).toISOString(),
      created_at: new Date(NOW - 14 * DAY).toISOString(),
    }),
    // lost lead
    lead({
      id: "lost",
      name: "Lost One",
      status: "lost" as unknown as LeadRow["status"],
      created_at: new Date(NOW - 30 * DAY).toISOString(),
    }),
    // unknown source/type/status
    lead({
      id: "unknown",
      name: "",
      email: "",
      lead_type: null as unknown as string,
      source: null as unknown as string,
      status: "weird_unknown_status" as unknown as LeadRow["status"],
      created_at: new Date(NOW - 3 * DAY).toISOString(),
    }),
    // invalid created_at
    lead({
      id: "invalid-date",
      name: "Bad Date",
      created_at: "not-a-real-date" as unknown as string,
    }),
    // duplicate-looking by email
    lead({
      id: "dup-a",
      name: "Twin",
      email: "twin@example.com",
      created_at: new Date(NOW - 5 * DAY).toISOString(),
    }),
    lead({
      id: "dup-b",
      name: "Twin",
      email: "twin@example.com",
      created_at: new Date(NOW - 4 * DAY).toISOString(),
    }),
  ];
}

const SANITIZED_HELPERS: ReadonlyArray<{
  name: string;
  run: (leads: LeadRow[]) => unknown;
}> = [
  { name: "executive summary", run: (l) => buildLeadExecutiveSummary(l, NOW) },
  { name: "status summary", run: (l) => summarizeLeadStatuses(l, NOW) },
  { name: "pipeline health", run: (l) => evaluatePipelineHealth(l, NOW) },
  { name: "data quality audit", run: (l) => auditLeadDataQuality(l, NOW) },
  { name: "source insights", run: (l) => buildLeadSourceInsights(l, NOW) },
  {
    name: "guidance",
    run: (l) =>
      evaluateCommandCenterGuidance(l, NOW, {
        hasActiveFilters: false,
        totalUnfiltered: l.length,
      }),
  },
];

describe("Leads Command Center contract", () => {
  describe("empty filtered input is safe everywhere", () => {
    const empty: LeadRow[] = [];
    it("rule helpers do not throw on empty input", () => {
      expect(() => summarizeLeadStatuses(empty, NOW)).not.toThrow();
      expect(() => evaluatePipelineHealth(empty, NOW)).not.toThrow();
      expect(() => buildPriorityQueue(empty, NOW)).not.toThrow();
      expect(() => auditLeadDataQuality(empty, NOW)).not.toThrow();
      expect(() => buildLeadSourceInsights(empty, NOW)).not.toThrow();
      expect(() => summarizeAnalytics(empty, NOW)).not.toThrow();
      expect(() =>
        evaluateCommandCenterGuidance(empty, NOW, {
          hasActiveFilters: false,
          totalUnfiltered: 0,
        }),
      ).not.toThrow();
      expect(() => buildLeadExecutiveSummary(empty, NOW)).not.toThrow();
    });

    it("executive summary reports empty state", () => {
      const s = buildLeadExecutiveSummary(empty, NOW);
      expect(s.state).toBe("empty");
    });

    it("priority queue is empty array", () => {
      expect(buildPriorityQueue(empty, NOW)).toEqual([]);
    });
  });

  describe("deterministic output on repeated runs", () => {
    const leads = fixtureLeads();
    it.each(SANITIZED_HELPERS)("$name is deterministic", ({ run }) => {
      expect(JSON.stringify(run(leads))).toBe(JSON.stringify(run(leads)));
    });

    it("priority queue is deterministic", () => {
      expect(JSON.stringify(buildPriorityQueue(leads, NOW))).toBe(
        JSON.stringify(buildPriorityQueue(leads, NOW)),
      );
    });

    it("analytics is deterministic", () => {
      expect(JSON.stringify(summarizeAnalytics(leads, NOW))).toBe(
        JSON.stringify(summarizeAnalytics(leads, NOW)),
      );
    });
  });

  describe("sensitive raw fields stay out of sanitized outputs", () => {
    const leads = fixtureLeads();
    const blacklist = [
      SENSITIVE.name,
      SENSITIVE.email,
      SENSITIVE.notes,
      SENSITIVE.message,
      SENSITIVE.company,
    ];
    it.each(SANITIZED_HELPERS)(
      "$name output contains no raw sensitive fields",
      ({ run }) => {
        const blob = JSON.stringify(run(leads));
        for (const needle of blacklist) {
          expect(blob).not.toContain(needle);
        }
      },
    );
  });

  describe("unknown/malformed data surfaces as warnings, not silently dropped", () => {
    const leads = fixtureLeads();

    it("data quality audit reports unknown source/type and invalid created_at", () => {
      const findings = auditLeadDataQuality(leads, NOW);
      const ids = findings.flatMap((f) => f.affectedLeadIds);
      expect(ids).toContain("unknown");
      expect(ids).toContain("invalid-date");
    });

    it("pipeline health surfaces unknown source/type signals", () => {
      const warnings = evaluatePipelineHealth(leads, NOW);
      const cats = warnings.map((w) => w.category);
      expect(cats).toEqual(expect.arrayContaining(["unknown_source"]));
    });

    it("status summary still counts the unknown-status lead in total", () => {
      const s = summarizeLeadStatuses(leads, NOW);
      expect(s.total).toBe(leads.length);
    });

    it("duplicate-looking leads are detected by audit", () => {
      const findings = auditLeadDataQuality(leads, NOW);
      const ids = findings.flatMap((f) => f.affectedLeadIds);
      expect(ids).toContain("dup-a");
      expect(ids).toContain("dup-b");
    });
  });

  describe("closed/lost leads do not inflate needing-action metrics", () => {
    const leads = fixtureLeads();
    it("priority queue excludes closed and lost leads", () => {
      const queue = buildPriorityQueue(leads, NOW);
      const queueIds = queue.map((q) => q.leadId);
      expect(queueIds).not.toContain("complete-closed");
      expect(queueIds).not.toContain("lost");
    });

    it("recommendNextAction yields priority none for closed and lost", () => {
      const closed = leads.find((l) => l.id === "complete-closed")!;
      const lost = leads.find((l) => l.id === "lost")!;
      expect(recommendNextAction(closed, NOW).priority).toBe("none");
      expect(recommendNextAction(lost, NOW).priority).toBe("none");
    });
  });

  describe("priority queue can open detail-safe ids without hidden fields", () => {
    const leads = fixtureLeads();
    it("every queue item leadId resolves to a lead and to a snapshot", () => {
      const queue = buildPriorityQueue(leads, NOW);
      expect(queue.length).toBeGreaterThan(0);
      for (const item of queue) {
        const match = leads.find((l) => l.id === item.leadId);
        expect(match).toBeDefined();
        const snap = buildLeadDetailSnapshot(match!, NOW);
        expect(snap).toBeDefined();
        expect(typeof snap.label).toBe("string");
      }
    });

    it("snapshot, next action, quality score, and timeline work for unknown-data lead", () => {
      const u = leads.find((l) => l.id === "unknown")!;
      expect(() => buildLeadDetailSnapshot(u, NOW)).not.toThrow();
      expect(() => recommendNextAction(u, NOW)).not.toThrow();
      expect(() => scoreLeadQuality(u, NOW)).not.toThrow();
      expect(() => buildLeadActivityTimeline(u)).not.toThrow();
    });

    it("snapshot, next action, quality score, and timeline work for invalid-date lead", () => {
      const u = leads.find((l) => l.id === "invalid-date")!;
      expect(() => buildLeadDetailSnapshot(u, NOW)).not.toThrow();
      expect(() => recommendNextAction(u, NOW)).not.toThrow();
      expect(() => scoreLeadQuality(u, NOW)).not.toThrow();
      expect(() => buildLeadActivityTimeline(u)).not.toThrow();
    });
  });

  describe("saved-view-style filter/sort application does not alter lead data", () => {
    const leads = fixtureLeads();

    it("filterAndSortLeads returns subset with identical object references", () => {
      const before = leads.map((l) => ({ ...l }));
      const out = filterAndSortLeads(leads.slice(), "needs_action", NOW);
      // input identity preserved (no mutation)
      leads.forEach((l, i) => {
        expect(l).toEqual(before[i]);
      });
      // results are a subset, and each item is one of the originals
      for (const l of out) {
        expect(leads).toContain(l);
      }
    });

    it("searchLeads + sortLeads compose without mutating leads", () => {
      const before = JSON.stringify(leads);
      const searched = searchLeads(leads.slice(), "twin");
      const sorted = sortLeads(searched, "newest");
      expect(JSON.stringify(leads)).toBe(before);
      expect(sorted.every((l) => leads.includes(l))).toBe(true);
    });

    it("status quick filter narrows without removing lost/closed when requested", () => {
      const closedOnly = filterAndSortLeads(leads.slice(), "closed", NOW);
      expect(closedOnly.map((l) => l.id)).toContain("complete-closed");
    });
  });

  describe("composition with executive summary", () => {
    it("executive summary state is one of the declared values for fixtures", () => {
      const s = buildLeadExecutiveSummary(fixtureLeads(), NOW);
      expect(["healthy", "needs_attention", "risky"]).toContain(s.state);
    });

    it("healthy single-closed-lead pipeline does not flag risky", () => {
      const single = [
        lead({
          id: "h1",
          status: "closed",
          contacted_at: new Date(NOW - DAY).toISOString(),
        }),
      ];
      const s = buildLeadExecutiveSummary(single, NOW);
      expect(s.state).not.toBe("risky");
    });
  });
});
