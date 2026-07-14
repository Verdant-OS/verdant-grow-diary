/**
 * pheno-keepers-write-surface-safety — the keepers/clones/crosses write surface
 * writes the grower's own records via RLS, but must never: use service_role,
 * import AI/alerts/action-queue, touch device/automation, delete plant rows, or
 * write anything but the three keeper-owned tables.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/phenoKeepersService.ts",
  "src/hooks/usePhenoKeepers.ts",
  "src/pages/PhenoKeepersPage.tsx",
];

const ALLOWED_WRITE_TABLES = ["pheno_keepers", "pheno_keeper_clones", "pheno_crosses"];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const sources = Object.fromEntries(
  FILES.map((f) => [f, stripComments(readFileSync(resolve(process.cwd(), f), "utf8"))]),
) as Record<string, string>;

describe("pheno keepers — write-surface static safety", () => {
  it("never uses service_role, AI/alerts/action-queue, or device/automation", () => {
    for (const [path, src] of Object.entries(sources)) {
      const lower = src.toLowerCase();
      expect(src, path).not.toMatch(/service[_-]?role/i);
      expect(src, path).not.toMatch(/from\s+["']@\/lib\/ai/i);
      expect(src, path).not.toMatch(/from\s+["']@\/lib\/alerts/i);
      expect(src, path).not.toMatch(/action_queue/i);
      expect(lower, path).not.toMatch(
        /device[_-]?control|device_command|automation|autopilot|target_device|actuator|\bmqtt\b/,
      );
    }
  });

  it("writes ONLY the three keeper-owned tables and never deletes/updates plants", () => {
    for (const [path, src] of Object.entries(sources)) {
      const segs = src.split(/\.from\(/);
      for (const seg of segs.slice(1)) {
        const m = seg.match(/^["']([^"']+)["']\)([\s\S]*?)(?=\.from\(|$)/);
        if (!m) continue;
        const [, table, ops] = m;
        if (table === "plants") {
          expect(ops, `${path} must not write plants`).not.toMatch(
            /\.(insert|update|upsert|delete)\(/,
          );
        }
        if (/\.(insert|update|upsert|delete)\(/.test(ops)) {
          expect(
            ALLOWED_WRITE_TABLES.includes(table),
            `${path} writes unexpected table: ${table}`,
          ).toBe(true);
        }
      }
    }
  });

  it("never ranks/picks a phenotype", () => {
    for (const [path, src] of Object.entries(sources)) {
      expect(src.toLowerCase(), path).not.toMatch(/\bwinner\b|\bbest\s+pheno\b|auto[_-]?select/);
    }
  });
});
