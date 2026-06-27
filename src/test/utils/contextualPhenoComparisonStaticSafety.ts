/**
 * contextualPhenoComparisonStaticSafety
 *
 * Shared utility for the Contextual Pheno Comparison v0 static safety
 * scanner. Pure, deterministic, dependency-free outside of node:fs.
 *
 * - Forbidden phrase rules live here, not in runtime code.
 * - Reports include file, line, category, matched phrase, and a short
 *   excerpt of the offending source line.
 * - Provides both a grouped local report and a GitHub Actions
 *   annotation formatter (sanitised + truncated).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

export type SafetyCategory =
  | "write/API operation"
  | "schema/persistence"
  | "ranking/selection"
  | "certainty/overclaiming"
  | "device-control/dosing"
  | "unsafe degraded-data wording";

export interface PhraseRule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly category: SafetyCategory;
  readonly description: string;
}

export interface Finding {
  readonly file: string;
  readonly line: number;
  readonly category: SafetyCategory;
  readonly phrase: string;
  readonly excerpt: string;
}

export const CONTEXTUAL_PHENO_COMPARISON_SAFETY_FILES: readonly string[] = [
  "src/lib/contextualPhenoComparisonViewModel.ts",
  "src/components/ContextualPhenoComparisonPanel.tsx",
  "src/pages/ContextualPhenoComparisonDemo.tsx",
  "src/test/fixtures/contextualPhenoComparisonFixtures.ts",
];

export const PHRASE_RULES: readonly PhraseRule[] = [
  // write/API operation
  { id: "functions-invoke", pattern: /functions\.invoke\b/i, category: "write/API operation", description: "Edge function invoke" },
  { id: "supabase-insert", pattern: /\.insert\s*\(/i, category: "write/API operation", description: "Supabase insert" },
  { id: "supabase-update", pattern: /\.update\s*\(/i, category: "write/API operation", description: "Supabase update" },
  { id: "supabase-delete", pattern: /\.delete\s*\(/i, category: "write/API operation", description: "Supabase delete" },
  { id: "supabase-upsert", pattern: /\bupsert\s*\(/i, category: "write/API operation", description: "Supabase upsert" },
  { id: "fetch-call", pattern: /\bfetch\s*\(/i, category: "write/API operation", description: "network fetch" },
  // schema/persistence
  { id: "selection-decisions", pattern: /selection_decisions/i, category: "schema/persistence", description: "blocked selection_decisions schema" },
  { id: "materialized-view", pattern: /materialized\s+view/i, category: "schema/persistence", description: "blocked materialized view" },
  { id: "create-policy", pattern: /create\s+policy/i, category: "schema/persistence", description: "RLS policy creation" },
  { id: "alter-table", pattern: /alter\s+table/i, category: "schema/persistence", description: "schema alteration" },
  // ranking/selection
  { id: "winner", pattern: /\bwinner\b/i, category: "ranking/selection", description: "ranking language: winner" },
  { id: "best-pheno", pattern: /\bbest\s+pheno\b/i, category: "ranking/selection", description: "ranking language: best pheno" },
  { id: "automatically-select", pattern: /\bautomatically\s+select\b/i, category: "ranking/selection", description: "auto-selection" },
  { id: "auto-select", pattern: /\bauto[ _-]?select\b/i, category: "ranking/selection", description: "auto-selection" },
  { id: "rank", pattern: /\brank\b/i, category: "ranking/selection", description: "ranking language: rank" },
  { id: "ranking", pattern: /\branking\b/i, category: "ranking/selection", description: "ranking language: ranking" },
  { id: "scoreboard", pattern: /\bscoreboard\b/i, category: "ranking/selection", description: "scoreboard" },
  // certainty/overclaiming
  { id: "guaranteed", pattern: /\bguaranteed\b/i, category: "certainty/overclaiming", description: "certainty language" },
  { id: "definitely", pattern: /\bdefinitely\b/i, category: "certainty/overclaiming", description: "certainty language" },
  { id: "certain", pattern: /\bcertain\b/i, category: "certainty/overclaiming", description: "certainty language" },
  // device-control/dosing
  { id: "device-command", pattern: /\bdevice\s+command\b/i, category: "device-control/dosing", description: "device control" },
  { id: "automatically-control", pattern: /\bautomatically\s+control\b/i, category: "device-control/dosing", description: "device control" },
  { id: "set-fan", pattern: /\bset\s+fan\b/i, category: "device-control/dosing", description: "device control" },
  { id: "set-light", pattern: /\bset\s+light\b/i, category: "device-control/dosing", description: "device control" },
  { id: "set-irrigation", pattern: /\bset\s+irrigation\b/i, category: "device-control/dosing", description: "device control" },
  { id: "dose-nutrients", pattern: /\bdose\s+nutrients\b/i, category: "device-control/dosing", description: "device control" },
  { id: "apply-pesticide", pattern: /\bapply\s+pesticide\b/i, category: "device-control/dosing", description: "device control" },
];

const HEALTHY_RE = /\bhealthy\b/i;
const DEGRADED_RE = /\b(invalid|stale|demo|unknown|untrusted)\b/i;

const MAX_EXCERPT_LEN = 160;

function truncate(text: string, max = MAX_EXCERPT_LEN): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

/**
 * Scan a single source body. Strips comments first but preserves line
 * numbering by replacing comment chars with spaces only when feasible.
 */
export function scanSource(file: string, raw: string): Finding[] {
  const stripped = stripSourceComments(raw);
  const lines = stripped.split("\n");
  const findings: Finding[] = [];

  lines.forEach((line, idx) => {
    for (const rule of PHRASE_RULES) {
      if (rule.pattern.test(line)) {
        findings.push({
          file,
          line: idx + 1,
          category: rule.category,
          phrase: rule.id,
          excerpt: truncate(line.trim()),
        });
      }
    }
    if (HEALTHY_RE.test(line) && DEGRADED_RE.test(line)) {
      findings.push({
        file,
        line: idx + 1,
        category: "unsafe degraded-data wording",
        phrase: "healthy-near-degraded",
        excerpt: truncate(line.trim()),
      });
    }
  });

  return findings;
}

export function scanFile(path: string): Finding[] {
  const abs = resolve(process.cwd(), path);
  const raw = readFileSync(abs, "utf8");
  return scanSource(path, raw);
}

export function scanAll(
  paths: readonly string[] = CONTEXTUAL_PHENO_COMPARISON_SAFETY_FILES,
): Finding[] {
  return paths.flatMap((p) => scanFile(p));
}

/** Group findings by file path, preserving order. */
export function groupByFile(findings: readonly Finding[]): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = map.get(f.file) ?? [];
    arr.push(f);
    map.set(f.file, arr);
  }
  return map;
}

/** Concise grouped local failure report. */
export function formatLocalReport(findings: readonly Finding[]): string {
  if (findings.length === 0) return "";
  const groups = groupByFile(findings);
  const out: string[] = ["Contextual Pheno Comparison static safety failed", ""];
  for (const [file, items] of groups) {
    out.push(file);
    for (const f of items) {
      out.push(`- line ${f.line} [${f.category}] "${f.phrase}"`);
      out.push(`  ${f.excerpt}`);
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}

/**
 * Sanitise a single annotation message: collapse newlines, escape the
 * GitHub annotation delimiter, and truncate.
 */
export function sanitizeAnnotationMessage(text: string, max = MAX_EXCERPT_LEN): string {
  const collapsed = text.replace(/\r?\n/g, " ").replace(/::/g, ":\u200b:");
  return truncate(collapsed, max);
}

/** Format one finding as a GitHub Actions error annotation line. */
export function formatGithubAnnotation(f: Finding): string {
  const msg = sanitizeAnnotationMessage(
    `[${f.category}] "${f.phrase}" — ${f.excerpt}`,
  );
  const linePart = Number.isFinite(f.line) && f.line > 0 ? `,line=${f.line}` : "";
  return `::error file=${f.file}${linePart},title=Contextual Pheno Comparison safety::${msg}`;
}

export function formatGithubAnnotations(findings: readonly Finding[]): string {
  return findings.map(formatGithubAnnotation).join("\n");
}
