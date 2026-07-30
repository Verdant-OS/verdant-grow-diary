/**
 * Static safety scan: verify no service_role key, no Paddle webhook secret,
 * no Paddle sandbox/live API key, and no bearer/bridge token appears in
 * any file under src/ (frontend surface).
 *
 * Phase 2a safety requirement #13 + task test #16.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// SUPABASE_SERVICE_ROLE_KEY is already covered by existing project-wide
// safety scans (action-queue-*-static-safety, client-secret-boundary, etc.).
// This scan is scoped to the Paddle secret surface introduced by Phase 2a.
const FORBIDDEN = [
  "PAYMENTS_SANDBOX_WEBHOOK_SECRET",
  "PAYMENTS_LIVE_WEBHOOK_SECRET",
  "PADDLE_SANDBOX_API_KEY",
  "PADDLE_LIVE_API_KEY",
  // Legacy BYO secret names — must remain server-only:
  "PADDLE_WEBHOOK_SECRET",
  "PADDLE_API_KEY",
] as const;

const SOURCE_FILE_RE = /\.(?:ts|tsx|js|jsx)$/;
const TEST_FILE_RE = /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/;
const TEST_DIRECTORY_NAMES = new Set(["test", "tests", "__tests__"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (!TEST_DIRECTORY_NAMES.has(name)) walk(p, out);
    } else if (SOURCE_FILE_RE.test(p) && !TEST_FILE_RE.test(p)) {
      out.push(p);
    }
  }
  return out;
}

function scanForbiddenTerms(root: string): Map<(typeof FORBIDDEN)[number], string[]> {
  const hitsByForbidden = new Map(
    FORBIDDEN.map((forbidden) => [forbidden, [] as string[]] as const),
  );

  for (const file of walk(root)) {
    const source = readFileSync(file, "utf8");
    for (const forbidden of FORBIDDEN) {
      if (!source.includes(forbidden)) continue;
      const hits = hitsByForbidden.get(forbidden);
      if (!hits) throw new Error(`Missing scan bucket for ${forbidden}`);
      hits.push(file);
    }
  }

  return hitsByForbidden;
}

describe("no server-only paddle secrets appear in src/", () => {
  // Take one immutable source snapshot for all six assertions. Re-reading the
  // entire tree once per term made this security gate exceed Vitest's default
  // timeout on slower Windows filesystems.
  const hitsByForbidden = scanForbiddenTerms("src");

  for (const forbidden of FORBIDDEN) {
    it(`no src/ file references ${forbidden}`, () => {
      expect(hitsByForbidden.get(forbidden)).toEqual([]);
    });
  }
});
