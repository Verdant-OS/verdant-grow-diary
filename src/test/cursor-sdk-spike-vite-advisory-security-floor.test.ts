/**
 * GHSA-698v-4r3x-3vcv: vite <7.3.7 on the 7.x line left vitest's transitive
 * vite vulnerable in the Cursor SDK spike. The nested override and bun.lock
 * must stay at the first fixed release so `bun install --frozen-lockfile` under
 * spikes/cursor-sdk-local-orchestration cannot regress during advisory work.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SPIKE_DIR = join(ROOT, "spikes", "cursor-sdk-local-orchestration");
const FIXED_VITE = "7.3.7";
const MIN_VITE = [7, 3, 7] as const;

type SemverTriple = readonly [number, number, number];

function parseVersion(value: string): SemverTriple {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Expected semver in "${value}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isAtLeast(actual: SemverTriple, minimum: SemverTriple): boolean {
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== minimum[index]) return actual[index] > minimum[index];
  }
  return true;
}

describe("Cursor SDK spike vite advisory floor (GHSA-698v-4r3x-3vcv)", () => {
  it("pins the fixed vite release in package.json overrides", () => {
    const manifest = JSON.parse(readFileSync(join(SPIKE_DIR, "package.json"), "utf8")) as {
      overrides?: Record<string, string>;
    };
    expect(manifest.overrides?.vite).toBe(FIXED_VITE);
  });

  it("keeps bun.lock overrides and every resolved vite copy at or above 7.3.7", () => {
    const lockText = readFileSync(join(SPIKE_DIR, "bun.lock"), "utf8");
    const overrideMatch = lockText.match(/"overrides"\s*:\s*\{[^}]*"vite"\s*:\s*"([^"]+)"/);
    expect(overrideMatch?.[1]).toBe(FIXED_VITE);

    const resolved = [...lockText.matchAll(/\["vite@(\d+\.\d+\.\d+)/g)].map((match) => match[1]);
    expect(resolved.length).toBeGreaterThan(0);
    for (const version of resolved) {
      expect(isAtLeast(parseVersion(version), MIN_VITE), version).toBe(true);
    }
  });
});
