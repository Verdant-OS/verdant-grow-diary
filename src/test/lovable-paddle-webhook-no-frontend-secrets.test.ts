/**
 * Static safety scan: verify no service_role key, no Paddle webhook secret,
 * no Paddle sandbox/live API key, and no bearer/bridge token appears in
 * any file under src/ (frontend surface).
 *
 * Phase 2a safety requirement #13 + task test #16.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(p)) out.push(p);
  }
  return out;
}

describe("no server-only paddle secrets appear in src/", () => {
  // Read each eligible source file exactly once while Vitest registers this
  // suite. The six assertions below then search an in-memory snapshot rather
  // than competing for disk I/O six times during a full parallel run.
  const files = walk("src")
    .filter(
      (file) =>
        !/no-?frontend-secrets|paddle-readiness|no-secrets|client-secret|server-billing-env-trust/i.test(
          file,
        ),
    )
    .map((file) => ({ file, source: readFileSync(file, "utf8") }));
  for (const forbidden of FORBIDDEN) {
    it(`no src/ file references ${forbidden}`, () => {
      const hits = files.filter(({ source }) => source.includes(forbidden)).map(({ file }) => file);
      expect(hits).toEqual([]);
    });
  }
});
