/**
 * Grow/tent restore verification safety + classifier tests.
 *
 * - Verifies the pure `buildVerificationReport` classifier returns the
 *   correct verdict for the canonical incident states.
 * - Static safety scan: the verification script and its docs must
 *   contain NO mutation SQL and no service_role usage.
 *
 * See:
 *   docs/grow-tent-restore-verification.md
 *   docs/database-integrity-incident-runbook.md
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GROW_ID_REFERENCING_TABLES,
  TENT_ID_REFERENCING_TABLES,
  VERIFICATION_COUNT_TABLES,
  buildCountSql,
  buildOrphanGrowSql,
  buildOrphanTentSql,
  buildVerificationReport,
} from "@/lib/growTentRestoreVerification";

const ROOT = resolve(__dirname, "../..");
const SCRIPT_PATH = resolve(ROOT, "scripts/run-grow-tent-restore-verification.ts");
const DOC_PATH = resolve(ROOT, "docs/grow-tent-restore-verification.md");
const LIB_PATH = resolve(ROOT, "src/lib/growTentRestoreVerification.ts");

const FULL_COUNTS = Object.fromEntries(
  VERIFICATION_COUNT_TABLES.map((t) => [t, 5]),
) as Record<(typeof VERIFICATION_COUNT_TABLES)[number], number>;

describe("growTentRestoreVerification — SQL builders are SELECT-only", () => {
  it("count SQL is SELECT-only and whitelisted", () => {
    for (const t of VERIFICATION_COUNT_TABLES) {
      const sql = buildCountSql(t);
      expect(sql).toMatch(new RegExp(`FROM public\\.${t}\\b`));
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|UPSERT|TRUNCATE|ALTER|DROP|CREATE|GRANT)\b/i);
    }
    // @ts-expect-error – runtime guard
    expect(() => buildCountSql("auth.users")).toThrow();
  });

  it("orphan grow SQL is a LEFT JOIN with NULL filter, no writes", () => {
    for (const t of GROW_ID_REFERENCING_TABLES) {
      const sql = buildOrphanGrowSql(t);
      expect(sql).toMatch(/LEFT JOIN public\.grows/);
      expect(sql).toMatch(/g\.id IS NULL/);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|UPSERT|TRUNCATE|ALTER|DROP|CREATE|GRANT)\b/i);
    }
  });

  it("orphan tent SQL is a LEFT JOIN with NULL filter, no writes", () => {
    for (const t of TENT_ID_REFERENCING_TABLES) {
      const sql = buildOrphanTentSql(t);
      expect(sql).toMatch(/LEFT JOIN public\.tents/);
      expect(sql).toMatch(/t\.id IS NULL/);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|UPSERT|TRUNCATE|ALTER|DROP|CREATE|GRANT)\b/i);
    }
  });
});

describe("buildVerificationReport — verdict classification", () => {
  it("classifies empty grows/tents as blocked_empty_core_tables", () => {
    const r = buildVerificationReport({
      environment: "production",
      counts: { ...FULL_COUNTS, grows: 0, tents: 0 },
    });
    expect(r.verdict).toBe("blocked_empty_core_tables");
    expect(r.grows_empty).toBe(true);
    expect(r.tents_empty).toBe(true);
    expect(r.environment).toBe("production");
  });

  it("classifies orphan grow references as blocked_orphans_found", () => {
    const r = buildVerificationReport({
      counts: FULL_COUNTS,
      orphanGrowReferences: { plants: 3 },
    });
    expect(r.verdict).toBe("blocked_orphans_found");
    expect(r.total_orphan_grow_references).toBe(3);
  });

  it("classifies orphan tent references as blocked_orphans_found", () => {
    const r = buildVerificationReport({
      counts: FULL_COUNTS,
      orphanTentReferences: { sensor_readings: 8 },
    });
    expect(r.verdict).toBe("blocked_orphans_found");
    expect(r.total_orphan_tent_references).toBe(8);
  });

  it("returns ok when grows/tents present and no orphans", () => {
    const r = buildVerificationReport({ counts: FULL_COUNTS });
    expect(r.verdict).toBe("ok");
    expect(r.total_orphan_grow_references).toBe(0);
    expect(r.total_orphan_tent_references).toBe(0);
    expect(r.environment).toBe("unknown");
  });

  it("returns needs_review when counts ok and only errors present", () => {
    const r = buildVerificationReport({
      counts: FULL_COUNTS,
      errors: ["count:plants:timeout"],
    });
    expect(r.verdict).toBe("needs_review");
  });

  it("report is JSON-safe (no functions, no circular refs)", () => {
    const r = buildVerificationReport({ counts: FULL_COUNTS });
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow();
  });
});

describe("Static safety scan — no mutation SQL in script/docs/lib", () => {
  const targets = [
    { name: "script", text: readFileSync(SCRIPT_PATH, "utf8") },
    { name: "docs", text: readFileSync(DOC_PATH, "utf8") },
    { name: "lib", text: readFileSync(LIB_PATH, "utf8") },
  ];

  const FORBIDDEN_PATTERNS: { label: string; re: RegExp }[] = [
    { label: "INSERT INTO", re: /\binsert\s+into\b/i },
    { label: "UPDATE … SET", re: /\bupdate\s+\w[\w.]*\s+set\b/i },
    { label: "DELETE FROM", re: /\bdelete\s+from\b/i },
    { label: "UPSERT INTO", re: /\bupsert\s+into\b/i },
    { label: ".upsert(", re: /\.upsert\s*\(/i },
    { label: "TRUNCATE", re: /\btruncate\s+(table\s+)?\w/i },
    { label: "ALTER TABLE", re: /\balter\s+table\b/i },
    { label: "DROP TABLE", re: /\bdrop\s+table\b/i },
    { label: "CREATE POLICY", re: /\bcreate\s+policy\b/i },
    { label: "service_role", re: /\bservice_role\b/ },
  ];

  for (const t of targets) {
    for (const p of FORBIDDEN_PATTERNS) {
      it(`${t.name} does not contain ${p.label}`, () => {
        expect(p.re.test(t.text)).toBe(false);
      });
    }
  }
});
