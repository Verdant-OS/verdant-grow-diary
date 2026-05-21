/**
 * Tests for the read-only Lead Executive Summary rules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildLeadExecutiveSummary } from "@/lib/leadExecutiveSummaryRules";
import { summarizeLeadStatuses } from "@/lib/leadStatusSummaryRules";
import { evaluatePipelineHealth } from "@/lib/leadPipelineHealthRules";
import { buildPriorityQueue } from "@/lib/leadPriorityQueueRules";
import { auditLeadDataQuality } from "@/lib/leadDataQualityAuditRules";
import { buildLeadSourceInsights } from "@/lib/leadSourceInsightRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const readSrc = (p: string) =>
  readFileSync(resolve(__dirname, "..", p), "utf8");
const RULES = readSrc("lib/leadExecutiveSummaryRules.ts");
const COMPONENT = readSrc("components/LeadExecutiveSummaryCard.tsx");
const PAGE = readSrc("pages/Leads.tsx");

const NOW = new Date("2026-05-10T12:00:00Z").getTime();

function lead(over: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "lead-x",
    created_at: "2026-05-09T12:00:00Z",
    updated_at: null,
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: "Analytical Engines",
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

describe("leadExecutiveSummaryRules — safety", () => {
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

  it("mounted on Leads page above guidance", () => {
    expect(PAGE).toMatch(/LeadExecutiveSummaryCard/);
    const idxSummary = PAGE.indexOf("<LeadExecutiveSummaryCard");
    const idxGuidance = PAGE.indexOf("<LeadCommandCenterGuidance");
    expect(idxSummary).toBeGreaterThan(-1);
    expect(idxGuidance).toBeGreaterThan(-1);
    expect(idxSummary).toBeLessThan(idxGuidance);
  });

  it("never embeds raw lead fields in summary output", () => {
    const leads: LeadRow[] = [
      lead({ id: "a", name: "TopSecretName", operator_notes: "PRIVATE" }),
      lead({ id: "b", email: "private@example.com", name: null }),
    ];
    const r = buildLeadExecutiveSummary(leads, NOW);
    const blob = JSON.stringify(r);
    expect(blob).not.toMatch(/TopSecretName/);
    expect(blob).not.toMatch(/PRIVATE/);
    expect(blob).not.toMatch(/private@example\.com/);
    expect(blob).not.toMatch(/ada@example\.com/);
    expect(blob).not.toMatch(/Ada Lovelace/);
  });
});

describe("buildLeadExecutiveSummary", () => {
  it("empty input -> empty state", () => {
    const r = buildLeadExecutiveSummary([], NOW);
    expect(r.overallState).toBe("empty");
    expect(r.topMetricValue).toBe("0");
    expect(r.headline).toMatch(/no leads/i);
  });

  it("healthy pipeline -> healthy state", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({
        id: `l${i}`,
        status: "closed",
        contacted_at: "2026-05-08T00:00:00Z",
      }),
    );
    const r = buildLeadExecutiveSummary(leads, NOW);
    expect(r.overallState).toBe("healthy");
    expect(r.headline).toMatch(/healthy/i);
  });

  it("needs attention when high-priority actions queued", () => {
    const leads: LeadRow[] = Array.from({ length: 4 }, (_, i) =>
      lead({ id: `l${i}`, status: "new" }),
    );
    const r = buildLeadExecutiveSummary(leads, NOW);
    expect(r.overallState === "needs_attention" || r.overallState === "risky").toBe(
      true,
    );
    expect(r.linkedSectionIds).toContain("priority_queue");
  });

  it("risky when multiple health warnings stack", () => {
    const leads: LeadRow[] = Array.from({ length: 8 }, (_, i) =>
      lead({
        id: `l${i}`,
        status: "new",
        source: null as unknown as string,
        lead_type: null as unknown as string,
        name: null,
      }),
    );
    const r = buildLeadExecutiveSummary(leads, NOW);
    expect(r.overallState).toBe("risky");
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("unknown source/type lowers confidence with explicit warning", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({
        id: `l${i}`,
        source: (i < 3 ? null : "landing") as unknown as string,
        lead_type: (i < 3 ? null : "investor") as unknown as string,
      }),
    );
    const r = buildLeadExecutiveSummary(leads, NOW);
    expect(
      r.warnings.some((w) => /confidence lowered/i.test(w)),
    ).toBe(true);
    expect(r.linkedSectionIds).toContain("data_quality");
  });

  it("low close / high follow-up scenario triggers needs_attention or risky", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({ id: `l${i}`, status: "follow_up" }),
    );
    const r = buildLeadExecutiveSummary(leads, NOW);
    expect(["needs_attention", "risky"]).toContain(r.overallState);
  });

  it("poor data quality scenario surfaces in warnings + linked sections", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({
        id: `l${i}`,
        status: "bogus" as never,
        source: null as unknown as string,
        lead_type: null as unknown as string,
      }),
    );
    const r = buildLeadExecutiveSummary(leads, NOW);
    expect(r.linkedSectionIds).toContain("data_quality");
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("source insight support reflected in linked sections", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({ id: `l${i}`, source: "landing", status: "closed" }),
    );
    const r = buildLeadExecutiveSummary(leads, NOW);
    expect(r.linkedSectionIds).toContain("source_insights");
  });

  it("deterministic output for same input", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({ id: `l${i}`, status: i % 2 ? "closed" : "new" }),
    );
    expect(JSON.stringify(buildLeadExecutiveSummary(leads, NOW))).toBe(
      JSON.stringify(buildLeadExecutiveSummary(leads, NOW)),
    );
  });

  it("compatible with all composed rule helpers (no throws)", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({ id: `l${i}`, status: i % 2 ? "closed" : "new" }),
    );
    expect(() => summarizeLeadStatuses(leads, NOW)).not.toThrow();
    expect(() => evaluatePipelineHealth(leads, NOW)).not.toThrow();
    expect(() => buildPriorityQueue(leads, NOW)).not.toThrow();
    expect(() => auditLeadDataQuality(leads, NOW)).not.toThrow();
    expect(() => buildLeadSourceInsights(leads, NOW)).not.toThrow();
    expect(() => buildLeadExecutiveSummary(leads, NOW)).not.toThrow();
  });

  it("divide-by-zero safe on empty input", () => {
    expect(() => buildLeadExecutiveSummary([], NOW)).not.toThrow();
  });

  it("headline and recommendation do not contradict each other", () => {
    const healthy: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({ id: `l${i}`, status: "closed" }),
    );
    const r = buildLeadExecutiveSummary(healthy, NOW);
    if (r.overallState === "healthy") {
      expect(r.primaryRecommendation).not.toMatch(/risk|fix|resolve/i);
    }
    const risky: LeadRow[] = Array.from({ length: 8 }, (_, i) =>
      lead({
        id: `l${i}`,
        status: "new",
        source: null as unknown as string,
        lead_type: null as unknown as string,
      }),
    );
    const rr = buildLeadExecutiveSummary(risky, NOW);
    if (rr.overallState === "risky") {
      expect(rr.headline).toMatch(/risk/i);
    }
  });
});
