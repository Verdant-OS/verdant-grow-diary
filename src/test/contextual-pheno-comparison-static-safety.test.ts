/**
 * contextual-pheno-comparison-static-safety.test
 *
 * Static scanner over all Contextual Pheno Comparison v0/v0.1 production
 * files. Strips comments first so docstrings discussing constraints do
 * not trigger findings. Fails on unsafe operations or wording.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const FILES = [
  "src/lib/contextualPhenoComparisonViewModel.ts",
  "src/components/ContextualPhenoComparisonPanel.tsx",
  "src/pages/ContextualPhenoComparisonDemo.tsx",
  "src/test/fixtures/contextualPhenoComparisonFixtures.ts",
];

interface PhraseRule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly description: string;
}

const HARD_PHRASES: readonly PhraseRule[] = [
  { id: "functions-invoke", pattern: /functions\.invoke\b/i, description: "Edge function invoke" },
  { id: "supabase-insert", pattern: /\.insert\s*\(/i, description: "Supabase insert" },
  { id: "supabase-update", pattern: /\.update\s*\(/i, description: "Supabase update" },
  { id: "supabase-delete", pattern: /\.delete\s*\(/i, description: "Supabase delete" },
  { id: "supabase-upsert", pattern: /\bupsert\s*\(/i, description: "Supabase upsert" },
  { id: "selection-decisions", pattern: /selection_decisions/i, description: "blocked selection_decisions schema" },
  { id: "materialized-view", pattern: /materialized\s+view/i, description: "blocked materialized view" },
  { id: "create-policy", pattern: /create\s+policy/i, description: "RLS policy creation" },
  { id: "alter-table", pattern: /alter\s+table/i, description: "schema alteration" },
  { id: "winner", pattern: /\bwinner\b/i, description: "ranking language: winner" },
  { id: "best-pheno", pattern: /\bbest\s+pheno\b/i, description: "ranking language: best pheno" },
  { id: "automatically-select", pattern: /\bautomatically\s+select\b/i, description: "auto-selection" },
  { id: "auto-select", pattern: /\bauto[ _-]?select\b/i, description: "auto-selection" },
  { id: "rank", pattern: /\brank\b/i, description: "ranking language: rank" },
  { id: "ranking", pattern: /\branking\b/i, description: "ranking language: ranking" },
  { id: "scoreboard", pattern: /\bscoreboard\b/i, description: "scoreboard" },
  { id: "guaranteed", pattern: /\bguaranteed\b/i, description: "certainty language" },
  { id: "definitely", pattern: /\bdefinitely\b/i, description: "certainty language" },
  { id: "certain", pattern: /\bcertain\b/i, description: "certainty language" },
  { id: "device-command", pattern: /\bdevice\s+command\b/i, description: "device control" },
  { id: "automatically-control", pattern: /\bautomatically\s+control\b/i, description: "device control" },
  { id: "set-fan", pattern: /\bset\s+fan\b/i, description: "device control" },
  { id: "set-light", pattern: /\bset\s+light\b/i, description: "device control" },
  { id: "set-irrigation", pattern: /\bset\s+irrigation\b/i, description: "device control" },
  { id: "dose-nutrients", pattern: /\bdose\s+nutrients\b/i, description: "device control" },
  { id: "apply-pesticide", pattern: /\bapply\s+pesticide\b/i, description: "device control" },
];

const HEALTHY_RE = /\bhealthy\b/i;
const DEGRADED_RE = /\b(invalid|stale|demo|unknown|untrusted)\b/i;

interface Finding {
  file: string;
  line: number;
  phrase: string;
  excerpt: string;
}

function scanFile(path: string): Finding[] {
  const abs = resolve(process.cwd(), path);
  const raw = readFileSync(abs, "utf8");
  const stripped = stripSourceComments(raw);
  const lines = stripped.split("\n");
  const findings: Finding[] = [];

  lines.forEach((line, idx) => {
    for (const rule of HARD_PHRASES) {
      if (rule.pattern.test(line)) {
        findings.push({
          file: path,
          line: idx + 1,
          phrase: rule.id,
          excerpt: line.trim().slice(0, 200),
        });
      }
    }
    if (HEALTHY_RE.test(line) && DEGRADED_RE.test(line)) {
      findings.push({
        file: path,
        line: idx + 1,
        phrase: "healthy-near-degraded",
        excerpt: line.trim().slice(0, 200),
      });
    }
  });

  return findings;
}

describe("contextual-pheno-comparison static safety", () => {
  for (const file of FILES) {
    it(`${file}: no unsafe ops or wording`, () => {
      const findings = scanFile(file);
      if (findings.length > 0) {
        const msg = findings
          .map((f) => `${f.file}:${f.line} [${f.phrase}] ${f.excerpt}`)
          .join("\n");
        throw new Error(`Static safety violations:\n${msg}`);
      }
      expect(findings).toEqual([]);
    });
  }
});
