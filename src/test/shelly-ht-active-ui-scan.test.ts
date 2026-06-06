/**
 * Active-UI / active-source scan for retired Shelly H&T exposure.
 *
 * Walks all non-test source under `src/` (excluding the dedicated
 * retirement guard file `supabaseFunctionConfigGuard.ts`) and asserts
 * that no active UI, hook, label map, nav entry, or component
 * references a retired Shelly H&T surface.
 *
 * Allowed mentions:
 *  - retirement doc:          docs/retired-sensor-integrations.md
 *  - migration checklist:     docs/sensor-integration-migration-checklist.md
 *  - retired/negative tests:  src/test/shelly-*.test.ts(x)
 *  - the scoped guard helper: src/lib/supabaseFunctionConfigGuard.ts
 *  - changelog / release notes (none required)
 *
 * Pure / static. No I/O beyond reading source files.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const SRC = resolve(ROOT, "src");

const ALLOWED_FILES = new Set<string>([
  // The scoped guard predicate intentionally names the retired prefix.
  "src/lib/supabaseFunctionConfigGuard.ts",
]);

function isAllowed(rel: string): boolean {
  if (ALLOWED_FILES.has(rel)) return true;
  // All Shelly-named tests live under src/test/ and are allowed to
  // mention the retired surface for negative coverage.
  if (rel.startsWith("src/test/")) return true;
  return false;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FORBIDDEN_TOKENS: RegExp[] = [
  /\bShelly\s*HT\b/i,
  /\bShelly\s*H&T(?:\s*Gen4)?\b/i,
  /\bshelly-ht-status\b/i,
  /\bshelly-ht-webhook\b/i,
  /\bShellyHtSetupCard\b/,
  /\buseShellyHtSetupStatus\b/,
];

describe("Shelly H&T is absent from active UI / source", () => {
  const files = walk(SRC).map((f) => ({
    abs: f,
    rel: relative(ROOT, f).replace(/\\/g, "/"),
  }));

  it("at least one src file was scanned (sanity)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no active UI / hook / label-map source mentions retired Shelly H&T surfaces", () => {
    const hits: { file: string; token: string; line: string }[] = [];
    for (const f of files) {
      if (isAllowed(f.rel)) continue;
      const body = readFileSync(f.abs, "utf8");
      const lines = body.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        for (const re of FORBIDDEN_TOKENS) {
          if (re.test(lines[i])) {
            hits.push({
              file: f.rel,
              token: re.source,
              line: lines[i].trim(),
            });
          }
        }
      }
    }
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });

  it("retirement and migration docs exist and name Shelly H&T as retired", () => {
    const retired = resolve(ROOT, "docs/retired-sensor-integrations.md");
    const checklist = resolve(ROOT, "docs/sensor-integration-migration-checklist.md");
    expect(existsSync(retired)).toBe(true);
    expect(existsSync(checklist)).toBe(true);
    const body = readFileSync(retired, "utf8");
    expect(body).toMatch(/Shelly\s*H&T/i);
    expect(body.toLowerCase()).toContain("retired");
    expect(body).toContain("check:shelly-ht-edge-sources");
  });
});
