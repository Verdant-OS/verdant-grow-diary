/**
 * pheno-male-eval-write-surface-safety — the male-evaluation write surface
 * records the grower's own rubric ratings + pollen viability tests via RLS, but
 * must never: use service_role, import AI/alerts/action-queue, touch
 * device/automation, write anything but the two male-eval-owned tables, or
 * rank/pick/promote a male.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = ["src/lib/phenoMaleEvaluationService.ts"];

const ALLOWED_WRITE_TABLES = ["pheno_male_evaluations", "pheno_pollen_viability_tests"];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const sources = Object.fromEntries(
  FILES.map((f) => [f, stripComments(readFileSync(resolve(process.cwd(), f), "utf8"))]),
) as Record<string, string>;

describe("pheno male evaluation — write-surface static safety", () => {
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

  it("writes ONLY the two male-eval-owned tables and never writes plants/hunts", () => {
    for (const [path, src] of Object.entries(sources)) {
      const segs = src.split(/\.from\(/);
      for (const seg of segs.slice(1)) {
        const m = seg.match(/^["']([^"']+)["']\)([\s\S]*?)(?=\.from\(|$)/);
        if (!m) continue;
        const [, table, ops] = m;
        if (table === "plants" || table === "pheno_hunts") {
          expect(ops, `${path} must not write ${table}`).not.toMatch(
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

  it("never deletes rows (cards are user-editable, tests are append-only)", () => {
    for (const [path, src] of Object.entries(sources)) {
      expect(src, `${path} must not delete rows`).not.toMatch(/\.delete\(/);
    }
  });

  it("never appends UPDATE/DELETE to the append-only viability table", () => {
    for (const [path, src] of Object.entries(sources)) {
      const segs = src.split(/\.from\(/);
      for (const seg of segs.slice(1)) {
        const m = seg.match(/^["']([^"']+)["']\)([\s\S]*?)(?=\.from\(|$)/);
        if (!m) continue;
        const [, table, ops] = m;
        if (table === "pheno_pollen_viability_tests") {
          expect(ops, `${path} must not update/delete append-only viability tests`).not.toMatch(
            /\.(update|upsert|delete)\(/,
          );
        }
      }
    }
  });

  it("never ranks/picks/promotes a male", () => {
    for (const [path, src] of Object.entries(sources)) {
      expect(src.toLowerCase(), path).not.toMatch(
        /\bwinner\b|\bbest\s+male\b|auto[_-]?select|auto[_-]?promote/,
      );
    }
  });
});
