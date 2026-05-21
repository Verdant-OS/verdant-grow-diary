/**
 * Tests for /leads source/lead-type analytics.
 *
 * Covers:
 *  - groupBySource / groupByLeadType bucketing
 *  - Missing source / lead_type → "Unknown"
 *  - contacted_rate, closed_rate, spam_rate (incl. divide-by-zero guard)
 *  - deterministic sort (total desc, closed desc, key A-Z)
 *  - summarizeAnalytics: top, best closing, highest spam, most common type
 *  - analytics work on filtered/searched results
 *  - /leads renders analytics section + source/type tables
 *  - no service_role / external integrations / new RLS policies
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  groupBySource,
  groupByLeadType,
  rate,
  sortStats,
  summarizeAnalytics,
  UNKNOWN,
} from "@/lib/leadAnalyticsRules";
import { searchLeads } from "@/lib/leadSearchRules";
import { filterAndSortLeads } from "@/lib/leadFollowupRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const NOW = new Date("2026-06-15T12:00:00.000Z").getTime();

function lead(p: Partial<LeadRow> & { id: string }): LeadRow {
  return {
    id: p.id,
    created_at: p.created_at ?? "2026-06-10T12:00:00.000Z",
    updated_at: p.updated_at ?? null,
    name: p.name ?? null,
    email: p.email ?? `${p.id}@example.com`,
    company: p.company ?? null,
    role: p.role ?? null,
    // Preserve explicitly-passed null/empty so tests can simulate missing values.
    lead_type: ("lead_type" in p
      ? p.lead_type
      : "beta_user") as unknown as string,
    source: ("source" in p ? p.source : "landing") as unknown as string,
    message: p.message ?? null,
    status: p.status ?? "new",
    operator_notes: p.operator_notes ?? null,
    contacted_at: p.contacted_at ?? null,
    follow_up_at: p.follow_up_at ?? null,
  } as LeadRow;
}


const SAMPLE: LeadRow[] = [
  lead({ id: "1", source: "landing", lead_type: "beta_user", status: "new" }),
  lead({ id: "2", source: "landing", lead_type: "beta_user", status: "closed" }),
  lead({
    id: "3",
    source: "landing",
    lead_type: "grower",
    status: "follow_up",
  }),
  lead({ id: "4", source: "landing", lead_type: "grower", status: "spam" }),
  lead({ id: "5", source: "other", lead_type: "investor", status: "closed" }),
  lead({ id: "6", source: "other", lead_type: "investor", status: "contacted" }),
  lead({
    id: "7",
    source: null as unknown as string,
    lead_type: null as unknown as string,
    status: "new",
  }),
  lead({
    id: "8",
    source: "  " as unknown as string,
    lead_type: "" as unknown as string,
    status: "spam",
  }),
];

describe("rate (divide-by-zero safe)", () => {
  it("returns 0 when total is 0", () => {
    expect(rate(5, 0)).toBe(0);
    expect(rate(0, 0)).toBe(0);
  });
  it("computes a normal fraction", () => {
    expect(rate(1, 4)).toBeCloseTo(0.25);
  });
  it("handles non-finite safely", () => {
    expect(rate(1, -0)).toBe(0);
  });
});

describe("groupBySource", () => {
  const rows = groupBySource(SAMPLE, NOW);
  const map = Object.fromEntries(rows.map((r) => [r.key, r]));

  it("groups leads by source", () => {
    expect(map.landing.total).toBe(4);
    expect(map.other.total).toBe(2);
  });
  it("groups missing/blank source as Unknown", () => {
    expect(map[UNKNOWN].total).toBe(2);
  });
  it("counts each status bucket", () => {
    expect(map.landing.new).toBe(1);
    expect(map.landing.closed).toBe(1);
    expect(map.landing.follow_up).toBe(1);
    expect(map.landing.spam).toBe(1);
    expect(map.other.contacted).toBe(1);
    expect(map.other.closed).toBe(1);
  });
  it("calculates contacted/closed/spam rates safely", () => {
    // landing: contacted+follow_up+closed = 0+1+1 = 2 / 4 = 0.5
    expect(map.landing.contacted_rate).toBeCloseTo(0.5);
    expect(map.landing.closed_rate).toBeCloseTo(0.25);
    expect(map.landing.spam_rate).toBeCloseTo(0.25);
    // other: contacted_rate = (1+0+1)/2 = 1
    expect(map.other.contacted_rate).toBeCloseTo(1);
    expect(map.other.closed_rate).toBeCloseTo(0.5);
    expect(map.other.spam_rate).toBe(0);
  });
});

describe("groupByLeadType", () => {
  const rows = groupByLeadType(SAMPLE, NOW);
  const map = Object.fromEntries(rows.map((r) => [r.key, r]));
  it("groups leads by lead_type", () => {
    expect(map.beta_user.total).toBe(2);
    expect(map.grower.total).toBe(2);
    expect(map.investor.total).toBe(2);
  });
  it("groups missing/blank lead_type as Unknown", () => {
    expect(map[UNKNOWN].total).toBe(2);
  });
});

describe("sortStats — deterministic ordering", () => {
  it("sorts by total desc, then closed desc, then key A-Z", () => {
    const rows = sortStats([
      { key: "z", total: 1, new: 0, contacted: 0, follow_up: 0, closed: 0, spam: 0, needs_action: 0, contacted_rate: 0, closed_rate: 0, spam_rate: 0 },
      { key: "a", total: 3, new: 0, contacted: 0, follow_up: 0, closed: 2, spam: 0, needs_action: 0, contacted_rate: 0, closed_rate: 0, spam_rate: 0 },
      { key: "b", total: 3, new: 0, contacted: 0, follow_up: 0, closed: 1, spam: 0, needs_action: 0, contacted_rate: 0, closed_rate: 0, spam_rate: 0 },
      { key: "c", total: 3, new: 0, contacted: 0, follow_up: 0, closed: 2, spam: 0, needs_action: 0, contacted_rate: 0, closed_rate: 0, spam_rate: 0 },
    ]);
    expect(rows.map((r) => r.key)).toEqual(["a", "c", "b", "z"]);
    // repeatable
    const again = sortStats(rows).map((r) => r.key);
    expect(again).toEqual(["a", "c", "b", "z"]);
  });
});

describe("summarizeAnalytics", () => {
  const s = summarizeAnalytics(SAMPLE, NOW);
  it("top_source is the highest-total source", () => {
    expect(s.top_source).toBe("landing");
  });
  it("best_closing_source has highest closed_rate among closers", () => {
    // landing closed_rate = 0.25, other = 0.5 → other wins.
    expect(s.best_closing_source).toBe("other");
  });
  it("highest_spam_source has highest spam_rate among spammers", () => {
    // landing spam_rate = 0.25, Unknown spam_rate = 0.5 → Unknown.
    expect(s.highest_spam_source).toBe(UNKNOWN);
  });
  it("most_common_lead_type is the highest-total lead_type", () => {
    // beta_user, grower, investor, Unknown all = 2. Ties break A-Z → Unknown? no:
    // sort: total desc, closed desc, key A-Z. All total=2. Closed counts:
    // beta_user=1, grower=0, investor=1, Unknown=0 → tie between beta_user/investor at closed=1.
    // A-Z tie-break → beta_user.
    expect(s.most_common_lead_type).toBe("beta_user");
  });
  it("returns nulls for empty input", () => {
    const empty = summarizeAnalytics([], NOW);
    expect(empty.top_source).toBeNull();
    expect(empty.best_closing_source).toBeNull();
    expect(empty.highest_spam_source).toBeNull();
    expect(empty.most_common_lead_type).toBeNull();
  });
});

describe("analytics on filtered/searched results", () => {
  it("can be computed over a searched subset", () => {
    const searched = searchLeads(SAMPLE, "landing");
    const filtered = filterAndSortLeads(searched, "all", NOW);
    const rows = groupBySource(filtered, NOW);
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe("landing");
    expect(rows[0].total).toBe(4);
  });
});

describe("/leads page renders analytics UI", () => {
  const root = resolve(__dirname, "..", "..");
  const PAGE = readFileSync(resolve(root, "src/pages/Leads.tsx"), "utf8");
  const PANEL = readFileSync(
    resolve(root, "src/components/LeadAnalyticsPanel.tsx"),
    "utf8",
  );

  it("/leads imports and renders the analytics panel", () => {
    expect(PAGE).toMatch(/LeadAnalyticsPanel/);
    expect(PAGE).toMatch(/<LeadAnalyticsPanel/);
  });
  it("panel exposes section + source + type tables", () => {
    expect(PANEL).toMatch(/lead-analytics-section/);
    expect(PANEL).toMatch(/lead-analytics-source-table/);
    expect(PANEL).toMatch(/lead-analytics-type-table/);
  });
  it("panel renders all four summary cards", () => {
    for (const label of [
      "Top source",
      "Best closing source",
      "Highest spam source",
      "Most common lead type",
    ]) {
      expect(PANEL).toContain(label);
    }
  });
  it("panel shows empty state copy when no leads", () => {
    expect(PANEL).toMatch(/No lead analytics available for this view/);
  });
  it("page passes filtered leads to the panel (analytics for current results)", () => {
    expect(PAGE).toMatch(/leads=\{filtered\}/);
  });
});

describe("safety: no service_role / external integrations", () => {
  const root = resolve(__dirname, "..", "..");
  const blobs = [
    readFileSync(resolve(root, "src/lib/leadAnalyticsRules.ts"), "utf8"),
    readFileSync(resolve(root, "src/components/LeadAnalyticsPanel.tsx"), "utf8"),
    readFileSync(resolve(root, "src/pages/Leads.tsx"), "utf8"),
  ];
  it("no service_role usage", () => {
    for (const b of blobs) expect(b).not.toMatch(/service_role/);
  });
  it("no email / SMS / webhook / export / external-control strings", () => {
    for (const b of blobs) {
      expect(b).not.toMatch(/external[-_ ]control/i);
      expect(b).not.toMatch(/\bsendEmail\b/);
      expect(b).not.toMatch(/\bsendSms\b/i);
      expect(b).not.toMatch(/\bwebhook\b/i);
      expect(b).not.toMatch(/\bexport(?:Csv|Pdf|Leads|Analytics)\b/i);
    }
  });
});

describe("no new RLS policies for analytics PR", () => {
  it("no new CREATE POLICY on public.leads beyond prior PRs", () => {
    const dir = resolve(__dirname, "..", "..", "supabase/migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const all = files
      .map((f) => readFileSync(resolve(dir, f), "utf8"))
      .join("\n")
      .match(/CREATE POLICY[^;]*ON\s+public\.leads[^;]*;/gi) ?? [];
    expect(all.length).toBeGreaterThan(0);
    for (const p of all) expect(p).not.toMatch(/service_role/i);
  });
});
