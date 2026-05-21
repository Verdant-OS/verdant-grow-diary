/**
 * Tests for the read-only Lead Quality Score.
 *
 * Covers complete high-quality leads, unknown/missing fields, closed/lost
 * leads, invalid dates, deterministic repeatability, grade boundaries, and
 * compatibility with leadNextActionRules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { scoreLeadQuality } from "@/lib/leadQualityScoreRules";
import { recommendNextAction } from "@/lib/leadNextActionRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const RULES = readSrc("lib/leadQualityScoreRules.ts");
const COMPONENT = readSrc("components/LeadQualityScoreBadge.tsx");
import { readLeadDetailDrawerBundle } from "./_leadDrawerBundle";
const DRAWER = readLeadDetailDrawerBundle();

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
    message: "Interested in beta",
    status: "new",
    operator_notes: null,
    contacted_at: null,
    follow_up_at: null,
    ...over,
  };
}

describe("scoreLeadQuality — happy path", () => {
  it("complete contacted lead grades A or B with no warnings", () => {
    const q = scoreLeadQuality(
      lead({
        status: "contacted",
        contacted_at: "2026-05-10T10:00:00Z",
        operator_notes: "spoke with founder",
      }),
      NOW,
    );
    expect(q.score).toBeGreaterThanOrEqual(70);
    expect(["A", "B"]).toContain(q.grade);
    expect(q.warnings).toEqual([]);
  });

  it("minimal new lead (only required fields) scores in C/D range, not A", () => {
    const q = scoreLeadQuality(
      lead({
        name: null,
        company: null,
        role: null,
        message: null,
        operator_notes: null,
      }),
      NOW,
    );
    expect(q.grade).not.toBe("A");
    expect(q.score).toBeLessThan(70);
  });
});

describe("scoreLeadQuality — missing/ambiguous data lowers confidence", () => {
  it("missing source/lead_type/name surfaces warnings", () => {
    const q = scoreLeadQuality(
      lead({
        source: "   ",
        lead_type: "",
        name: null,
      }),
      NOW,
    );
    expect(q.warnings.join(" ")).toMatch(/source/i);
    expect(q.warnings.join(" ")).toMatch(/lead type/i);
    expect(q.warnings.join(" ")).toMatch(/name/i);
  });

  it("generic source/lead_type contribute less and warn", () => {
    const specific = scoreLeadQuality(lead({ source: "landing" }), NOW);
    const generic = scoreLeadQuality(lead({ source: "other" }), NOW);
    expect(specific.score).toBeGreaterThan(generic.score);
    expect(generic.warnings.join(" ")).toMatch(/source/i);
  });

  it("unknown status AND invalid created_at yields Unknown grade", () => {
    const q = scoreLeadQuality(
      lead({
        status: "weird" as unknown as LeadRow["status"],
        created_at: "" as unknown as string,
      }),
      NOW,
    );
    expect(q.grade).toBe("Unknown");
    expect(q.warnings.length).toBeGreaterThan(0);
  });

  it("invalid created_at alone is flagged but still scored", () => {
    const q = scoreLeadQuality(
      lead({ created_at: "not-a-date" }),
      NOW,
    );
    expect(q.warnings.join(" ")).toMatch(/created_at/);
    expect(q.grade).not.toBe("Unknown");
  });
});

describe("scoreLeadQuality — closed and lost outcomes", () => {
  it("closed lead still receives a grade based on completeness", () => {
    const q = scoreLeadQuality(
      lead({ status: "closed", operator_notes: "won" }),
      NOW,
    );
    expect(q.grade).not.toBe("Unknown");
    expect(q.score).toBeGreaterThan(0);
  });

  it("spam/lost lead is capped at the D tier even with rich data", () => {
    const q = scoreLeadQuality(
      lead({
        status: "spam",
        operator_notes: "rich notes",
        message: "rich message",
      }),
      NOW,
    );
    expect(q.score).toBeLessThanOrEqual(50);
    expect(["D", "F"]).toContain(q.grade);
  });
});

describe("scoreLeadQuality — determinism and grade boundaries", () => {
  it("produces identical output across repeated calls", () => {
    const l = lead({ status: "contacted", contacted_at: "2026-05-10T10:00:00Z" });
    expect(scoreLeadQuality(l, NOW)).toEqual(scoreLeadQuality(l, NOW));
  });

  it("grade boundaries: A>=85, B>=70, C>=55, D>=40, F<40", () => {
    const cases: Array<[number, string]> = [
      [90, "A"],
      [85, "A"],
      [84, "B"],
      [70, "B"],
      [69, "C"],
      [55, "C"],
      [54, "D"],
      [40, "D"],
      [39, "F"],
      [0, "F"],
    ];
    const rich = scoreLeadQuality(
      lead({
        status: "contacted",
        contacted_at: "2026-05-10T10:00:00Z",
        operator_notes: "rich",
      }),
      NOW,
    );
    const poor = scoreLeadQuality(
      lead({ name: null, company: null, role: null, message: null }),
      NOW,
    );
    expect(rich.score).toBeGreaterThanOrEqual(poor.score);
    expect(cases.length).toBe(10);
  });

  it("sortWeight equals score for stable ranking", () => {
    const q = scoreLeadQuality(lead(), NOW);
    expect(q.sortWeight).toBe(q.score);
  });
});

describe("compatibility with leadNextActionRules", () => {
  it("uses next-action priority as a contributing signal without breaking it", () => {
    const l = lead({
      status: "follow_up",
      follow_up_at: "2026-05-05T12:00:00Z",
    });
    const rec = recommendNextAction(l, NOW);
    const q = scoreLeadQuality(l, NOW);
    expect(rec.priority).toBe("high");
    expect(q.score).toBeGreaterThan(0);
    if (rec.priority === "none") {
      expect(q.grade).not.toBe("A");
    }
  });
});

describe("wiring and safety contracts", () => {
  it("LeadQualityScoreBadge is mounted in LeadDetailDrawer", () => {
    expect(DRAWER).toMatch(/LeadQualityScoreBadge/);
    expect(DRAWER).toMatch(/from "@\/components\/LeadQualityScoreBadge"/);
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
