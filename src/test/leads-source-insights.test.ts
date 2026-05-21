/**
 * Tests for the read-only Lead Source Performance Insights.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildLeadSourceInsights,
  sortInsights,
} from "@/lib/leadSourceInsightRules";
import { groupBySource } from "@/lib/leadAnalyticsRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const readSrc = (p: string) =>
  readFileSync(resolve(__dirname, "..", p), "utf8");
const RULES = readSrc("lib/leadSourceInsightRules.ts");
const COMPONENT = readSrc("components/LeadSourceInsightsPanel.tsx");
const PAGE = readSrc("pages/Leads.tsx");

const NOW = new Date("2026-05-10T12:00:00Z").getTime();

function lead(over: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "lead-x",
    created_at: "2026-05-09T12:00:00Z",
    updated_at: null,
    name: "Ada",
    email: "ada@example.com",
    company: "Co",
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

describe("leadSourceInsightRules — safety", () => {
  it("rules module has no Supabase / network / persistence", () => {
    expect(RULES).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(RULES).not.toMatch(/fetch\s*\(/);
    expect(RULES).not.toMatch(/service_role/);
    expect(RULES).not.toMatch(/localStorage/);
  });

  it("component is presenter-only", () => {
    expect(COMPONENT).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(COMPONENT).not.toMatch(/fetch\s*\(/);
  });

  it("mounted on Leads page", () => {
    expect(PAGE).toMatch(/LeadSourceInsightsPanel/);
  });
});

describe("buildLeadSourceInsights", () => {
  it("empty input -> insufficient data info", () => {
    const r = buildLeadSourceInsights([], NOW);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("no_data");
    expect(r[0].category).toBe("sample_size");
  });

  it("insufficient sample size produces sample_size insight", () => {
    const leads: LeadRow[] = [lead({ id: "a" }), lead({ id: "b" })];
    const r = buildLeadSourceInsights(leads, NOW);
    expect(r.some((i) => i.id === "insufficient_sample")).toBe(true);
  });

  it("best source by closed count surfaces correctly", () => {
    const leads: LeadRow[] = [
      ...Array.from({ length: 4 }, (_, i) =>
        lead({ id: `lc${i}`, source: "landing", status: "closed" }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        lead({ id: `oc${i}`, source: "other", status: "closed" }),
      ),
      lead({ id: "x", source: "landing", status: "new" }),
    ];
    const r = buildLeadSourceInsights(leads, NOW);
    const best = r.find((i) => i.id === "best_source_by_closed");
    expect(best?.title).toMatch(/landing/);
  });

  it("highest close rate emerges only with sufficient sample", () => {
    const leads: LeadRow[] = [
      ...Array.from({ length: 6 }, (_, i) =>
        lead({
          id: `a${i}`,
          source: "alpha",
          status: i < 5 ? "closed" : "new",
        }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        lead({
          id: `b${i}`,
          source: "beta",
          status: i < 1 ? "closed" : "new",
        }),
      ),
    ];
    const r = buildLeadSourceInsights(leads, NOW);
    expect(r.some((i) => i.id === "highest_close_rate_source" || i.id === "best_source_by_closed")).toBe(true);
  });

  it("high-volume low-close source flagged as warning", () => {
    const leads: LeadRow[] = Array.from({ length: 8 }, (_, i) =>
      lead({ id: `h${i}`, source: "spammyads", status: "new" }),
    );
    const r = buildLeadSourceInsights(leads, NOW);
    expect(r.some((i) => i.id === "high_volume_low_close")).toBe(true);
  });

  it("unknown source data quality signal surfaces", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({
        id: `u${i}`,
        source: (i < 4 ? null : "landing") as unknown as string,
      }),
    );
    const r = buildLeadSourceInsights(leads, NOW);
    expect(r.some((i) => i.id === "unknown_source_quality")).toBe(true);
  });

  it("unknown lead_type data quality signal surfaces", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({
        id: `u${i}`,
        lead_type: (i < 4 ? null : "investor") as unknown as string,
      }),
    );
    const r = buildLeadSourceInsights(leads, NOW);
    expect(r.some((i) => i.id === "unknown_type_quality")).toBe(true);
  });

  it("best lead type by close rate surfaces with sufficient sample", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({
        id: `it${i}`,
        lead_type: "investor",
        status: i < 4 ? "closed" : "new",
      }),
    );
    const r = buildLeadSourceInsights(leads, NOW);
    expect(r.some((i) => i.id === "best_lead_type")).toBe(true);
  });

  it("weak lead-type follow-up conversion flagged", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({
        id: `g${i}`,
        lead_type: "grower",
        status: i < 4 ? "follow_up" : "new",
      }),
    );
    const r = buildLeadSourceInsights(leads, NOW);
    expect(r.some((i) => i.id === "weak_lead_type_conversion")).toBe(true);
  });

  it("deterministic output for the same input", () => {
    const leads: LeadRow[] = Array.from({ length: 8 }, (_, i) =>
      lead({ id: `d${i}`, source: i % 2 ? "landing" : "other" }),
    );
    expect(JSON.stringify(buildLeadSourceInsights(leads, NOW))).toBe(
      JSON.stringify(buildLeadSourceInsights(leads, NOW)),
    );
  });

  it("ordering respects severity then category then sortWeight", () => {
    const leads: LeadRow[] = [
      ...Array.from({ length: 6 }, (_, i) =>
        lead({ id: `c${i}`, source: "landing", status: "closed" }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        lead({
          id: `u${i}`,
          source: null as unknown as string,
          lead_type: null as unknown as string,
        }),
      ),
    ];
    const r = buildLeadSourceInsights(leads, NOW);
    const sevRank = { warning: 4, watch: 3, positive: 2, info: 1 } as const;
    let prev = Infinity;
    for (const i of r) {
      expect(sevRank[i.severity]).toBeLessThanOrEqual(prev);
      prev = sevRank[i.severity];
    }
  });

  it("divide-by-zero safety on empty input", () => {
    expect(() => buildLeadSourceInsights([], NOW)).not.toThrow();
  });

  it("compatible with leadAnalyticsRules.groupBySource", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({ id: `c${i}`, source: "landing", status: "closed" }),
    );
    const stats = groupBySource(leads, NOW);
    const insights = buildLeadSourceInsights(leads, NOW);
    const landing = stats.find((s) => s.key === "landing");
    const best = insights.find((i) => i.id === "best_source_by_closed");
    expect(best?.metricValue).toBe(String(landing?.closed));
  });

  it("sortInsights is pure and deterministic", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({ id: `c${i}`, source: "landing", status: "closed" }),
    );
    const r = buildLeadSourceInsights(leads, NOW);
    expect(sortInsights(r)).toEqual(r);
  });
});
