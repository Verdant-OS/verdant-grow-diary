/**
 * Tests for the read-only Lead Pipeline Health rules.
 *
 * Covers healthy pipelines, empty input, high first-contact / follow-up
 * risk, low close rate, unknown source/type, low average quality,
 * deterministic ordering, divide-by-zero safety, and compatibility with
 * leadStatusSummaryRules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  evaluatePipelineHealth,
  sortHealthWarnings,
  type LeadPipelineHealthWarning,
} from "@/lib/leadPipelineHealthRules";
import { summarizeLeadStatuses } from "@/lib/leadStatusSummaryRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const RULES = readSrc("lib/leadPipelineHealthRules.ts");
const COMPONENT = readSrc("components/LeadPipelineHealthPanel.tsx");
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
  };
}

describe("evaluatePipelineHealth — empty / healthy", () => {
  it("returns a single info warning for empty input", () => {
    const w = evaluatePipelineHealth([], NOW);
    expect(w.length).toBe(1);
    expect(w[0].id).toBe("no_leads");
    expect(w[0].severity).toBe("info");
  });

  it("returns a healthy info signal when no thresholds trip", () => {
    const leads = [
      lead({
        id: "a",
        status: "closed",
        contacted_at: "2026-05-09T10:00:00Z",
        operator_notes: "won",
      }),
      lead({
        id: "b",
        status: "closed",
        contacted_at: "2026-05-08T10:00:00Z",
        operator_notes: "won",
      }),
      lead({
        id: "c",
        status: "contacted",
        contacted_at: "2026-05-10T11:00:00Z",
        operator_notes: "in progress",
      }),
      lead({
        id: "d",
        status: "contacted",
        contacted_at: "2026-05-10T11:00:00Z",
        operator_notes: "in progress",
      }),
      lead({
        id: "e",
        status: "closed",
        contacted_at: "2026-05-09T10:00:00Z",
        operator_notes: "won",
      }),
    ];
    const w = evaluatePipelineHealth(leads, NOW);
    expect(w.some((x) => x.id === "pipeline_healthy")).toBe(true);
    expect(
      w.every(
        (x) =>
          x.severity === "info" ||
          x.id === "pipeline_healthy" ||
          x.id === "low_close_rate",
      ),
    ).toBe(true);
  });
});

describe("evaluatePipelineHealth — risk detection", () => {
  it("flags high first-contact backlog", () => {
    const leads = Array.from({ length: 6 }, (_, i) =>
      lead({ id: `n${i}`, status: "new" }),
    );
    const w = evaluatePipelineHealth(leads, NOW);
    expect(w.some((x) => x.id === "high_first_contact")).toBe(true);
  });

  it("flags too many leads stuck in follow-up", () => {
    const leads = Array.from({ length: 5 }, (_, i) =>
      lead({
        id: `f${i}`,
        status: "follow_up",
        follow_up_at: "2026-05-20T12:00:00Z",
        contacted_at: "2026-05-09T12:00:00Z",
      }),
    );
    const w = evaluatePipelineHealth(leads, NOW);
    expect(w.some((x) => x.id === "stuck_follow_up")).toBe(true);
  });

  it("flags low close percentage", () => {
    const leads = Array.from({ length: 10 }, (_, i) =>
      lead({ id: `n${i}`, status: "new" }),
    );
    const w = evaluatePipelineHealth(leads, NOW);
    expect(w.some((x) => x.id === "low_close_rate")).toBe(true);
  });

  it("flags high unknown source and lead-type rates", () => {
    const leads = Array.from({ length: 5 }, (_, i) =>
      lead({ id: `u${i}`, source: "   ", lead_type: "" }),
    );
    const w = evaluatePipelineHealth(leads, NOW);
    expect(w.some((x) => x.id === "high_unknown_source")).toBe(true);
    expect(w.some((x) => x.id === "high_unknown_type")).toBe(true);
  });

  it("flags low average quality", () => {
    const leads = Array.from({ length: 4 }, (_, i) =>
      lead({
        id: `q${i}`,
        name: null,
        company: null,
        role: null,
        message: null,
        source: "   ",
        lead_type: "",
        status: "new",
      }),
    );
    const w = evaluatePipelineHealth(leads, NOW);
    expect(w.some((x) => x.id === "low_avg_quality")).toBe(true);
  });
});

describe("evaluatePipelineHealth — ordering and safety", () => {
  it("sorts severity descending, then sortWeight desc, then id asc", () => {
    const items: LeadPipelineHealthWarning[] = [
      {
        id: "z",
        severity: "info",
        title: "",
        message: "",
        metricValue: 0,
        recommendation: "",
        sortWeight: 99,
      },
      {
        id: "a",
        severity: "warning",
        title: "",
        message: "",
        metricValue: 0,
        recommendation: "",
        sortWeight: 10,
      },
      {
        id: "b",
        severity: "warning",
        title: "",
        message: "",
        metricValue: 0,
        recommendation: "",
        sortWeight: 10,
      },
      {
        id: "c",
        severity: "watch",
        title: "",
        message: "",
        metricValue: 0,
        recommendation: "",
        sortWeight: 50,
      },
    ];
    const ordered = sortHealthWarnings(items).map((x) => x.id);
    expect(ordered).toEqual(["a", "b", "c", "z"]);
  });

  it("is deterministic across repeated calls", () => {
    const leads = Array.from({ length: 6 }, (_, i) =>
      lead({ id: `n${i}`, status: "new" }),
    );
    const a = evaluatePipelineHealth(leads, NOW);
    const b = evaluatePipelineHealth(leads, NOW);
    expect(a).toEqual(b);
  });

  it("is divide-by-zero safe even for a single lead", () => {
    const w = evaluatePipelineHealth([lead({ status: "new" })], NOW);
    expect(Array.isArray(w)).toBe(true);
    expect(w.length).toBeGreaterThan(0);
  });
});

describe("compatibility with leadStatusSummaryRules", () => {
  it("threshold metrics match the underlying summary", () => {
    const leads = Array.from({ length: 6 }, (_, i) =>
      lead({ id: `n${i}`, status: "new" }),
    );
    const summary = summarizeLeadStatuses(leads, NOW);
    const w = evaluatePipelineHealth(leads, NOW).find(
      (x) => x.id === "high_first_contact",
    );
    expect(w).toBeDefined();
    // Expressed as a percentage; should equal summary's percentNeedingAction
    // when all leads are needs_first_contact.
    expect(w?.metricValue).toBe(summary.percentNeedingAction);
  });
});

describe("wiring and safety contracts", () => {
  it("LeadPipelineHealthPanel is mounted on the Leads page", () => {
    expect(PAGE).toMatch(/LeadPipelineHealthPanel/);
    expect(PAGE).toMatch(/from "@\/components\/LeadPipelineHealthPanel"/);
  });

  it("does not alter existing summary/queue/analytics/saved-views wiring", () => {
    expect(PAGE).toMatch(/LeadStatusSummaryStrip/);
    expect(PAGE).toMatch(/LeadPriorityQueuePanel/);
    expect(PAGE).toMatch(/LeadAnalyticsPanel/);
    expect(PAGE).toMatch(/LeadSavedViewsMenu/);
    expect(PAGE).toMatch(/QUICK_FILTERS/);
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
