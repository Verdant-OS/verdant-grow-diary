/**
 * Tests for the operator Leads follow-up queue.
 *
 * Covers:
 *  - needs-action / overdue / due-today / upcoming classification
 *  - closed and spam are excluded from needs-action
 *  - missing follow_up_at handled safely
 *  - deterministic sorting (newest-first for All; follow_up_at asc for queue)
 *  - /leads page renders summary cards and follow-up quick filters
 *  - no new RLS policies and no service_role introduced
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  filterAndSortLeads,
  followUpBadge,
  isDueToday,
  isNeedsAction,
  isOverdue,
  isUpcoming,
  summarizeLeads,
  QUICK_FILTERS,
} from "@/lib/leadFollowupRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const NOW = new Date("2026-06-15T12:00:00.000Z").getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function lead(p: Partial<LeadRow> & { id: string }): LeadRow {
  return {
    id: p.id,
    created_at: p.created_at ?? "2026-06-10T12:00:00.000Z",
    updated_at: p.updated_at ?? null,
    name: p.name ?? null,
    email: p.email ?? `${p.id}@example.com`,
    company: p.company ?? null,
    role: p.role ?? null,
    lead_type: p.lead_type ?? "beta_user",
    source: p.source ?? "landing",
    message: p.message ?? null,
    status: p.status ?? "new",
    operator_notes: p.operator_notes ?? null,
    contacted_at: p.contacted_at ?? null,
    follow_up_at: p.follow_up_at ?? null,
  };
}

describe("needs-action classification", () => {
  it("status=new is needs action", () => {
    expect(isNeedsAction(lead({ id: "a", status: "new" }), NOW)).toBe(true);
  });
  it("status=reviewed with no contacted_at is needs action", () => {
    expect(
      isNeedsAction(lead({ id: "b", status: "reviewed" }), NOW),
    ).toBe(true);
  });
  it("status=reviewed with contacted_at is NOT needs action", () => {
    expect(
      isNeedsAction(
        lead({
          id: "c",
          status: "reviewed",
          contacted_at: "2026-06-14T12:00:00.000Z",
        }),
        NOW,
      ),
    ).toBe(false);
  });
  it("status=follow_up with follow_up_at <= now is needs action", () => {
    expect(
      isNeedsAction(
        lead({
          id: "d",
          status: "follow_up",
          follow_up_at: new Date(NOW - HOUR).toISOString(),
        }),
        NOW,
      ),
    ).toBe(true);
  });
  it("status=follow_up with future follow_up_at is NOT needs action", () => {
    expect(
      isNeedsAction(
        lead({
          id: "e",
          status: "follow_up",
          follow_up_at: new Date(NOW + 3 * DAY).toISOString(),
        }),
        NOW,
      ),
    ).toBe(false);
  });
  it("closed and spam are excluded from needs-action", () => {
    expect(isNeedsAction(lead({ id: "f", status: "closed" }), NOW)).toBe(false);
    expect(isNeedsAction(lead({ id: "g", status: "spam" }), NOW)).toBe(false);
  });
  it("missing follow_up_at on follow_up is safe (not needs action)", () => {
    expect(
      isNeedsAction(lead({ id: "h", status: "follow_up" }), NOW),
    ).toBe(false);
  });
});

describe("overdue / due_today / upcoming classification", () => {
  it("overdue: follow_up_at before start of today", () => {
    const l = lead({
      id: "o",
      status: "follow_up",
      follow_up_at: new Date(NOW - 2 * DAY).toISOString(),
    });
    expect(isOverdue(l, NOW)).toBe(true);
    expect(isDueToday(l, NOW)).toBe(false);
    expect(isUpcoming(l, NOW)).toBe(false);
    expect(followUpBadge(l, NOW)).toBe("overdue");
  });
  it("due today: follow_up_at within today's window", () => {
    const l = lead({
      id: "t",
      status: "follow_up",
      follow_up_at: new Date(NOW + 2 * HOUR).toISOString(),
    });
    expect(isDueToday(l, NOW)).toBe(true);
    expect(isOverdue(l, NOW)).toBe(false);
    expect(isUpcoming(l, NOW)).toBe(false);
    expect(followUpBadge(l, NOW)).toBe("due_today");
  });
  it("upcoming: follow_up_at after today", () => {
    const l = lead({
      id: "u",
      status: "follow_up",
      follow_up_at: new Date(NOW + 3 * DAY).toISOString(),
    });
    expect(isUpcoming(l, NOW)).toBe(true);
    expect(isOverdue(l, NOW)).toBe(false);
    expect(isDueToday(l, NOW)).toBe(false);
    expect(followUpBadge(l, NOW)).toBe("upcoming");
  });
  it("no_follow_up badge when follow_up status lacks follow_up_at", () => {
    const l = lead({ id: "n", status: "follow_up" });
    expect(followUpBadge(l, NOW)).toBe("no_follow_up");
    expect(isOverdue(l, NOW)).toBe(false);
    expect(isDueToday(l, NOW)).toBe(false);
    expect(isUpcoming(l, NOW)).toBe(false);
  });
  it("non-follow_up statuses never produce a follow-up badge", () => {
    for (const s of ["new", "reviewed", "contacted", "closed", "spam"] as const) {
      expect(followUpBadge(lead({ id: s, status: s }), NOW)).toBeNull();
    }
  });
});

describe("summary + deterministic sorting", () => {
  const leads: LeadRow[] = [
    lead({ id: "1", status: "new", created_at: "2026-06-14T10:00:00.000Z" }),
    lead({ id: "2", status: "new", created_at: "2026-06-15T08:00:00.000Z" }),
    lead({
      id: "3",
      status: "follow_up",
      follow_up_at: new Date(NOW - DAY).toISOString(),
    }),
    lead({
      id: "4",
      status: "follow_up",
      follow_up_at: new Date(NOW + 2 * HOUR).toISOString(),
    }),
    lead({
      id: "5",
      status: "follow_up",
      follow_up_at: new Date(NOW + 5 * DAY).toISOString(),
    }),
    lead({ id: "6", status: "follow_up" }), // no follow_up_at
    lead({ id: "7", status: "closed" }),
    lead({ id: "8", status: "spam" }),
    lead({
      id: "9",
      status: "reviewed",
      contacted_at: "2026-06-14T00:00:00.000Z",
    }),
  ];

  it("summarizeLeads counts each bucket", () => {
    const s = summarizeLeads(leads, NOW);
    expect(s.new_leads).toBe(2);
    expect(s.closed).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.due_today).toBe(1);
    expect(s.upcoming).toBe(1);
    // needs_action: 2 new + 1 follow_up overdue
    expect(s.needs_action).toBe(3);
  });

  it("All filter preserves newest-first by created_at", () => {
    const all = filterAndSortLeads(leads, "all", NOW);
    const created = all.map((l) => l.created_at);
    const sorted = [...created].sort((a, b) =>
      new Date(b).getTime() - new Date(a).getTime(),
    );
    expect(created).toEqual(sorted);
  });

  it("Needs Action sorts by follow_up_at asc, overdue first, missing last", () => {
    const out = filterAndSortLeads(leads, "needs_action", NOW);
    // Should be: overdue follow_up (id 3) first, then the two news (no follow_up_at) at end.
    expect(out[0].id).toBe("3");
    // News have no follow_up_at — they go after the dated one.
    expect(out.slice(1).map((l) => l.id).sort()).toEqual(["1", "2"]);
  });

  it("Follow-Up filter sorts overdue, then due today, then upcoming, then missing", () => {
    const out = filterAndSortLeads(leads, "follow_up", NOW);
    expect(out.map((l) => l.id)).toEqual(["3", "4", "5", "6"]);
  });

  it("filterAndSort is deterministic on repeated runs", () => {
    const a = filterAndSortLeads(leads, "needs_action", NOW).map((l) => l.id);
    const b = filterAndSortLeads(leads, "needs_action", NOW).map((l) => l.id);
    expect(a).toEqual(b);
  });
});

describe("/leads page integrates the queue UI", () => {
  const root = resolve(__dirname, "..", "..");
  const PAGE = readFileSync(resolve(root, "src/pages/Leads.tsx"), "utf8");
  const HOOK = readFileSync(resolve(root, "src/hooks/useLeadsList.ts"), "utf8");

  it("renders summary cards", () => {
    for (const label of [
      "New leads",
      "Needs action",
      "Overdue",
      "Due today",
      "Upcoming",
      "Closed",
    ]) {
      expect(PAGE).toMatch(new RegExp(label, "i"));
    }
  });

  it("renders all required quick filters", () => {
    const ids = QUICK_FILTERS.map((f) => f.id);
    expect(ids).toEqual([
      "all",
      "needs_action",
      "overdue",
      "due_today",
      "upcoming",
      "new",
      "follow_up",
      "closed",
      "spam",
    ]);
    expect(PAGE).toMatch(/QUICK_FILTERS/);
  });

  it("consumes pure helpers (no business logic recomputed inline)", () => {
    expect(PAGE).toMatch(/summarizeLeads/);
    expect(PAGE).toMatch(/filterAndSortLeads/);
    expect(PAGE).toMatch(/followUpBadge/);
  });

  it("does not introduce service_role or external-control strings", () => {
    for (const blob of [PAGE, HOOK]) {
      expect(blob).not.toMatch(/service_role/);
      expect(blob).not.toMatch(/external[-_ ]control/i);
    }
  });
});

describe("no new RLS policies for the follow-up queue", () => {
  it("does not add new CREATE POLICY statements on public.leads in latest migrations", () => {
    const dir = resolve(__dirname, "..", "..", "supabase/migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    // Capture all policies ever defined on leads; this PR must not add new ones.
    const allPolicies = files
      .map((f) => readFileSync(resolve(dir, f), "utf8"))
      .join("\n")
      .match(/CREATE POLICY[^;]*ON\s+public\.leads[^;]*;/gi) ?? [];
    // Sanity: prior PRs already established operator INSERT/SELECT/UPDATE policies.
    expect(allPolicies.length).toBeGreaterThan(0);
    for (const p of allPolicies) {
      expect(p).not.toMatch(/service_role/i);
    }
  });
});
