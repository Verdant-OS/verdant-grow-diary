import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const FORBIDDEN_WORDS = [
  /\blive\b/i,
  /\bsynced\b/i,
  /\bconnected\b/i,
  /\bimported\b/i,
];
const FORBIDDEN_WRITES = [
  /from\s+supabase/i,
  /\.from\(\s*['"]alerts['"]/,
  /\.from\(\s*['"]action_queue['"]/,
  /\.from\(\s*['"]ai_doctor_sessions['"]/,
  /\.rpc\(/,
  /service_role/i,
  /\buseEffect\b/,
  /\buseState\b/,
];
const DEVICE_WORDS = [
  /\bdevice control\b/i,
  /\bpump\b/i,
  /\bdosing\b/i,
  /\bturn\s+on\b/i,
  /\bturn\s+off\b/i,
];

const SOURCES = [
  "lib/quickLogTimelineGroupingViewModel.ts",
  "constants/quickLogTimelineGrouping.ts",
];

describe("quickLogTimelineGrouping — static safety", () => {
  for (const rel of SOURCES) {
    it(`${rel}: no live/synced/connected/imported wording`, () => {
      const src = read(rel);
      for (const re of FORBIDDEN_WORDS) {
        // allow inside block comments documenting the constraint
        const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "");
        expect(stripped).not.toMatch(re);
      }
    });

    it(`${rel}: no Supabase / RPC / write paths`, () => {
      const src = read(rel);
      for (const re of FORBIDDEN_WRITES) {
        expect(src).not.toMatch(re);
      }
    });

    it(`${rel}: no device-control language`, () => {
      const src = read(rel);
      const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "");
      for (const re of DEVICE_WORDS) {
        expect(stripped).not.toMatch(re);
      }
    });

    it(`${rel}: no schema migration markers`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/CREATE\s+TABLE/i);
      expect(src).not.toMatch(/ALTER\s+TABLE/i);
      expect(src).not.toMatch(/DROP\s+TABLE/i);
    });
  }
});

describe("PlantDetail AI Doctor readiness call sites pass plant.tentId", () => {
  it("PlantDetail.tsx passes plant.tentId where readiness/scope is forwarded", () => {
    const src = readFileSync(join(process.cwd(), "src/pages/PlantDetail.tsx"), "utf8");
    // Heuristic audit: any tentId={...} prop forwarded from PlantDetail must
    // resolve from plant.tentId (never an inferred/default tent). If this
    // breaks, fix the call site, do not infer from active/first-loaded tent.
    const tentIdAssignments = src.match(/tentId[=:]\s*[^,\n}]+/g) ?? [];
    const offenders = tentIdAssignments.filter(
      (line) => !/plant\.tentId|plant\?\.tentId/.test(line),
    );
    expect(offenders, `offending tentId assignments:\n${offenders.join("\n")}`).toEqual([]);
  });
});
