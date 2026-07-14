/**
 * AI Doctor Output Evaluation — static safety scanner.
 *
 * Extends the repository's existing source-scanning safety pattern (see
 * action-queue-safety.test.ts) for the output-evaluation build. Locks the
 * posture that the evaluator, its fixtures, its runner, and its report
 * generator are PURE and contain no privileged / networked / secret surface.
 *
 * Do NOT relax without a security review.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

const SCANNED_FILES = [
  "src/lib/aiDoctorOutputEvaluation.ts",
  "src/test/fixtures/ai-doctor-output-evaluation/index.ts",
  "src/test/ai-doctor-output-golden-cases.test.ts",
  "src/test/ai-doctor-output-evaluation.test.ts",
  "scripts/generate-ai-doctor-evaluation-report.ts",
] as const;

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

/**
 * Infrastructure / secret / network / model-provider tokens that must never
 * appear in the evaluation build. These are INFRA tokens, not semantic safety
 * keywords — the evaluator legitimately contains device/automation *detection*
 * patterns (e.g. "turn on", "execute"), which are NOT forbidden here.
 */
const FORBIDDEN_SUBSTRINGS: readonly string[] = [
  "service_role",
  "SERVICE_ROLE",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRIVATE_API_KEY",
  "sk_live_",
  "sk_test_",
  "functions.invoke",
  "@supabase/supabase-js",
  "createClient(",
  "process.env",
  "raw_payload",
  "mqtt",
  "XMLHttpRequest",
  "Bearer ",
];

const FORBIDDEN_PATTERNS: readonly { name: string; re: RegExp }[] = [
  { name: "supabase import", re: /from\s+["']@supabase\//i },
  {
    name: "supabase write (.insert/.upsert/.update/.delete)",
    re: /\.(insert|upsert|update|delete)\s*\(/,
  },
  { name: "network fetch", re: /\bfetch\s*\(/ },
  { name: "websocket", re: /\bnew WebSocket\b/ },
  { name: "model provider sdk", re: /\b(anthropic|openai)\b/i },
  { name: "model id literal", re: /\b(claude-|gpt-)\w/i },
  { name: "email address", re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
  { name: "alerts insert", re: /alerts?\s*\.\s*insert/i },
  { name: "action_queue insert", re: /action_queue[^\n]*insert/i },
];

describe("AI Doctor output evaluation — static safety", () => {
  for (const file of SCANNED_FILES) {
    describe(file, () => {
      const src = read(file);

      it("contains no forbidden infrastructure / secret substrings", () => {
        for (const token of FORBIDDEN_SUBSTRINGS) {
          expect(src.includes(token), `${file} must not contain "${token}"`).toBe(false);
        }
      });

      it("matches no forbidden network / write / provider patterns", () => {
        for (const { name, re } of FORBIDDEN_PATTERNS) {
          expect(re.test(src), `${file} must not match ${name}`).toBe(false);
        }
      });
    });
  }

  it("the evaluator imports only pure @/lib and node-free modules", () => {
    const src = read("src/lib/aiDoctorOutputEvaluation.ts");
    const importLines = src.split("\n").filter((l) => /^\s*import\b/.test(l));
    for (const line of importLines) {
      expect(
        /@supabase|anthropic|openai|node:|\bfs\b/.test(line),
        `unexpected import: ${line}`,
      ).toBe(false);
    }
  });

  it("the golden-case runner and unit tests skip no cases", () => {
    for (const file of [
      "src/test/ai-doctor-output-golden-cases.test.ts",
      "src/test/ai-doctor-output-evaluation.test.ts",
    ]) {
      const src = read(file);
      expect(
        /\b(it|describe|test)\.(skip|only|todo)\b/.test(src),
        `${file} must not skip/only cases`,
      ).toBe(false);
    }
  });
});
