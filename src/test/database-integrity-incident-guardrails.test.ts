/**
 * Database integrity incident guardrails.
 *
 * Static scan that fails the build if anyone re-introduces the unsafe
 * "restore deleted tent as archived placeholder" repair pattern that
 * triggered the repeating tents_grow_id_fkey failures.
 *
 * See: docs/database-integrity-incident-runbook.md
 *
 * Verdant must never fabricate grows/tents rows to satisfy FK errors.
 * Real data loss must be recovered from backup/PITR, not from INSERTs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, sep } from "node:path";

const ROOT = resolve(__dirname, "../..");
const SELF = resolve(__filename);
const RUNBOOK = resolve(ROOT, "docs/database-integrity-incident-runbook.md");

const SCAN_DIRS = ["src", "scripts", "supabase", "tests"].map((d) =>
  resolve(ROOT, d),
);

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".next",
  "coverage",
]);
const SCAN_EXTS = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".sql", ".json"];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (SCAN_EXTS.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

function scanAll(): { path: string; text: string }[] {
  const files: { path: string; text: string }[] = [];
  for (const d of SCAN_DIRS) {
    for (const p of walk(d)) {
      if (p === SELF) continue;
      files.push({ path: p, text: readFileSync(p, "utf8") });
    }
  }
  return files;
}

const FORBIDDEN_GROW_UUIDS = [
  "fee28aa8-c0f3-442a-8c81-3b005f4d83c2",
];

describe("Database integrity incident guardrails", () => {
  const files = scanAll();

  it("no file contains the 'Restore deleted tent' repair comment", () => {
    const hits = files.filter((f) => /Restore\s+deleted\s+tent/i.test(f.text));
    expect(hits.map((h) => h.path.split(sep).join("/"))).toEqual([]);
  });

  it("no file contains 'archived placeholder' tent/grow repair language", () => {
    const hits = files.filter((f) =>
      /archived\s+placeholder/i.test(f.text) &&
      /\btent|\bgrow/i.test(f.text),
    );
    expect(hits.map((h) => h.path.split(sep).join("/"))).toEqual([]);
  });

  it("no file hardcodes known-bad production grow/tent UUIDs from the incident", () => {
    for (const uuid of FORBIDDEN_GROW_UUIDS) {
      const hits = files.filter((f) => f.text.toLowerCase().includes(uuid));
      expect(
        hits.map((h) => h.path.split(sep).join("/")),
        `Forbidden incident UUID ${uuid} found in repo`,
      ).toEqual([]);
    }
  });

  it("no raw INSERT INTO public.tents repair with placeholder/archived language", () => {
    const hits = files.filter((f) => {
      if (!/insert\s+into\s+(public\.)?tents\b/i.test(f.text)) return false;
      return /placeholder|archived|one[-_ ]?shot|orphan/i.test(f.text);
    });
    expect(hits.map((h) => h.path.split(sep).join("/"))).toEqual([]);
  });

  it("no raw INSERT INTO public.grows repair with placeholder/archived language", () => {
    const hits = files.filter((f) => {
      if (!/insert\s+into\s+(public\.)?grows\b/i.test(f.text)) return false;
      return /placeholder|archived|one[-_ ]?shot|orphan/i.test(f.text);
    });
    expect(hits.map((h) => h.path.split(sep).join("/"))).toEqual([]);
  });

  it("no client payload fabricates grow_id/tent_id to satisfy FK errors", () => {
    const hits = files.filter((f) => {
      if (!/\.(ts|tsx|js|mjs|cjs)$/.test(f.path)) return false;
      // Heuristic: a fabricate-on-FK pattern explicitly references
      // tents_grow_id_fkey or 'foreign key' and then inserts a row.
      const mentionsFkRecovery =
        /tents_grow_id_fkey/i.test(f.text) ||
        /foreign\s*key.*tent|tent.*foreign\s*key/i.test(f.text);
      if (!mentionsFkRecovery) return false;
      return /\.from\(\s*["'](tents|grows)["']\s*\)[\s\S]{0,200}\.insert\(/i.test(
        f.text,
      );
    });
    expect(hits.map((h) => h.path.split(sep).join("/"))).toEqual([]);
  });

  it("incident runbook exists and forbids fabricated placeholder rows", () => {
    const text = readFileSync(RUNBOOK, "utf8");
    expect(text).toMatch(/Do not patch FK failures/i);
    expect(text).toMatch(/backup|PITR/i);
    expect(text).toMatch(/Stop the repeating repair job first/i);
  });
});
