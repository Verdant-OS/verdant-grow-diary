/**
 * Strategy C audit — pure marketing routes and the global root must not
 * statically import the browser Supabase client. Session-aware public edges
 * and `/_app` opt in via PublicAuthProviders / AppDataProviders.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const ROUTES = resolve(ROOT, "src/routes");

const CLIENT_IMPORT_RE =
  /from\s+["']@\/integrations\/supabase\/client["']|from\s+["']\.\.?\/.*supabase\/client["']/;

/** Routes that intentionally mount PublicAuthProviders (session-aware public). */
const SESSION_AWARE_PUBLIC = new Set([
  "index.tsx",
  "pricing.tsx",
  "auth.tsx",
  "checkout.success.tsx",
  "checkout.cancel.tsx",
  "reset-password.tsx",
  "welcome.tsx",
  "quick-log.tsx",
  "unsubscribe.tsx",
  "founder.tsx",
  "contact.tsx",
  "feedback.tsx",
  "hardware-integrations.tsx",
  "pheno-hunts.$id.compare.tsx",
  "pheno-hunts.$id.showcase.tsx",
  "[.]lovable.oauth.consent.tsx",
]);

function listRouteFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "_app") continue;
      listRouteFiles(full, acc);
    } else if (/\.tsx?$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("SSR provider split — root and pure marketing", () => {
  it("__root does not import Auth, Grows, reconsent, paddle, or supabase client", () => {
    const root = readFileSync(resolve(ROUTES, "__root.tsx"), "utf8");
    // Ignore comment prose; enforce real imports only.
    const importLines = root
      .split("\n")
      .filter((l) => /^\s*import\s/.test(l))
      .join("\n");
    expect(importLines).not.toMatch(CLIENT_IMPORT_RE);
    expect(importLines).not.toMatch(/@\/store\/auth/);
    expect(importLines).not.toMatch(/@\/store\/grows/);
    expect(importLines).not.toMatch(/AgreementReconsentGate/);
    expect(importLines).not.toMatch(/PaymentTestModeBanner/);
    expect(importLines).not.toMatch(/OAuthPostAuthRedirect/);
    expect(importLines).not.toMatch(/AuthProvider/);
    expect(importLines).not.toMatch(/GrowsProvider/);
    // Component tree must not mount session providers.
    expect(root).not.toMatch(/<AuthProvider/);
    expect(root).not.toMatch(/<GrowsProvider/);
  });

  it("/_app mounts AppDataProviders (full private shell)", () => {
    const app = readFileSync(resolve(ROUTES, "_app.tsx"), "utf8");
    expect(app).toMatch(/AppDataProviders/);
    expect(app).toMatch(/AppShell/);
  });

  it("pure marketing routes do not import PublicAuthProviders or supabase client", () => {
    const files = listRouteFiles(ROUTES);
    const offenders: string[] = [];
    for (const file of files) {
      const base = file.split("/").pop() ?? "";
      if (base === "__root.tsx" || base === "_app.tsx") continue;
      if (SESSION_AWARE_PUBLIC.has(base)) continue;
      const src = readFileSync(file, "utf8");
      if (CLIENT_IMPORT_RE.test(src) || src.includes("PublicAuthProviders")) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("session-aware public routes wrap with PublicAuthProviders", () => {
    for (const name of SESSION_AWARE_PUBLIC) {
      const full = resolve(ROUTES, name);
      const src = readFileSync(full, "utf8");
      expect(src, name).toMatch(/PublicAuthProviders/);
    }
  });

  it("lead forms do not statically import the supabase client", () => {
    for (const rel of [
      "src/components/SubscriberInterestForm.tsx",
      "src/components/LeadCaptureForm.tsx",
    ]) {
      const src = readFileSync(resolve(ROOT, rel), "utf8");
      expect(src).not.toMatch(CLIENT_IMPORT_RE);
      expect(src).toMatch(/import\(["']@\/integrations\/supabase\/client["']\)/);
    }
  });

  it("default Auth context is signed-out when no provider is mounted", () => {
    const auth = readFileSync(resolve(ROOT, "src/store/auth.tsx"), "utf8");
    // loading: false outside provider (pure marketing SSR)
    expect(auth).toMatch(/loading:\s*false/);
  });
});
