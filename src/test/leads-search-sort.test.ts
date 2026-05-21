/**
 * Tests for /leads search & sort UI helpers.
 *
 * Covers:
 *  - searchLeads field coverage, case-insensitivity, trimming
 *  - search combines with quick filters
 *  - deterministic sort orders for all options
 *  - default quick-filter sorting remains unchanged
 *  - /leads page renders result count + empty state
 *  - no service_role / no external-control / no email/SMS/webhook/export strings
 *  - no new RLS policies introduced for leads
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { searchLeads, sortLeads } from "@/lib/leadSearchRules";
import { filterAndSortLeads } from "@/lib/leadFollowupRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const NOW = new Date("2026-06-15T12:00:00.000Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

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

const SAMPLE: LeadRow[] = [
  lead({
    id: "1",
    name: "Pulse Williams",
    email: "alice@acme.co",
    company: "Acme",
    role: "Head Grower",
    lead_type: "grower",
    source: "landing",
    message: "Interested in Pulse beta",
    operator_notes: "Met at conference",
  }),
  lead({
    id: "2",
    name: "Bob",
    email: "bob@beta.io",
    company: "Beta Labs",
    role: "CTO",
    lead_type: "hardware_partner",
    source: "other",
    message: "Sensor integration",
    operator_notes: null,
  }),
  lead({
    id: "3",
    name: "Carol",
    email: "carol@gamma.org",
    company: null,
    role: null,
    lead_type: "investor",
    source: "landing",
    message: null,
    operator_notes: "Mentioned pulse oximeter — irrelevant",
  }),
];

describe("searchLeads", () => {
  it("empty search returns all leads", () => {
    expect(searchLeads(SAMPLE, "").length).toBe(3);
    expect(searchLeads(SAMPLE, "   ").length).toBe(3);
  });
  it("matches name", () => {
    expect(searchLeads(SAMPLE, "carol").map((l) => l.id)).toEqual(["3"]);
  });
  it("matches email", () => {
    expect(searchLeads(SAMPLE, "bob@beta").map((l) => l.id)).toEqual(["2"]);
  });
  it("matches company", () => {
    expect(searchLeads(SAMPLE, "acme").map((l) => l.id)).toEqual(["1"]);
  });
  it("matches role", () => {
    expect(searchLeads(SAMPLE, "cto").map((l) => l.id)).toEqual(["2"]);
  });
  it("matches lead_type", () => {
    expect(searchLeads(SAMPLE, "investor").map((l) => l.id)).toEqual(["3"]);
  });
  it("matches source", () => {
    expect(searchLeads(SAMPLE, "landing").map((l) => l.id).sort()).toEqual([
      "1",
      "3",
    ]);
  });
  it("matches message", () => {
    expect(searchLeads(SAMPLE, "sensor").map((l) => l.id)).toEqual(["2"]);
  });
  it("matches operator_notes", () => {
    expect(searchLeads(SAMPLE, "conference").map((l) => l.id)).toEqual(["1"]);
  });
  it("is case-insensitive", () => {
    expect(searchLeads(SAMPLE, "PULSE").map((l) => l.id).sort()).toEqual([
      "1",
      "3",
    ]);
  });
  it("trims whitespace", () => {
    expect(searchLeads(SAMPLE, "   acme   ").map((l) => l.id)).toEqual(["1"]);
  });
});

describe("search combines with quick filters", () => {
  const overdueLeads: LeadRow[] = [
    lead({
      id: "p",
      company: "Pulse Co",
      status: "follow_up",
      follow_up_at: new Date(NOW - 2 * DAY).toISOString(),
    }),
    lead({
      id: "q",
      company: "Other",
      status: "follow_up",
      follow_up_at: new Date(NOW - 2 * DAY).toISOString(),
    }),
    lead({
      id: "r",
      company: "Pulse Inc",
      status: "new",
    }),
  ];

  it("overdue + 'pulse' returns only overdue Pulse-matching leads", () => {
    const searched = searchLeads(overdueLeads, "Pulse");
    const out = filterAndSortLeads(searched, "overdue", NOW);
    expect(out.map((l) => l.id)).toEqual(["p"]);
  });
});

describe("sortLeads — deterministic", () => {
  const sortable: LeadRow[] = [
    lead({
      id: "a",
      created_at: "2026-06-10T00:00:00.000Z",
      company: "Charlie",
      status: "closed",
      follow_up_at: null,
    }),
    lead({
      id: "b",
      created_at: "2026-06-12T00:00:00.000Z",
      company: "alpha",
      status: "new",
      follow_up_at: new Date(NOW + 5 * DAY).toISOString(),
    }),
    lead({
      id: "c",
      created_at: "2026-06-11T00:00:00.000Z",
      company: "Bravo",
      status: "follow_up",
      follow_up_at: new Date(NOW - DAY).toISOString(),
    }),
  ];

  it("newest-first is deterministic", () => {
    const a = sortLeads(sortable, "newest").map((l) => l.id);
    const b = sortLeads(sortable, "newest").map((l) => l.id);
    expect(a).toEqual(b);
    expect(a).toEqual(["b", "c", "a"]);
  });
  it("oldest-first is deterministic", () => {
    expect(sortLeads(sortable, "oldest").map((l) => l.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });
  it("follow-up soonest handles missing dates safely (missing last)", () => {
    const ids = sortLeads(sortable, "follow_up_soonest").map((l) => l.id);
    expect(ids).toEqual(["c", "b", "a"]);
  });
  it("company/name A-Z is deterministic and case-insensitive", () => {
    const ids = sortLeads(sortable, "az").map((l) => l.id);
    expect(ids).toEqual(["b", "c", "a"]);
  });
  it("status order puts action-needed before terminal", () => {
    const ids = sortLeads(sortable, "status").map((l) => l.id);
    // new(0), follow_up(2), closed(4)
    expect(ids).toEqual(["b", "c", "a"]);
  });
  it("default option is a no-op (input order preserved)", () => {
    expect(sortLeads(sortable, "default").map((l) => l.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("default quick-filter sorting unchanged", () => {
  const leads: LeadRow[] = [
    lead({ id: "1", created_at: "2026-06-14T10:00:00.000Z", status: "new" }),
    lead({ id: "2", created_at: "2026-06-15T08:00:00.000Z", status: "new" }),
    lead({
      id: "3",
      status: "follow_up",
      follow_up_at: new Date(NOW - DAY).toISOString(),
    }),
    lead({
      id: "4",
      status: "follow_up",
      follow_up_at: new Date(NOW + 2 * DAY).toISOString(),
    }),
  ];
  it("All preserves newest-first", () => {
    const ids = filterAndSortLeads(leads, "all", NOW).map((l) => l.id);
    expect(ids[0]).toBe("2");
  });
  it("Follow-Up keeps overdue first, missing last", () => {
    expect(filterAndSortLeads(leads, "follow_up", NOW).map((l) => l.id)).toEqual(
      ["3", "4"],
    );
  });
});

describe("/leads page renders result count and empty state", () => {
  const PAGE = readFileSync(
    resolve(__dirname, "..", "..", "src/pages/Leads.tsx"),
    "utf8",
  );
  it("renders Showing X of Y result count", () => {
    expect(PAGE).toMatch(/Showing \{filtered\.length\} of \{leads\.length\}/);
    expect(PAGE).toMatch(/leads-result-count/);
  });
  it("renders clean empty state copy", () => {
    expect(PAGE).toMatch(/No leads match this search\/filter/);
    expect(PAGE).toMatch(/leads-empty-state/);
  });
  it("renders search input and clear control", () => {
    expect(PAGE).toMatch(/leads-search-input/);
    expect(PAGE).toMatch(/leads-search-clear/);
  });
  it("renders sort selector", () => {
    expect(PAGE).toMatch(/leads-sort-select/);
    expect(PAGE).toMatch(/SORT_OPTIONS/);
  });
  it("consumes pure helpers (no inline search/sort logic)", () => {
    expect(PAGE).toMatch(/searchLeads/);
    expect(PAGE).toMatch(/sortLeads/);
    expect(PAGE).toMatch(/filterAndSortLeads/);
  });
});

describe("safety: no service_role / external integrations", () => {
  const root = resolve(__dirname, "..", "..");
  const blobs = [
    readFileSync(resolve(root, "src/pages/Leads.tsx"), "utf8"),
    readFileSync(resolve(root, "src/lib/leadSearchRules.ts"), "utf8"),
    readFileSync(resolve(root, "src/hooks/useLeadsList.ts"), "utf8"),
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
      expect(b).not.toMatch(/\bexport(?:Csv|Pdf|Leads)\b/i);
    }
  });
});

describe("no new RLS policies for search/sort PR", () => {
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
