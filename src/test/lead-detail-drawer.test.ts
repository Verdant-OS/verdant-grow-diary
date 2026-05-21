/**
 * Tests for the Lead Detail Drawer refactor.
 *
 * Verifies:
 *  - /leads renders compact rows with a clickable View action.
 *  - The drawer renders all five required sections.
 *  - Submission fields are read-only (no <input> bound to email/name/etc.).
 *  - Operator notes editor and follow-up datetime editor live in the drawer.
 *  - LogInteraction control and LeadActivity timeline live in the drawer.
 *  - Activity timeline is rendered as an ordered list (newest-first contract).
 *  - updateLead allow-list still excludes original submission fields.
 *  - follow_up_changed event is only created when the value actually changes.
 *  - No service_role, email, SMS, webhook, export, or external-control strings.
 *  - No new RLS policies are introduced for lead_events.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { buildLeadDetailViewModel } from "@/lib/leadDetailViewModel";

const root = resolve(__dirname, "..", "..");
const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

const PAGE = readSrc("pages/Leads.tsx");
const DRAWER = readSrc("components/LeadDetailDrawer.tsx");
const HOOK = readSrc("hooks/useLeadsList.ts");
const VIEW_MODEL = readSrc("lib/leadDetailViewModel.ts");

const MIGRATIONS_DIR = resolve(root, "supabase/migrations");
const migrationContents = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"))
  .join("\n\n");

const baseLead = {
  id: "lead-1",
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-02T10:00:00Z",
  name: "Ada Lovelace",
  email: "ada@example.com",
  company: "Analytical Engines",
  role: "Founder",
  lead_type: "investor",
  source: "landing",
  message: "Interested in beta",
  status: "new" as const,
  operator_notes: null,
  contacted_at: null,
  follow_up_at: null,
};

describe("compact /leads table", () => {
  it("renders a table marked as the leads table", () => {
    expect(PAGE).toMatch(/data-testid="leads-table"/);
  });

  it("renders a row per lead with a View action", () => {
    expect(PAGE).toMatch(/data-testid="lead-row"/);
    expect(PAGE).toMatch(/data-testid="lead-view-button"/);
    expect(PAGE).toMatch(/onClick=\{() => openLead\(l\)\}/);
  });

  it("does not embed the full operator panel inline in the row", () => {
    // The heavy editors should only live in the drawer file now.
    expect(PAGE).not.toMatch(/placeholder="Optional note"/);
    expect(PAGE).not.toMatch(/Operator notes/);
    expect(PAGE).not.toMatch(/datetime-local/);
  });

  it("mounts the LeadDetailDrawer", () => {
    expect(PAGE).toMatch(/<LeadDetailDrawer/);
    expect(PAGE).toMatch(/from "@\/components\/LeadDetailDrawer"/);
  });
});

describe("Lead Detail Drawer structure", () => {
  it("has the five required sections", () => {
    for (const section of [
      "Lead Summary",
      "Submission Details",
      "Operator Workflow",
      "Log Interaction",
      "Activity History",
    ]) {
      expect(DRAWER).toContain(section);
    }
  });

  it("uses a right-side drawer that opens via the drawer testid", () => {
    expect(DRAWER).toMatch(/data-testid="lead-detail-drawer"/);
    expect(DRAWER).toMatch(/side="right"/);
  });

  it("renders submission details as a read-only definition list", () => {
    expect(DRAWER).toMatch(/data-testid="submission-details"/);
    // Definition-list <dt>/<dd> rather than editable inputs.
    expect(DRAWER).toMatch(/<dt /);
    expect(DRAWER).toMatch(/<dd /);
  });

  it("does not bind <Input>/<Textarea> to original submission fields", () => {
    for (const field of ["email", "name", "company", "role", "lead_type", "source", "message"]) {
      // Forbid `value={lead.<field>}` and `defaultValue={lead.<field>}` patterns.
      const re = new RegExp(`(value|defaultValue)=\\{lead\\.${field}\\b`);
      expect(DRAWER).not.toMatch(re);
    }
  });

  it("includes the operator notes editor and follow-up datetime input", () => {
    expect(DRAWER).toMatch(/Operator notes/);
    expect(DRAWER).toMatch(/datetime-local/);
  });

  it("includes the Log Interaction control and Activity History timeline", () => {
    expect(DRAWER).toMatch(/data-testid="log-interaction"/);
    expect(DRAWER).toMatch(/data-testid="lead-activity"/);
    // newest-first contract — useLeadEvents already orders DESC; the timeline
    // should render as an ordered list reflecting that order without re-sorting.
    expect(DRAWER).toMatch(/<ol[\s\S]*?data-testid="lead-activity"/);
    expect(DRAWER).not.toMatch(/\.sort\(/);
    expect(DRAWER).not.toMatch(/\.reverse\(/);
  });
});

describe("buildLeadDetailViewModel", () => {
  it("derives display strings without exposing editable handles", () => {
    const vm = buildLeadDetailViewModel(baseLead);
    expect(vm.title).toBe("Ada Lovelace");
    expect(vm.subtitle).toBe("Analytical Engines");
    expect(vm.submission.map((f) => f.label)).toEqual([
      "Name",
      "Email",
      "Company",
      "Role",
      "Lead type",
      "Source",
      "Message",
    ]);
    expect(vm.followUpInputValue).toBe("");
  });

  it("falls back to email when name is missing", () => {
    const vm = buildLeadDetailViewModel({ ...baseLead, name: null });
    expect(vm.title).toBe("ada@example.com");
  });

  it("formats follow-up input value as datetime-local slice", () => {
    const vm = buildLeadDetailViewModel({
      ...baseLead,
      follow_up_at: "2026-06-01T10:30:00Z",
    });
    expect(vm.followUpInputValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe("safety contracts preserved by the drawer refactor", () => {
  it("updateLead allow-list still excludes original submission fields", () => {
    const allowBlock =
      HOOK.match(/const ALLOWED\s*=\s*\[[\s\S]*?\]\s+as const;/)?.[0] ?? "";
    for (const f of ["email", "name", "company", "role", "lead_type", "source", "message"]) {
      expect(allowBlock).not.toMatch(new RegExp(`"${f}"`));
    }
  });

  it("only creates a follow_up_changed event when the value actually changes", () => {
    expect(PAGE).toMatch(/followUpDidChange\(l\.follow_up_at,\s*next\)/);
    expect(PAGE).toMatch(/eventType:\s*"follow_up_changed"/);
  });

  it("adds no new RLS policies for lead_events", () => {
    const policies =
      migrationContents.match(/CREATE POLICY[^;]*ON\s+public\.lead_events[^;]*;/gi) ?? [];
    // Existing baseline = 2 (operator SELECT + operator INSERT).
    expect(policies.length).toBe(2);
  });

  for (const [name, blob] of [
    ["Leads page", PAGE],
    ["LeadDetailDrawer", DRAWER],
    ["leadDetailViewModel", VIEW_MODEL],
  ] as const) {
    it(`${name} has no forbidden strings`, () => {
      expect(blob).not.toMatch(/service_role/);
      expect(blob).not.toMatch(/external[-_ ]control/i);
      expect(blob).not.toMatch(/device[-_ ]command/i);
      expect(blob).not.toMatch(/\bwebhook\b/i);
      expect(blob).not.toMatch(/\bSMS\b/);
      expect(blob).not.toMatch(/send[-_ ]?email/i);
      expect(blob).not.toMatch(/\bexport\b/i);
      expect(blob).not.toMatch(/mailgun|sendgrid|twilio|resend\.com/i);
    });
  }
});
