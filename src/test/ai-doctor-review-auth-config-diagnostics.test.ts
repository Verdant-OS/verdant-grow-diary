/**
 * Codex review on #1683 (BUG-001 follow-up): ai-doctor-review built its
 * request-auth client from `Deno.env.get("SUPABASE_URL")!` and
 * `Deno.env.get("SUPABASE_ANON_KEY")!` before any configuration check. A
 * missing value made createClient throw into the outer catch, which logs
 * `status=unexpected` and returns reason `http`, so the grower was told to
 * retry instead of seeing the service-configuration outage.
 *
 * Structural scan of the executable text (comments removed), so a check that
 * survives only in a comment does not count (Codex review on #1683).
 *
 * @source-scan-justified: the edge entry cannot be imported under Vitest. It
 * calls `Deno.serve` at module scope, reads `Deno.env`, and imports `npm:`
 * specifiers that Vite does not resolve.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { executableTsSource } from "@/test/helpers/executableTsSource";

const SOURCE = readFileSync(
  resolve(process.cwd(), "supabase/functions/ai-doctor-review/index.ts"),
  "utf8",
);
const CODE = executableTsSource(SOURCE);

const REQUIRED_BEFORE_FIRST_CLIENT = [
  '"supabase_url"',
  '"supabase_anon_key"',
  "status=config_missing missing=",
  'return calmFailure("config");',
] as const;

/** What the handler lacks before its first createClient; [] when complete. */
function missingConfigChecks(code: string): string[] {
  const handler = code.indexOf("Deno.serve(");
  const firstClient = handler < 0 ? -1 : code.indexOf("createClient(", handler);
  if (handler < 0 || firstClient < 0) return ["Deno.serve( ... createClient("];
  const beforeClient = code.slice(handler, firstClient);
  return REQUIRED_BEFORE_FIRST_CLIENT.filter((needle) => !beforeClient.includes(needle));
}

describe("ai-doctor-review auth-client configuration", () => {
  it("never reads the auth-client env with a non-null assertion", () => {
    expect(CODE).not.toMatch(/Deno\.env\.get\("SUPABASE_URL"\)!/);
    expect(CODE).not.toMatch(/Deno\.env\.get\("SUPABASE_ANON_KEY"\)!/);
  });

  it("names a missing URL or anon key as config before the handler creates a client", () => {
    expect(missingConfigChecks(CODE)).toEqual([]);
  });

  it("does not count a config return that survives only in a comment", () => {
    const guard = '      return calmFailure("config");\n    }\n    const supabase = createClient(';
    expect(SOURCE).toContain(guard);
    const commentedOut = SOURCE.replace(
      guard,
      '      // was: return calmFailure("config");\n    }\n    const supabase = createClient(',
    );
    expect(missingConfigChecks(executableTsSource(commentedOut))).toEqual([
      'return calmFailure("config");',
    ]);
  });
});
