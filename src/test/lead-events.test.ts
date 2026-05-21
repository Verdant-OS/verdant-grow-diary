/**
 * Tests for lead activity history (lead_events table + UI).
 *
 * Verifies:
 *  - Migration creates public.lead_events with required columns.
 *  - RLS: operator SELECT + operator INSERT only; no UPDATE / DELETE policies.
 *  - A status-change trigger on leads records old_status and new_status.
 *  - The useLeadsList.updateLead allow-list excludes original submission fields.
 *  - The /leads UI mounts a LeadActivity panel per row.
 *  - No service_role / external-control strings introduced.
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

const PAGE = readSrc("pages/Leads.tsx");
const HOOK = readSrc("hooks/useLeadsList.ts");
const EVENTS_HOOK = readSrc("hooks/useLeadEvents.ts");

const leadEventsPolicies = (
  migrationContents.match(/CREATE POLICY[^;]*ON\s+public\.lead_events[^;]*;/gi) ?? []
);

describe("lead_events migration", () => {
  it("creates the public.lead_events table", () => {
    expect(migrationContents).toMatch(/CREATE TABLE[\s\S]*?public\.lead_events/i);
  });

  it("includes id / lead_id / actor_user_id / event_type / old_status / new_status / note / created_at", () => {
    const block =
      migrationContents.match(/CREATE TABLE[\s\S]*?public\.lead_events[\s\S]*?\);/i)?.[0] ?? "";
    for (const col of [
      "id",
      "lead_id",
      "actor_user_id",
      "event_type",
      "old_status",
      "new_status",
      "note",
      "created_at",
    ]) {
      expect(block).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("references public.leads(id) with ON DELETE RESTRICT", () => {
    expect(migrationContents).toMatch(
      /lead_id[\s\S]*?REFERENCES\s+public\.leads\s*\(\s*id\s*\)[\s\S]*?ON DELETE RESTRICT/i,
    );
  });

  it("defaults actor_user_id to auth.uid()", () => {
    expect(migrationContents).toMatch(/actor_user_id[\s\S]*?DEFAULT\s+auth\.uid\(\)/i);
  });

  it("enables row level security on lead_events", () => {
    expect(migrationContents).toMatch(
      /ALTER TABLE\s+public\.lead_events\s+ENABLE ROW LEVEL SECURITY/i,
    );
  });
});

describe("lead_events RLS", () => {
  it("operator-only SELECT policy exists", () => {
    const selects = leadEventsPolicies.filter((p) => /FOR\s+SELECT/i.test(p));
    expect(selects.length).toBeGreaterThan(0);
    for (const p of selects) {
      expect(p).toMatch(/has_role[\s\S]*?'operator'/i);
      expect(p).not.toMatch(/TO\s+anon/i);
    }
  });

  it("operator-only INSERT policy exists", () => {
    const inserts = leadEventsPolicies.filter((p) => /FOR\s+INSERT/i.test(p));
    expect(inserts.length).toBeGreaterThan(0);
    for (const p of inserts) {
      expect(p).toMatch(/has_role[\s\S]*?'operator'/i);
      expect(p).not.toMatch(/TO\s+anon/i);
    }
  });

  it("no UPDATE policy exists for lead_events", () => {
    for (const p of leadEventsPolicies) {
      expect(p).not.toMatch(/FOR\s+UPDATE/i);
    }
  });

  it("no DELETE policy exists for lead_events", () => {
    for (const p of leadEventsPolicies) {
      expect(p).not.toMatch(/FOR\s+DELETE/i);
    }
  });

  it("anon role is not granted on lead_events policies", () => {
    for (const p of leadEventsPolicies) {
      expect(p).not.toMatch(/\banon\b/);
    }
  });
});

describe("status-change trigger captures old_status and new_status", () => {
  it("defines log_lead_status_change function", () => {
    expect(migrationContents).toMatch(/FUNCTION\s+public\.log_lead_status_change\s*\(/i);
  });

  it("inserts into lead_events with OLD.status and NEW.status on change", () => {
    const fn =
      migrationContents.match(
        /FUNCTION\s+public\.log_lead_status_change[\s\S]*?\$\$;/i,
      )?.[0] ?? "";
    expect(fn).toMatch(/INSERT\s+INTO\s+public\.lead_events/i);
    expect(fn).toMatch(/OLD\.status/);
    expect(fn).toMatch(/NEW\.status/);
    expect(fn).toMatch(/'status_change'/);
    expect(fn).toMatch(/IS DISTINCT FROM/i);
  });

  it("attaches an AFTER UPDATE trigger on leads", () => {
    expect(migrationContents).toMatch(
      /CREATE TRIGGER\s+leads_log_status_change[\s\S]*?AFTER UPDATE[\s\S]*?ON\s+public\.leads/i,
    );
  });

  it("is hardened: latest definition is SECURITY DEFINER with locked search_path and fully qualified table refs", () => {
    // Use the LAST occurrence so later migrations supersede earlier ones.
    const matches = [
      ...migrationContents.matchAll(
        /FUNCTION\s+public\.log_lead_status_change[\s\S]*?\$\$;/gi,
      ),
    ];
    expect(matches.length).toBeGreaterThan(0);
    const fn = matches[matches.length - 1][0];
    expect(fn).toMatch(/SECURITY DEFINER/i);
    expect(fn).toMatch(/SET\s+search_path\s*=\s*public\s*,\s*auth/i);
    // Disallow bare (unqualified) writes to lead_events / leads in the body.
    expect(fn).not.toMatch(/INSERT\s+INTO\s+lead_events\b/i);
    expect(fn).toMatch(/INSERT\s+INTO\s+public\.lead_events\b/i);
  });

  it("revokes EXECUTE on log_lead_status_change from PUBLIC/anon/authenticated", () => {
    expect(migrationContents).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.log_lead_status_change\(\)\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i,
    );
  });
});

describe("updateLead enforces immutable submission fields", () => {
  it("only sends an allow-list of editable fields to leads.update", () => {
    expect(HOOK).toMatch(/Allow-list/);
    expect(HOOK).toMatch(/"status"/);
    expect(HOOK).toMatch(/"operator_notes"/);
    expect(HOOK).toMatch(/"contacted_at"/);
    expect(HOOK).toMatch(/"follow_up_at"/);
    // Submission fields must not appear in the allow-list literal.
    const allowBlock =
      HOOK.match(/const ALLOWED\s*=\s*\[[\s\S]*?\]\s+as const;/)?.[0] ?? "";
    for (const forbidden of [
      "email",
      "name",
      "company",
      "role",
      "lead_type",
      "source",
      "message",
    ]) {
      expect(allowBlock).not.toMatch(new RegExp(`"${forbidden}"`));
    }
  });
});

describe("/leads UI shows activity history", () => {
  it("mounts a LeadActivity panel per row", () => {
    expect(PAGE).toMatch(/LeadActivity/);
    expect(PAGE).toMatch(/data-testid="lead-activity"/);
  });

  it("reads lead_events only via useLeadEvents", () => {
    const fromCalls = EVENTS_HOOK.match(/\.from\(["']([^"']+)["']\)/g) ?? [];
    expect(fromCalls.length).toBeGreaterThan(0);
    for (const c of fromCalls) {
      expect(c).toMatch(/\.from\(["']lead_events["']\)/);
    }
    // Page doesn't query lead_events directly; it uses the hook.
    expect(PAGE).not.toMatch(/\.from\(["']lead_events["']\)/);
  });

  it("does not perform UPDATE/DELETE on lead_events from the client", () => {
    for (const blob of [PAGE, HOOK, EVENTS_HOOK]) {
      expect(blob).not.toMatch(/from\(["']lead_events["']\)[\s\S]{0,80}\.update\(/);
      expect(blob).not.toMatch(/from\(["']lead_events["']\)[\s\S]{0,80}\.delete\(/);
    }
  });

  it("does not introduce service_role or external-control strings", () => {
    for (const blob of [PAGE, HOOK, EVENTS_HOOK]) {
      expect(blob).not.toMatch(/service_role/);
      expect(blob).not.toMatch(/external[-_ ]control/i);
      expect(blob).not.toMatch(/device[-_ ]command/i);
    }
  });
});
