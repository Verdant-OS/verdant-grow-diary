#!/usr/bin/env node
/**
 * Fast, dependency-independent contract for the Supabase SSR hardening slice.
 * The runtime smoke remains the stronger proof; this scanner fails early with
 * actionable output before the app bundle is imported.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const client = read("src/integrations/supabase/client.ts");
const oauth = read("src/lib/mcp/browserOAuthClient.ts");
const server = read("src/server.ts");
const errorPage = read("src/lib/error-page.ts");

const failures = [];
const requirePattern = (body, pattern, message) => {
  if (!pattern.test(body)) failures.push(message);
};

requirePattern(
  client,
  /createSupabaseAuthRuntime/,
  "Supabase client must obtain storage and auth lifecycle flags from createSupabaseAuthRuntime().",
);
requirePattern(
  client,
  /detectSessionInUrl:\s*authRuntime\.detectSessionInUrl/,
  "Supabase client must explicitly disable URL session detection during SSR.",
);
requirePattern(
  client,
  /SupabaseInitializationError/,
  "Supabase initialization failures must be wrapped in a stable classified error.",
);
requirePattern(
  server,
  /createSsrErrorResponse/,
  "SSR server must render classified HTML failures with safe diagnostic headers.",
);
requirePattern(
  errorPage,
  /robots[^>]*noindex/i,
  "SSR error HTML must tell crawlers not to index the failure page.",
);

if (/(^|[^\w$.])sessionStorage\s*\./m.test(oauth)) {
  failures.push(
    "browserOAuthClient.ts contains bare sessionStorage member access; route it through a window-safe resolver.",
  );
}

if (failures.length) {
  console.error("Supabase SSR hardening contract failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Supabase SSR hardening contract: PASS");
