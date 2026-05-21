/**
 * Tests for the read-only Lead Data Quality Audit rules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  auditLeadDataQuality,
  sortFindings,
} from "@/lib/leadDataQualityAuditRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const readSrc = (p: string) =>
  readFileSync(resolve(__dirname, "..", p), "utf8");
const RULES = readSrc("lib/leadDataQualityAuditRules.ts");
const COMPONENT = readSrc("components/LeadDataQualityAuditPanel.tsx");
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
    operator_notes: "talked at expo",
    contacted_at: null,
    follow_up_at: null,
    ...over,
  } as LeadRow;
}

describe("leadDataQualityAuditRules — safety", () => {
  it("rules module has no Supabase / network / external calls", () => {
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
    expect(PAGE).toMatch(/LeadDataQualityAuditPanel/);
  });

  it("findings never include raw lead data fields", () => {
    const leads: LeadRow[] = [
      lead({ id: "a", name: "Top Secret", operator_notes: "PRIVATE" }),
      lead({ id: "b", name: null, source: null as unknown as string }),
    ];
    const findings = auditLeadDataQuality(leads, NOW);
    const blob = JSON.stringify(findings);
    expect(blob).not.toMatch(/Top Secret/);
    expect(blob).not.toMatch(/PRIVATE/);
    expect(blob).not.toMatch(/ada@example\.com/);
    for (const f of findings) {
      for (const id of f.affectedLeadIds) expect(typeof id).toBe("string");
    }
  });
});

describe("auditLeadDataQuality", () => {
  it("empty input -> single info finding", () => {
    const r = auditLeadDataQuality([], NOW);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("no_leads");
    expect(r[0].severity).toBe("info");
  });

  it("healthy complete data -> healthy finding", () => {
    const leads: LeadRow[] = [
      lead({ id: "a", email: "a@x.io", name: "A", company: "Ca" }),
      lead({ id: "b", email: "b@x.io", name: "B", company: "Cb" }),
    ];
    const r = auditLeadDataQuality(leads, NOW);
    expect(r.some((f) => f.id === "healthy")).toBe(true);
  });

  it("unknown source / type produce findings", () => {
    const leads: LeadRow[] = [
      lead({
        id: "a",
        source: null as unknown as string,
        lead_type: null as unknown as string,
      }),
    ];
    const r = auditLeadDataQuality(leads, NOW);
    expect(r.find((f) => f.id === "missing_source")?.count).toBe(1);
    expect(r.find((f) => f.id === "missing_lead_type")?.count).toBe(1);
  });

  it("invalid/missing status produces finding", () => {
    const leads: LeadRow[] = [
      lead({ id: "a", status: "bogus" as never }),
      lead({ id: "b", status: undefined as never }),
    ];
    const r = auditLeadDataQuality(leads, NOW);
    const f = r.find((x) => x.id === "invalid_status");
    expect(f?.count).toBe(2);
    expect(f?.affectedLeadIds).toEqual(["a", "b"]);
  });

  it("invalid/missing created_at produces finding", () => {
    const leads: LeadRow[] = [
      lead({ id: "a", created_at: "not-a-date" }),
      lead({ id: "b", created_at: "" as unknown as string }),
    ];
    const r = auditLeadDataQuality(leads, NOW);
    expect(r.find((f) => f.id === "invalid_created_at")?.count).toBe(2);
  });

  it("missing display name fallback finding", () => {
    const leads: LeadRow[] = [lead({ id: "a", name: null })];
    const r = auditLeadDataQuality(leads, NOW);
    expect(r.find((f) => f.id === "missing_name")?.count).toBe(1);
  });

  it("duplicate-looking leads via shared email", () => {
    const leads: LeadRow[] = [
      lead({ id: "a", email: "dup@x.io", name: "Alpha", company: "C1" }),
      lead({ id: "b", email: "DUP@x.io", name: "Beta", company: "C2" }),
      lead({ id: "c", email: "other@x.io", name: "Gamma", company: "C3" }),
    ];
    const r = auditLeadDataQuality(leads, NOW);
    const f = r.find((x) => x.id === "duplicate_looking");
    expect(f?.affectedLeadIds).toEqual(["a", "b"]);
  });

  it("stale leads (old created_at, not closed) flagged", () => {
    const leads: LeadRow[] = [
      lead({ id: "a", created_at: "2025-01-01T00:00:00Z", status: "new" }),
      lead({ id: "b", created_at: "2025-01-01T00:00:00Z", status: "closed" }),
    ];
    const r = auditLeadDataQuality(leads, NOW);
    const f = r.find((x) => x.id === "stale_leads");
    expect(f?.affectedLeadIds).toEqual(["a"]);
  });

  it("deterministic ordering: severity desc, count desc, sortWeight desc, id asc", () => {
    const leads: LeadRow[] = [
      lead({
        id: "a",
        source: null as unknown as string,
        lead_type: null as unknown as string,
        status: "bogus" as never,
        name: null,
      }),
    ];
    const r = auditLeadDataQuality(leads, NOW);
    const again = auditLeadDataQuality(leads, NOW);
    expect(JSON.stringify(r)).toBe(JSON.stringify(again));
    // warnings come before watch/info
    const sevRank = { warning: 3, watch: 2, info: 1 } as const;
    let prev = Infinity;
    for (const f of r) {
      expect(sevRank[f.severity]).toBeLessThanOrEqual(prev);
      prev = sevRank[f.severity];
    }
  });

  it("divide-by-zero safety on empty input", () => {
    expect(() => auditLeadDataQuality([], NOW)).not.toThrow();
    expect(auditLeadDataQuality([], NOW)[0].percentage).toBe(0);
  });

  it("sortFindings is pure and deterministic", () => {
    const leads: LeadRow[] = [
      lead({
        id: "a",
        source: null as unknown as string,
        name: null,
        operator_notes: null,
      }),
    ];
    const r = auditLeadDataQuality(leads, NOW);
    expect(sortFindings(r)).toEqual(r);
  });
});
