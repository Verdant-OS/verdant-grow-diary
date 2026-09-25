/**
 * Codex review on #1683 (BUG-001 follow-up): ai-doctor-review built its
 * request-auth client from `Deno.env.get("SUPABASE_URL")!` and
 * `Deno.env.get("SUPABASE_ANON_KEY")!` before any configuration check. A
 * missing value made createClient throw into the outer catch, which logs
 * `status=unexpected` and returns reason `http`, so the grower was told to
 * retry instead of seeing the service-configuration outage.
 *
 * Structural scan: the edge function cannot be imported under Vitest (Deno
 * globals, `Deno.serve` at module scope), so this pins the order of the
 * checks in the source.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  resolve(process.cwd(), "supabase/functions/ai-doctor-review/index.ts"),
  "utf8",
);

describe("ai-doctor-review auth-client configuration", () => {
  it("never reads the auth-client env with a non-null assertion", () => {
    expect(SOURCE).not.toMatch(/Deno\.env\.get\("SUPABASE_URL"\)!/);
    expect(SOURCE).not.toMatch(/Deno\.env\.get\("SUPABASE_ANON_KEY"\)!/);
  });

  it("names a missing URL or anon key as config before the handler creates a client", () => {
    const handler = SOURCE.indexOf("Deno.serve(");
    expect(handler).toBeGreaterThan(0);
    const firstClient = SOURCE.indexOf("createClient(", handler);
    expect(firstClient).toBeGreaterThan(handler);
    const beforeClient = SOURCE.slice(handler, firstClient);
    expect(beforeClient).toContain('"supabase_url"');
    expect(beforeClient).toContain('"supabase_anon_key"');
    expect(beforeClient).toContain("status=config_missing missing=");
    expect(beforeClient).toContain('return calmFailure("config");');
  });
});
