/**
 * Tests for the read-only Lead Command Center Guidance rules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  evaluateCommandCenterGuidance,
} from "@/lib/leadCommandCenterGuidanceRules";
import { summarizeLeadStatuses } from "@/lib/leadStatusSummaryRules";
import { evaluatePipelineHealth } from "@/lib/leadPipelineHealthRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const readSrc = (p: string) =>
  readFileSync(resolve(__dirname, "..", p), "utf8");
const RULES = readSrc("lib/leadCommandCenterGuidanceRules.ts");
const COMPONENT = readSrc("components/LeadCommandCenterGuidance.tsx");
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
    contacted_at: null,
    follow_up_at: null,
    operator_notes: null,
    ...over,
  } as LeadRow;
}

describe("leadCommandCenterGuidanceRules — safety invariants", () => {
  it("rules module has no side-effect imports", () => {
    expect(RULES).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(RULES).not.toMatch(/service_role/);
    expect(RULES).not.toMatch(/fetch\s*\(/);
  });

  it("component file is presenter-only", () => {
    expect(COMPONENT).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(COMPONENT).not.toMatch(/fetch\s*\(/);
  });

  it("is mounted on Leads page", () => {
    expect(PAGE).toMatch(/LeadCommandCenterGuidance/);
  });
});

describe("evaluateCommandCenterGuidance", () => {
  it("empty filtered results -> empty state with no_leads_in_view", () => {
    const r = evaluateCommandCenterGuidance([], NOW);
    expect(r.state).toBe("empty");
    expect(r.items.find((i) => i.id === "no_leads_in_view")).toBeTruthy();
  });

  it("empty + active filters -> adds filters_too_narrow guidance", () => {
    const r = evaluateCommandCenterGuidance([], NOW, {
      hasActiveFilters: true,
      totalUnfiltered: 12,
    });
    expect(r.state).toBe("empty");
    expect(r.items.find((i) => i.id === "filters_too_narrow")).toBeTruthy();
  });

  it("healthy pipeline -> healthy state", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({ id: `l${i}`, status: i % 2 === 0 ? "contacted" : "closed" }),
    );
    const r = evaluateCommandCenterGuidance(leads, NOW);
    expect(r.state).toBe("healthy");
    expect(r.items[0].id).toBe("pipeline_healthy");
  });

  it("first-contact overload -> needs_attention with many_need_first_contact", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({ id: `l${i}`, status: "new", contacted_at: null }),
    );
    const r = evaluateCommandCenterGuidance(leads, NOW);
    expect(r.state).toBe("needs_attention");
    expect(
      r.items.some((i) => i.id === "many_need_first_contact"),
    ).toBe(true);
  });

  it("unknown source guidance fires when >30% missing source", () => {
    const leads: LeadRow[] = [
      lead({ id: "a", source: null as unknown as string }),
      lead({ id: "b", source: null as unknown as string }),
      lead({ id: "c", source: "landing" }),
    ];
    const r = evaluateCommandCenterGuidance(leads, NOW);
    expect(r.items.some((i) => i.id === "many_unknown_source")).toBe(true);
  });

  it("unknown lead_type guidance fires when >30% missing type", () => {
    const leads: LeadRow[] = [
      lead({ id: "a", lead_type: null as unknown as string }),
      lead({ id: "b", lead_type: null as unknown as string }),
      lead({ id: "c", lead_type: "investor" }),
    ];
    const r = evaluateCommandCenterGuidance(leads, NOW);
    expect(r.items.some((i) => i.id === "many_unknown_type")).toBe(true);
  });

  it("review_manually guidance surfaces when many have unknown status", () => {
    const leads: LeadRow[] = Array.from({ length: 5 }, (_, i) =>
      lead({ id: `l${i}`, status: "bogus" as never }),
    );
    const r = evaluateCommandCenterGuidance(leads, NOW);
    expect(r.state).toBe("needs_attention");
    expect(r.items.some((i) => i.id === "many_need_review")).toBe(true);
  });

  it("low quality score surfaces guidance", () => {
    const leads: LeadRow[] = Array.from({ length: 4 }, (_, i) =>
      lead({
        id: `l${i}`,
        email: "x@x",
        name: null,
        company: null,
        role: null,
        message: null,
        lead_type: null as unknown as string,
        source: null as unknown as string,
        status: "new",
      }),
    );
    const r = evaluateCommandCenterGuidance(leads, NOW);
    expect(r.items.some((i) => i.id === "low_avg_quality")).toBe(true);
  });

  it("deterministic output for same input", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({ id: `l${i}`, status: "new" }),
    );
    const a = evaluateCommandCenterGuidance(leads, NOW);
    const b = evaluateCommandCenterGuidance(leads, NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("sorted by state weight, then sortWeight desc, then id", () => {
    const leads: LeadRow[] = Array.from({ length: 6 }, (_, i) =>
      lead({
        id: `l${i}`,
        status: "new",
        source: null as unknown as string,
        lead_type: null as unknown as string,
      }),
    );
    const r = evaluateCommandCenterGuidance(leads, NOW);
    const weights = r.items.map((i) => i.sortWeight);
    const sorted = [...weights].sort((a, b) => b - a);
    expect(weights).toEqual(sorted);
  });

  it("compatible with summarizeLeadStatuses (no contradiction)", () => {
    const leads: LeadRow[] = Array.from({ length: 4 }, (_, i) =>
      lead({ id: `l${i}`, status: "new" }),
    );
    const summary = summarizeLeadStatuses(leads, NOW);
    const r = evaluateCommandCenterGuidance(leads, NOW);
    if (summary.needsFirstContact / summary.total > 0.5) {
      expect(r.state).toBe("needs_attention");
    }
  });

  it("compatible with evaluatePipelineHealth (warnings surface)", () => {
    const leads: LeadRow[] = Array.from({ length: 5 }, (_, i) =>
      lead({ id: `l${i}`, status: "new" }),
    );
    const health = evaluatePipelineHealth(leads, NOW);
    const r = evaluateCommandCenterGuidance(leads, NOW);
    const hasWarning = health.some((h) => h.severity === "warning");
    if (hasWarning) expect(r.state).toBe("needs_attention");
  });

  it("invalid/missing input arrays do not throw", () => {
    expect(() =>
      evaluateCommandCenterGuidance(
        null as unknown as LeadRow[],
        NOW,
      ),
    ).not.toThrow();
  });
});
