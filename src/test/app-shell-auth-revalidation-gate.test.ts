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

  it("withholds pageContent on revalidation_failed (no welcome bounce)", () => {
    expect(APP_SHELL).toMatch(/authStatus === ["']revalidation_failed["']/);
  });
  it("gates useMyEntitlements on authenticated, not cache alone", () => {
    expect(APP_SHELL).toMatch(/useMyEntitlements\(\{/);
    expect(APP_SHELL).toMatch(/enabled:\s*authStatus === ["']authenticated["']/);
  });
});
