/**
 * Static safety guards for the Pheno Hunt UX Safety v1 slice.
 *
 * Ensures the slice never adds AI, alerts, action queue writes, device
 * control, public/customer-mode language, service_role/token exposure,
 * or plant delete operations in the delete path.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = [
  "src/lib/phenoHuntService.ts",
  "src/components/PhenoHuntTimelineSection.tsx",
  "src/components/StartPhenoHuntButton.tsx",
  "src/pages/PhenoHuntNew.tsx",
];

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const sources = Object.fromEntries(
  files.map((f) => [
    f,
    stripComments(readFileSync(resolve(process.cwd(), f), "utf8")),
  ]),
) as Record<string, string>;

describe("pheno hunt slice — static safety", () => {
  it("never imports AI / alerts / action-queue modules", () => {
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).not.toMatch(/from\s+["']@\/lib\/ai/i);
      expect(src, path).not.toMatch(/from\s+["']@\/lib\/alerts/i);
      expect(src, path).not.toMatch(/from\s+["']@\/lib\/actionQueue/i);
      expect(src, path).not.toMatch(/from\s+["'][^"']*alertEngine/i);
    }
  });

  it("never touches automation / device control surfaces", () => {
    for (const [path, src] of Object.entries(sources)) {
      expect(src.toLowerCase(), path).not.toMatch(/device[_-]?control/);
      expect(src.toLowerCase(), path).not.toMatch(/automation/);
    }
  });

  it("never uses service_role keys or bridge tokens", () => {
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).not.toMatch(/service[_-]?role/i);
      expect(src, path).not.toMatch(/bridge[_-]?token/i);
      expect(src, path).not.toMatch(/SUPABASE_SERVICE_ROLE/);
    }
  });

  it("never re-introduces a pheno_hunt_candidates table", () => {
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).not.toMatch(/pheno_hunt_candidates/);
    }
  });

  it("delete path in phenoHuntService never deletes plant rows", () => {
    const src = sources["src/lib/phenoHuntService.ts"];
    // Split on each `.from(...)` so we only check chained operations on
    // the same target table — not unrelated `.delete()` calls elsewhere.
    const segments = src.split(/\.from\(/);
    for (const seg of segments.slice(1)) {
      const m = seg.match(/^["']([^"']+)["']\)([\s\S]*?)(?=\.from\(|$)/);
      if (m && m[1] === "plants") {
        expect(m[2]).not.toMatch(/\.delete\(/);
      }
    }
  });

  it("uses no public/customer-mode language", () => {
    for (const [path, src] of Object.entries(sources)) {
      expect(src.toLowerCase(), path).not.toMatch(/customer mode/);
      expect(src.toLowerCase(), path).not.toMatch(/public mode/);
    }
  });
});
