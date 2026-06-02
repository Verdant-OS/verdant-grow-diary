/**
 * Static safety: QuickLog grouped timeline UX polish.
 *
 * Verifies:
 *  - The live hook never produces demo/sample entries (so real grouped
 *    timeline cards can never be mislabeled as demo).
 *  - Production call sites in PlantDetail / TentDetail never pass
 *    `demoEntries` to the section.
 *  - The presenter and filter view-model never use
 *    live/synced/connected/imported wording or device-control language.
 *  - No new writes, RPC calls, alerts/action_queue/ai_doctor_sessions
 *    interactions, schema changes, or service_role references.
 *  - Filter rules live OUTSIDE the presenter JSX (in the view-model).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const PRESENTER = "components/QuickLogGroupedTimelineSection.tsx";
const FILTER_VM = "lib/quickLogGroupedTimelineFilterViewModel.ts";
const HOOK = "hooks/useQuickLogGroupedTimeline.ts";
const PLANT_DETAIL = "pages/PlantDetail.tsx";
const TENT_DETAIL = "pages/TentDetail.tsx";

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

describe("QuickLog grouped timeline UX polish — static safety", () => {
  for (const rel of [PRESENTER, FILTER_VM]) {
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

  it("filter view-model is pure (no React/Supabase/IO imports)", () => {
    const src = read(FILTER_VM);
    expect(src).not.toMatch(/from\s+["']react["']/);
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
    expect(src).not.toMatch(/fetch\(/);
  });

  it("filter rules live OUTSIDE JSX — presenter imports from the view-model", () => {
    const src = read(PRESENTER);
    expect(src).toMatch(
      /from\s+["']@\/lib\/quickLogGroupedTimelineFilterViewModel["']/,
    );
    expect(src).toMatch(/filterQuickLogGroupedTimelineEntries/);
    // No hand-rolled filter switch in the presenter.
    expect(src).not.toMatch(/case\s+["']water["']\s*:/);
  });

  it("hook never produces demo/sample entries (real cards cannot be mislabeled)", () => {
    const src = stripComments(read(HOOK));
    expect(src).not.toMatch(/demoVariant/);
    expect(src).not.toMatch(/isDemo/i);
    expect(src).not.toMatch(/['"]demo['"]/i);
    expect(src).not.toMatch(/['"]sample['"]/i);
  });

  it("PlantDetail does not pass demo entries to the section", () => {
    const src = read(PLANT_DETAIL);
    expect(src).toMatch(/QuickLogGroupedTimelineSection/);
    expect(src).not.toMatch(/demoEntries/);
  });

  it("TentDetail does not pass demo entries to the section", () => {
    const src = read(TENT_DETAIL);
    expect(src).toMatch(/QuickLogGroupedTimelineSection/);
    expect(src).not.toMatch(/demoEntries/);
  });

  it("required UX copy strings are exported from the view-model", () => {
    const src = read(FILTER_VM);
    expect(src).toMatch(/No QuickLog entries yet\./);
    expect(src).toMatch(/No QuickLog entries match this filter\./);
    expect(src).toMatch(/Create Quick Log/);
    expect(src).toMatch(/Demo data/);
    expect(src).toMatch(/Sample timeline entry/);
    expect(src).toMatch(/QUICK_LOG_MANUAL_SOURCE_LABEL\s*=\s*["']Manual["']/);
  });
});
