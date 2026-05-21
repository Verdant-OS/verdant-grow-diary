/**
 * Tests for the operator-only Leads Inbox.
 *
 * Verifies:
 *  - /leads route is registered inside AppShell.
 *  - Leads page queries only the leads table and orders newest-first.
 *  - Leads page does not query private grow/plant/tent/alert/action tables.
 *  - UI exposes lead_type and source filters and an unauthorized state.
 *  - Public Landing still only inserts leads (no select).
 *  - No public SELECT/UPDATE/DELETE policy added for leads.
 *  - No service_role or external-control strings introduced.
 *  - security-checklist doc references the public-leads RLS pattern.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..", "..");
const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const APP = readSrc("App.tsx");
const PAGE = readSrc("pages/Leads.tsx");
const HOOK = readSrc("hooks/useLeadsList.ts");
const FORM = readSrc("components/LeadCaptureForm.tsx");
const LANDING = readSrc("pages/Landing.tsx");
const SECURITY_DOC = read("docs/security-checklist.md");

const MIGRATIONS_DIR = resolve(root, "supabase/migrations");
const migrationContents = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"))
  .join("\n\n");

const PRIVATE_TABLES = [
  "grows",
  "plants",
  "tents",
  "sensor_readings",
  "alerts",
  "alert_events",
  "action_queue",
  "action_queue_events",
  "diary_entries",
  "grow_events",
  "harvests",
];

describe("/leads route", () => {
  it("registers /leads inside AppShell", () => {
    expect(APP).toMatch(/import\s+Leads\s+from\s+"\.\/pages\/Leads"/);
    expect(APP).toMatch(/path="\/leads"\s+element=\{<Leads\s*\/>\}/);
  });
});

describe("Leads page", () => {
  it("queries only the leads table", () => {
    const fromCalls = (PAGE + HOOK).match(/\.from\(["']([^"']+)["']\)/g) ?? [];
    expect(fromCalls.length).toBeGreaterThan(0);
    for (const c of fromCalls) {
      expect(c).toMatch(/\.from\(["']leads["']\)/);
    }
  });

  it("does not query private tables", () => {
    for (const t of PRIVATE_TABLES) {
      expect(PAGE + HOOK).not.toMatch(new RegExp(`\\.from\\(["']${t}["']`));
    }
  });

  it("orders by created_at descending", () => {
    expect(HOOK).toMatch(/\.order\(\s*["']created_at["']\s*,\s*\{\s*ascending:\s*false/);
  });

  it("exposes lead_type and source filters", () => {
    expect(PAGE).toMatch(/leadType/);
    expect(PAGE).toMatch(/setLeadType/);
    expect(PAGE).toMatch(/source/);
    expect(PAGE).toMatch(/setSource/);
  });

  it("renders an unauthorized state for non-operators", () => {
    expect(PAGE).toMatch(/Unauthorized/);
    expect(PAGE).toMatch(/!authorized/);
  });

  it("does not perform deletes on leads (updates are operator-only and allowed)", () => {
    expect(PAGE + HOOK).not.toMatch(/\.delete\(/);
  });

  it("does not introduce service_role or external-control strings", () => {
    for (const blob of [PAGE, HOOK]) {
      expect(blob).not.toMatch(/service_role/);
      expect(blob).not.toMatch(/external[-_ ]control/i);
      expect(blob).not.toMatch(/device[-_ ]command/i);
      expect(blob).not.toMatch(/functions\.invoke\(["']ai-coach/);
    }
  });
});

describe("public Landing + form still safe", () => {
  it("LeadCaptureForm still only inserts to leads (no select on leads)", () => {
    expect(FORM).toMatch(/\.from\(["']leads["']\)[\s\S]*\.insert\(/);
    expect(FORM).not.toMatch(/\.from\(["']leads["']\)[\s\S]{0,80}\.select\(/);
  });

  it("Landing page does not query leads or any private table", () => {
    expect(LANDING).not.toMatch(/\.from\(["']leads["']\)/);
    for (const t of PRIVATE_TABLES) {
      expect(LANDING).not.toMatch(new RegExp(`\\.from\\(["']${t}["']`));
    }
  });
});

describe("leads migration policies stay locked", () => {
  it("contains no FOR DELETE policy on leads, and UPDATE is operator-gated", () => {
    const leadsPolicies =
      migrationContents.match(/CREATE POLICY[^;]*ON\s+public\.leads[^;]*;/gi) ?? [];
    for (const p of leadsPolicies) {
      expect(p).not.toMatch(/FOR\s+DELETE/i);
      if (/FOR\s+UPDATE/i.test(p)) {
        expect(p).toMatch(/has_role/);
        expect(p).not.toMatch(/TO\s+anon/i);
      }
    }
  });

  it("only operator may SELECT leads (no anon/public SELECT policy)", () => {
    const leadsPolicies =
      migrationContents.match(/CREATE POLICY[^;]*ON\s+public\.leads[^;]*;/gi) ?? [];
    for (const p of leadsPolicies) {
      if (/FOR\s+SELECT/i.test(p)) {
        expect(p).toMatch(/has_role/);
        expect(p).not.toMatch(/TO\s+anon/i);
      }
    }
  });
});

describe("security checklist documents the public-leads pattern", () => {
  it("references public.leads INSERT-only / operator SELECT pattern", () => {
    expect(SECURITY_DOC).toMatch(/public\.leads/);
    expect(SECURITY_DOC).toMatch(/operator/i);
    expect(SECURITY_DOC).toMatch(/INSERT/);
  });
});
