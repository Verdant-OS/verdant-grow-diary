/**
 * Tests for the operator lead follow-up workflow.
 *
 * Verifies:
 *  - Migration adds status/operator_notes/contacted_at/follow_up_at/updated_at
 *    columns and the status CHECK constraint.
 *  - No phone/SMS columns were added.
 *  - Public INSERT remains allowed; public SELECT/UPDATE remain blocked.
 *  - Operator SELECT and operator UPDATE policies exist.
 *  - No DELETE policy on leads.
 *  - /leads UI exposes status filter and quick actions.
 *  - Leads page only writes to the leads table.
 *  - Landing form still inserts only.
 *  - Hardware integrations page still defaults to hardware_partner.
 *  - No service_role / external-control strings added.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..", "..");
const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

const MIGRATIONS_DIR = resolve(root, "supabase/migrations");
const migrationContents = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"))
  .join("\n\n");

import { readLeadDetailDrawerBundle } from "./_leadDrawerBundle";
const PAGE = readSrc("pages/Leads.tsx") + "\n" + readLeadDetailDrawerBundle();
const HOOK = readSrc("hooks/useLeadsList.ts");
const FORM = readSrc("components/LeadCaptureForm.tsx");
const LANDING = readSrc("pages/Landing.tsx");
const HARDWARE = readSrc("pages/HardwareIntegrations.tsx");

describe("leads follow-up migration", () => {
  it("adds status column with default 'new'", () => {
    expect(migrationContents).toMatch(/ADD COLUMN[\s\S]*?status\s+text\s+NOT NULL\s+DEFAULT\s+'new'/i);
  });

  it("adds operator_notes / contacted_at / follow_up_at / updated_at columns", () => {
    expect(migrationContents).toMatch(/operator_notes\s+text/i);
    expect(migrationContents).toMatch(/contacted_at\s+timestamptz/i);
    expect(migrationContents).toMatch(/follow_up_at\s+timestamptz/i);
    expect(migrationContents).toMatch(/updated_at\s+timestamptz\s+NOT NULL\s+DEFAULT\s+now\(\)/i);
  });

  it("constrains status to the allowed values", () => {
    expect(migrationContents).toMatch(/leads_status_check/);
    for (const v of ["new", "reviewed", "contacted", "follow_up", "closed", "spam"]) {
      expect(migrationContents).toMatch(new RegExp(`'${v}'`));
    }
  });

  it("constrains contacted_at and follow_up_at to compatible statuses", () => {
    expect(migrationContents).toMatch(/leads_contacted_at_check/);
    expect(migrationContents).toMatch(/leads_follow_up_at_check/);
  });

  it("attaches an updated_at trigger to leads", () => {
    expect(migrationContents).toMatch(/leads_set_updated_at[\s\S]*?ON\s+public\.leads/i);
  });

  it("does not add phone or sms columns", () => {
    expect(migrationContents).not.toMatch(/ADD COLUMN[\s\S]*?\bphone\b/i);
    expect(migrationContents).not.toMatch(/ADD COLUMN[\s\S]*?\bsms\b/i);
  });
});

describe("leads RLS after follow-up migration", () => {
  it("keeps public/anon INSERT allowed", () => {
    expect(migrationContents).toMatch(
      /CREATE POLICY[\s\S]*?ON\s+public\.leads[\s\S]*?FOR INSERT[\s\S]*?anon/i,
    );
  });

  it("adds an operator-only UPDATE policy", () => {
    const ops = migrationContents.match(/CREATE POLICY[^;]*ON\s+public\.leads[^;]*;/gi) ?? [];
    const updatePolicies = ops.filter((p) => /FOR\s+UPDATE/i.test(p));
    expect(updatePolicies.length).toBeGreaterThan(0);
    for (const p of updatePolicies) {
      expect(p).toMatch(/has_role/);
      expect(p).not.toMatch(/TO\s+anon/i);
    }
  });

  it("does not add a DELETE policy on leads", () => {
    const ops = migrationContents.match(/CREATE POLICY[^;]*ON\s+public\.leads[^;]*;/gi) ?? [];
    for (const p of ops) {
      expect(p).not.toMatch(/FOR\s+DELETE/i);
    }
  });
});

describe("/leads UI follow-up actions", () => {
  it("shows a status filter", () => {
    expect(PAGE).toMatch(/All statuses/);
    expect(PAGE).toMatch(/setStatus/);
  });

  it("exposes quick action buttons", () => {
    for (const label of ["Reviewed", "Contacted", "Follow-up", "Close", "Spam"]) {
      expect(PAGE).toContain(label);
    }
  });

  it("includes an operator notes editor and follow-up datetime input", () => {
    expect(PAGE).toMatch(/Operator notes/);
    expect(PAGE).toMatch(/datetime-local/);
  });

  it("only writes to the leads table", () => {
    const fromCalls = (PAGE + HOOK).match(/\.from\(["']([^"']+)["']\)/g) ?? [];
    expect(fromCalls.length).toBeGreaterThan(0);
    for (const c of fromCalls) {
      expect(c).toMatch(/\.from\(["']leads["']\)/);
    }
  });

  it("does not introduce service_role or external-control strings", () => {
    for (const blob of [PAGE, HOOK]) {
      expect(blob).not.toMatch(/service_role/);
      expect(blob).not.toMatch(/external[-_ ]control/i);
      expect(blob).not.toMatch(/device[-_ ]command/i);
    }
  });
});

describe("public surfaces unchanged", () => {
  it("Landing still only inserts leads", () => {
    expect(LANDING).not.toMatch(/\.from\(["']leads["']\)\s*\.update/);
    expect(LANDING).not.toMatch(/\.from\(["']leads["']\)\s*\.delete/);
    expect(FORM).toMatch(/\.from\(["']leads["']\)[\s\S]*\.insert\(/);
    expect(FORM).not.toMatch(/\.update\(/);
    expect(FORM).not.toMatch(/\.delete\(/);
  });

  it("Hardware integrations page still defaults to hardware_partner", () => {
    expect(HARDWARE).toMatch(/defaultLeadType=["']hardware_partner["']/);
  });
});
