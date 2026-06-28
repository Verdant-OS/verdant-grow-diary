/**
 * Post-Grow Learning Report — Full-Path Static Safety v2
 *
 * Scans every file on the Post-Grow Learning Report code path for banned
 * automation / device-control / over-claim / fake-live / "healthy near
 * untrusted source" phrasing. Allows only the explicit guardrail negations
 * documented below.
 *
 * Scope:
 *   - src/pages/PostGrowLearningReport.tsx
 *   - src/components/PostGrowLearningReportCards.tsx
 *   - src/lib/postGrowLearningReportRules.ts
 *   - src/lib/postGrowReportPrintRules.ts
 *
 * Hard rules:
 *   - This test file does NOT scan itself.
 *   - Banned tokens MUST NOT appear anywhere (case-insensitive).
 *   - "device command(s)" only allowed inside the approved negation:
 *       "does not include device commands"
 *   - "healthy" never allowed near csv/invalid/stale/demo/unknown/untrusted.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

const POST_GROW_FILES = [
  "src/pages/PostGrowLearningReport.tsx",
  "src/components/PostGrowLearningReportCards.tsx",
  "src/lib/postGrowLearningReportRules.ts",
  "src/lib/postGrowReportPrintRules.ts",
] as const;

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const SOURCES = POST_GROW_FILES.map((f) => ({ path: f, body: read(f) }));
const COMBINED = SOURCES.map((s) => s.body).join("\n\n");
const COMBINED_LOWER = COMBINED.toLowerCase();

// ---------------------------------------------------------------------------
// Banned phrase list — straight contains-checks (case-insensitive).
// ---------------------------------------------------------------------------
const BANNED_PHRASES = [
  "automatically executed",
  "automatically execute",
  "auto execute",
  "auto-execute will",
  "send command",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
  "guaranteed",
  "definitely",
  "diagnosed from photo",
  "fake live",
  "controls your grow",
  "autopilot",
  "fully automated",
  "ai grows for you",
];

describe("Post-Grow Report — full-path static safety v2", () => {
  it("scans the expected post-grow code-path files", () => {
    expect(SOURCES.map((s) => s.path).sort()).toEqual([...POST_GROW_FILES].sort());
    for (const s of SOURCES) {
      expect(s.body.length, `empty file: ${s.path}`).toBeGreaterThan(0);
    }
  });

  it.each(BANNED_PHRASES)("never contains banned phrase: %s", (phrase) => {
    for (const s of SOURCES) {
      expect(
        s.body.toLowerCase().includes(phrase),
        `banned phrase "${phrase}" found in ${s.path}`,
      ).toBe(false);
    }
  });

  it("only allows 'device command' inside the approved negation copy", () => {
    // Allowed forms (lowercased):
    //   - "does not include device command"
    //   - "no device command"
    for (const s of SOURCES) {
      const lower = s.body.toLowerCase();
      const total = lower.split("device command").length - 1;
      if (total === 0) continue;
      const allowedA = lower.split("does not include device command").length - 1;
      const allowedB = lower.split("no device command").length - 1;
      const allowed = allowedA + allowedB;
      expect(
        allowed,
        `${s.path}: every "device command" occurrence must be inside an approved negation. total=${total} allowed=${allowed}`,
      ).toBe(total);
    }
  });

  it("does not describe csv/invalid/stale/demo/unknown/untrusted data as healthy", () => {
    // Untrusted-source token within 60 chars of "healthy" in either direction.
    const untrusted = "(csv|invalid|stale|demo|unknown|untrusted|imported)";
    const forward = new RegExp(`${untrusted}[^.\\n]{0,60}\\bhealthy\\b`, "i");
    const backward = new RegExp(`\\bhealthy\\b[^.\\n]{0,60}${untrusted}`, "i");
    for (const s of SOURCES) {
      expect(s.body, `forward 'healthy' violation in ${s.path}`).not.toMatch(forward);
      expect(s.body, `backward 'healthy' violation in ${s.path}`).not.toMatch(backward);
    }
  });

  it("only allows 'healthy' inside negated guardrail copy", () => {
    // Allowed: "missing data is treated as missing, not healthy" or any
    // direct negation like "not healthy" / "never healthy". Any positive
    // "<thing> is healthy" / "looks healthy" / "plants healthy" must fail.
    const positive =
      /\b(plants?|leaves?|canopy|run|grow|everything|results?|things?)\b[^.\n]{0,20}\bis (looking |)healthy\b/i;
    const blanket = /\beverything (is|looks) healthy\b/i;
    for (const s of SOURCES) {
      expect(s.body, `positive 'healthy' claim in ${s.path}`).not.toMatch(positive);
      expect(s.body, `blanket 'healthy' claim in ${s.path}`).not.toMatch(blanket);
    }
  });

  it("never leaks raw payloads, service-role keys, bridge tokens, or api tokens in executable code", () => {
    const FORBIDDEN_SECRETS = [
      "raw_payload",
      "service_role",
      "service-role",
      "sb_secret",
      "supabase_service_role_key",
      "bridge_token",
      "api_token",
      "bearer ",
    ];
    // Strip /* ... */ block comments and // line comments so guardrail
    // documentation ("Never accepts raw_payload, service-role keys, ...")
    // doesn't trip the secret scan. We care about runtime code.
    const stripComments = (s: string) =>
      s
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    for (const s of SOURCES) {
      const lower = stripComments(s.body).toLowerCase();
      for (const term of FORBIDDEN_SECRETS) {
        expect(
          lower.includes(term),
          `forbidden secret token "${term}" found in executable code of ${s.path}`,
        ).toBe(false);
      }
    }
  });

  it("pins the approved guardrail negation copy is actually present", () => {
    // Source-honesty + action-safety guardrails must be present somewhere
    // on the path so future edits cannot silently strip them.
    expect(COMBINED).toMatch(/does not include device commands/i);
    expect(COMBINED).toMatch(/missing data is treated as missing, not healthy/i);
  });
});
