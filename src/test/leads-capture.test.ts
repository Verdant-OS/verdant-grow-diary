/**
 * Tests for the public lead capture feature.
 *
 * Verifies:
 *  - A migration exists creating the public.leads table with required columns,
 *    constraints, and RLS policies (insert-only for public, no public select).
 *  - The Landing page renders the LeadCaptureForm.
 *  - The form writes only to the leads table and never queries private tables.
 *  - No service_role, external-control, or fake-live-metrics strings introduced.
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

const FORM = readSrc("components/LeadCaptureForm.tsx");
const LANDING = readSrc("pages/Landing.tsx");

describe("leads migration", () => {
  it("creates the public.leads table", () => {
    expect(migrationContents).toMatch(/CREATE TABLE\s+public\.leads/i);
  });

  it("requires email and defaults lead_type to beta_user", () => {
    expect(migrationContents).toMatch(/email\s+text\s+NOT NULL/i);
    expect(migrationContents).toMatch(/lead_type\s+text\s+NOT NULL\s+DEFAULT\s+'beta_user'/i);
  });

  it("constrains lead_type to allowed values", () => {
    expect(migrationContents).toMatch(/beta_user/);
    expect(migrationContents).toMatch(/hardware_partner/);
    expect(migrationContents).toMatch(/grower/);
    expect(migrationContents).toMatch(/investor/);
    expect(migrationContents).toMatch(/other/);
  });

  it("enables row level security on leads", () => {
    expect(migrationContents).toMatch(
      /ALTER TABLE\s+public\.leads\s+ENABLE ROW LEVEL SECURITY/i,
    );
  });

  it("allows public/anon to INSERT leads", () => {
    expect(migrationContents).toMatch(
      /CREATE POLICY[\s\S]*?ON\s+public\.leads[\s\S]*?FOR INSERT[\s\S]*?anon/i,
    );
  });

  it("does not expose a public SELECT/UPDATE/DELETE policy on leads", () => {
    // Only an operator SELECT policy is allowed.
    const leadsPolicyBlocks = migrationContents.match(
      /CREATE POLICY[^;]*ON\s+public\.leads[^;]*;/gi,
    ) ?? [];
    for (const p of leadsPolicyBlocks) {
      if (/FOR\s+(UPDATE|DELETE)/i.test(p)) {
        throw new Error("Unexpected UPDATE/DELETE policy on leads: " + p);
      }
      if (/FOR\s+SELECT/i.test(p)) {
        expect(p).toMatch(/has_role/);
      }
    }
  });

  it("does not include private grow-data columns", () => {
    const createBlock =
      migrationContents.match(/CREATE TABLE\s+public\.leads[\s\S]*?\);/i)?.[0] ?? "";
    for (const col of [
      "grow_id",
      "plant_id",
      "tent_id",
      "sensor",
      "vpd",
      "humidity",
      "temperature",
    ]) {
      expect(createBlock.toLowerCase()).not.toContain(col);
    }
  });
});

describe("LeadCaptureForm", () => {
  it("writes only to the leads table", () => {
    const fromCalls = FORM.match(/\.from\(["']([^"']+)["']\)/g) ?? [];
    expect(fromCalls.length).toBeGreaterThan(0);
    for (const c of fromCalls) {
      expect(c).toMatch(/\.from\(["']leads["']\)/);
    }
  });

  it("does not query private tables", () => {
    for (const t of [
      "grows",
      "plants",
      "tents",
      "sensor_readings",
      "alerts",
      "alert_events",
      "action_queue",
      "action_queue_events",
      "diary_entries",
    ]) {
      expect(FORM).not.toMatch(new RegExp(`\\.from\\(["']${t}["']`));
    }
  });

  it("does not collect a phone number or enroll in SMS", () => {
    // No phone input field and no SMS enrollment code path.
    expect(FORM).not.toMatch(/type=["']tel["']/);
    expect(FORM).not.toMatch(/autoComplete=["']tel["']/);
    expect(FORM).not.toMatch(/setPhone|phoneNumber/);
    expect(FORM).not.toMatch(/sms_opt_in|smsOptIn/i);
  });


  it("does not use service_role or external-control strings", () => {
    expect(FORM).not.toMatch(/service_role/);
    expect(FORM).not.toMatch(/external[-_ ]control/i);
    expect(FORM).not.toMatch(/device[-_ ]command/i);
    expect(FORM).not.toMatch(/functions\.invoke\(["']ai-coach/);
  });

  it("does not display fake live metrics", () => {
    // No "42%", "75°C", etc.
    expect(FORM).not.toMatch(/>\s*\d+\s*%/);
    expect(FORM).not.toMatch(/\d+\s*°[CF]/);
  });
});

describe("Landing page lead capture integration", () => {
  it("renders the LeadCaptureForm", () => {
    expect(LANDING).toMatch(/LeadCaptureForm/);
    expect(LANDING).toMatch(/Join the Verdant beta/);
    expect(LANDING).toMatch(/Hardware partner/);
  });

  it("includes the required safety copy", () => {
    expect(LANDING).toMatch(/early build/i);
    expect(LANDING).toMatch(/read-only hardware integrations/i);
    expect(LANDING).toMatch(/No blind automation/);
  });
});
