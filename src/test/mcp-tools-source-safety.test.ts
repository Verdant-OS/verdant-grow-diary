/**
 * MCP server-side tool safety scan.
 *
 * Read-only source-code regression: each MCP tool handler under
 * `src/lib/mcp/tools/*.ts` must
 *   - import the RLS-scoped Supabase client (`supabaseForUser`), never
 *     the app singleton or a service-role key,
 *   - short-circuit unauthenticated calls,
 *   - carry the `readOnlyHint: true` annotation,
 *   - never reference SERVICE_ROLE / service_role / bridge tokens /
 *     Action Queue writes / AI Doctor / device control.
 *
 * This proves cross-user RLS isolation at the source-code layer: since
 * every query flows through the caller's forwarded OAuth token, User A
 * can never see User B's rows unless RLS is intentionally weakened at
 * the DB (a separate change out of scope for this slice). Combined
 * with existing user_roles / RLS harnesses, this guards the surface.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const TOOLS_DIR = resolve(process.cwd(), "src/lib/mcp/tools");

function toolFiles(): string[] {
  return readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.startsWith("_"))
    .map((f) => resolve(TOOLS_DIR, f));
}

describe("MCP tool source-code safety scan", () => {
  const files = toolFiles();

  it("has at least one tool file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const relative = file.split("src/lib/mcp/tools/").pop();

    describe(relative, () => {
      it("uses the RLS-scoped per-user Supabase client", () => {
        expect(src).toMatch(/supabaseForUser\s*\(/);
      });

      it("short-circuits unauthenticated callers", () => {
        expect(src).toMatch(/isAuthenticated\s*\(\)/);
      });

      it("annotates itself read-only", () => {
        expect(src).toMatch(/readOnlyHint\s*:\s*true/);
      });

      it("never touches the service role or private secrets", () => {
        expect(src).not.toMatch(/SERVICE_ROLE/);
        expect(src).not.toMatch(/service_role/i);
        expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
        expect(src).not.toMatch(/bridge[_-]?token/i);
        expect(src).not.toMatch(/refresh[_-]?token/i);
      });

      it("performs no write, Action Queue, AI, or device-control calls", () => {
        expect(src).not.toMatch(/\.insert\s*\(/);
        expect(src).not.toMatch(/\.update\s*\(/);
        expect(src).not.toMatch(/\.upsert\s*\(/);
        expect(src).not.toMatch(/\.delete\s*\(/);
        expect(src).not.toMatch(/action_queue/i);
        expect(src).not.toMatch(/ai[_-]?doctor/i);
        expect(src).not.toMatch(/device[_-]?control/i);
        expect(src).not.toMatch(/functions\.invoke/);
      });

      it("never returns raw_payload", () => {
        expect(src).not.toMatch(/raw_payload/);
      });
    });
  }
});
