/**
 * Sign-in page copy about where a session lives (grower bug item 9).
 *
 * The session is stored per tab (`sessionStorage`, src/integrations/supabase/client.ts),
 * by design (docs/auth-security.md). A new tab starts signed out. Measured in Chromium
 * 2026-11-04: reloading a tab after it crashes keeps that tab's sign-in.
 */
export const AUTH_CRASHED_TAB_RELOAD_COPY =
  "If a Verdant tab crashed, reload that tab to stay signed in." as const;

export const AUTH_CRASHED_TAB_RELOAD_TESTID = "auth-crashed-tab-reload-note" as const;
