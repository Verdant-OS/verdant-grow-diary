/**
 * Static safety: Grouped Timeline In-Place Review Panel slice.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const PRESENTER = "components/QuickLogGroupedTimelineSection.tsx";
const REVIEW_VM = "lib/quickLogGroupedReviewViewModel.ts";

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

function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("Grouped Timeline Review Panel — static safety", () => {
  for (const rel of [PRESENTER, REVIEW_VM]) {
    it(`${rel}: no live/synced/connected/imported wording`, () => {
      const src = strip(read(rel));
      for (const re of FORBIDDEN_WORDS) expect(src).not.toMatch(re);
    });
    it(`${rel}: no device-control language`, () => {
      const src = strip(read(rel));
      for (const re of DEVICE_WORDS) expect(src).not.toMatch(re);
    });
    it(`${rel}: no schema markers`, () => {
      for (const re of SCHEMA_MARKERS) expect(read(rel)).not.toMatch(re);
    });
    it(`${rel}: no writes / RPC / forbidden tables`, () => {
      const src = strip(read(rel));
      for (const re of FORBIDDEN_WRITES) expect(src).not.toMatch(re);
    });
  }

  it("review view-model is pure (no React/Supabase/IO)", () => {
    const src = read(REVIEW_VM);
    expect(src).not.toMatch(/from\s+["']react["']/);
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
    expect(src).not.toMatch(/fetch\(/);
  });

  it("review copy does NOT use 'linked' wording (no FK linkage exists)", () => {
    const src = strip(read(REVIEW_VM));
    expect(src).not.toMatch(/\blinked\b/i);
    const presenter = strip(read(PRESENTER));
    expect(presenter).not.toMatch(/linked record/i);
    expect(presenter).not.toMatch(/["']linked details["']/i);
  });

  it("presenter imports labels/builders from the review view-model", () => {
    const src = read(PRESENTER);
    expect(src).toMatch(
      /from\s+["']@\/lib\/quickLogGroupedReviewViewModel["']/,
    );
    expect(src).toMatch(/reviewTriggerLabel/);
    expect(src).toMatch(/isReviewableQuickLogEntry/);
    expect(src).toMatch(/buildQuickLogReviewActionSection/);
  });

  it("presenter does not introduce a new route or hash navigation API", () => {
    const src = read(PRESENTER);
    // No React Router imports.
    expect(src).not.toMatch(/react-router/);
    // No window.location/history mutation.
    expect(src).not.toMatch(/window\.location\s*=/);
    expect(src).not.toMatch(/window\.history\./);
    expect(src).not.toMatch(/location\.hash\s*=/);
  });

  it("review trigger only renders inside the grouped branch", () => {
    const src = read(PRESENTER);
    const groupedIdx = src.indexOf('data-entry-kind="grouped"');
    const actionIdx = src.indexOf('data-entry-kind="action"');
    const envIdx = src.indexOf('data-entry-kind="environment"');
    const triggerIdx = src.indexOf("quick-log-grouped-review-trigger");
    expect(groupedIdx).toBeGreaterThan(-1);
    expect(triggerIdx).toBeGreaterThan(groupedIdx);
    expect(triggerIdx).toBeLessThan(actionIdx);
    expect(triggerIdx).toBeLessThan(envIdx);
  });
});
