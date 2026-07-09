import { test as base, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Authenticated test base for specs in the `chromium-authed` project.
 *
 * The app intentionally keeps the Supabase session in **sessionStorage**
 * (auth hardening — see docs/auth-security.md and
 * src/integrations/supabase/client.ts). Playwright's `storageState` restores
 * only cookies + localStorage, so on its own the authed project starts every
 * test logged out and the app redirects to /auth.
 *
 * auth.setup.ts therefore also snapshots the signed-in page's sessionStorage
 * to e2e/.auth/session-storage.json (gitignored, never uploaded as an
 * artifact). This extended `test` re-injects that snapshot into
 * sessionStorage — for the app origin only — before any page script runs.
 *
 * Authed specs must import { test, expect } from "./lib/authedTest" instead
 * of "@playwright/test".
 */
const SESSION_STORAGE_PATH = path.resolve("e2e/.auth/session-storage.json");

export const test = base.extend({
  context: async ({ context }, use) => {
    if (fs.existsSync(SESSION_STORAGE_PATH)) {
      // { origin, entries } — auth.setup records the origin it actually
      // signed in on (published hosts can 302 to the canonical domain, and
      // sessionStorage is origin-scoped), so we inject on that same origin.
      const saved = JSON.parse(
        fs.readFileSync(SESSION_STORAGE_PATH, "utf-8"),
      ) as { origin: string; entries: Record<string, string> };
      await context.addInitScript(
        (arg: { entries: Record<string, string>; appOrigin: string }) => {
          if (window.location.origin === arg.appOrigin) {
            for (const [key, value] of Object.entries(arg.entries)) {
              window.sessionStorage.setItem(key, value);
            }
          }
        },
        { entries: saved.entries, appOrigin: saved.origin },
      );
    }
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture `use`, not a React hook
    await use(context);
  },
});

export { expect };
