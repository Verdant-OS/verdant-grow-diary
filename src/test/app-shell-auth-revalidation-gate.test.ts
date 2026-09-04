/**
 * #588 — AppShell must withhold protected pageContent until useRequireAuth
 * (getUser) settles, and must not enable alerts while status is still loading.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const APP_SHELL = readFileSync(resolve(__dirname, "../..", "src/components/AppShell.tsx"), "utf8");

describe("AppShell auth revalidation gate (#588)", () => {
  it("holds the loading shell while authStatus is loading", () => {
    expect(APP_SHELL).toMatch(/authStatus === ["']loading["']/);
    expect(APP_SHELL).toMatch(/!hydrated \|\| loading \|\| authStatus === ["']loading["']/);
  });

  it("does not mount pageContent for unauthenticated after revalidation", () => {
    expect(APP_SHELL).toMatch(/authStatus === ["']unauthenticated["']/);
  });

  it("gates useAlertsList on server-validated session, not cache alone", () => {
    expect(APP_SHELL).toMatch(/authStatus === ["']authenticated["']/);
    expect(APP_SHELL).toMatch(/enabled:\s*sessionReady/);
    // Must not re-introduce the cache-only enable.
    expect(APP_SHELL).not.toMatch(/enabled:\s*!loading && !!user\s*}/);
  });

  it("withholds pageContent on revalidation_failed (no welcome bounce), but never as a dead end", () => {
    expect(APP_SHELL).toMatch(/authStatus === ["']revalidation_failed["']/);
    const start = APP_SHELL.indexOf('if (authStatus === "revalidation_failed")');
    const end = APP_SHELL.indexOf('if (!user || authStatus === "unauthenticated") return null;');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const branch = APP_SHELL.slice(start, end);
    // Still fail-closed for private REST: no page content, no Outlet, no bounce.
    expect(branch).not.toMatch(/pageContent|<Outlet|nav\(|navigate\(/);
    // Recoverable: Retry re-runs getUser; sign-out stays explicit.
    expect(branch).toMatch(/data-testid="app-shell-revalidation-failed"/);
    expect(branch).toMatch(/retryAuth\(/);
    expect(branch).toMatch(/SignOutConfirmDialog/);
    expect(branch).not.toMatch(/Loading…/);
  });
});
