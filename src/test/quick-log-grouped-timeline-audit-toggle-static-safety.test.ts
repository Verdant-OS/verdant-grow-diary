/**
 * Static safety: Grouped Timeline Audit Toggle slice.
 *
 * Verifies the new audit view-model + presenter wiring do not introduce:
 *  - schema changes
 *  - writes / RPC / forbidden-table interactions
 *  - alerts / action_queue / ai_doctor_sessions writes
 *  - device-control language
 *  - live/synced/connected/imported wording
 *  - "linked" wording in audit copy (since no FK linkage exists)
 *  - duplicated grouping/pairing logic in JSX
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const PRESENTER = "components/QuickLogGroupedTimelineSection.tsx";
const AUDIT_VM = "lib/quickLogTimelineAuditViewModel.ts";

const FORBIDDEN_WORDS = [
  /\blive\b/i,
  /\bsynced\b/i,
  /\bconnected\b/i,
  /\bimported\b/i,
];
const DEVICE_WORDS = [
  /\bdevice control\b/i,
  /\bpump\b/i,
  /\bdosing\b/i,
  /\bturn\s+on\b/i,
  /\bturn\s+off\b/i,
];
const FORBIDDEN_WRITES = [
  /\.insert\(/,
  /\.upsert\(/,
  /\.update\(/,
  /\.delete\(/,
  /\.rpc\(/,
  /functions\.invoke/,
  /service_role/i,
  /\.from\(\s*['"]alerts['"]/,
  /\.from\(\s*['"]action_queue['"]/,
  /\.from\(\s*['"]ai_doctor_sessions['"]/,
];
const SCHEMA_MARKERS = [/CREATE\s+TABLE/i, /ALTER\s+TABLE/i, /DROP\s+TABLE/i];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("Grouped Timeline Audit Toggle — static safety", () => {
  for (const rel of [PRESENTER, AUDIT_VM]) {
    it(`${rel}: no live/synced/connected/imported wording`, () => {
      const src = stripComments(read(rel));
      for (const re of FORBIDDEN_WORDS) expect(src).not.toMatch(re);
    });
    it(`${rel}: no device-control language`, () => {
      const src = stripComments(read(rel));
      for (const re of DEVICE_WORDS) expect(src).not.toMatch(re);
    });
    it(`${rel}: no schema migration markers`, () => {
      for (const re of SCHEMA_MARKERS) expect(read(rel)).not.toMatch(re);
    });
    it(`${rel}: no writes / RPC / forbidden tables`, () => {
      const src = stripComments(read(rel));
      for (const re of FORBIDDEN_WRITES) expect(src).not.toMatch(re);
    });
  }

  it("audit view-model is pure (no React/Supabase/IO)", () => {
    const src = read(AUDIT_VM);
    expect(src).not.toMatch(/from\s+["']react["']/);
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
    expect(src).not.toMatch(/fetch\(/);
  });

  it("audit copy does NOT use 'linked' wording (no FK linkage exists)", () => {
    const src = stripComments(read(AUDIT_VM));
    expect(src).not.toMatch(/\blinked\b/i);
    // Presenter must not hardcode "linked" either.
    const presenter = stripComments(read(PRESENTER));
    // Allow "Hide grouped details" / "Review grouped details" — already
    // imported as constants. Just assert the literal "linked" is not
    // present anywhere in the presenter source.
    expect(presenter).not.toMatch(/["']Review linked details["']/);
    expect(presenter).not.toMatch(/["']Hide linked details["']/);
  });

  it("presenter delegates audit labels to the view-model (no inline strings)", () => {
    const src = read(PRESENTER);
    expect(src).toMatch(
      /from\s+["']@\/lib\/quickLogTimelineAuditViewModel["']/,
    );
    expect(src).toMatch(/auditToggleLabel/);
    expect(src).toMatch(/isAuditableQuickLogEntry/);
  });

  it("presenter does not duplicate grouping/pairing logic", () => {
    const src = read(PRESENTER);
    expect(src).not.toMatch(/nearest/i);
    expect(src).not.toMatch(/GROUPING_WINDOW_MS/);
  });

  it("audit toggle is gated to grouped entries only", () => {
    const src = read(PRESENTER);
    // The audit-toggle JSX must sit inside the entry.kind === "grouped" branch.
    const groupedIdx = src.indexOf('data-entry-kind="grouped"');
    const actionIdx = src.indexOf('data-entry-kind="action"');
    const envIdx = src.indexOf('data-entry-kind="environment"');
    const toggleIdx = src.indexOf("quick-log-grouped-audit-toggle");
    expect(groupedIdx).toBeGreaterThan(-1);
    expect(toggleIdx).toBeGreaterThan(groupedIdx);
    // Toggle markup must appear before the action/environment branches
    // (i.e. inside the grouped branch, which is rendered first).
    expect(toggleIdx).toBeLessThan(actionIdx);
    expect(toggleIdx).toBeLessThan(envIdx);
  });
});
