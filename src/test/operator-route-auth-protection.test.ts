// Operator/Customer route protection audit (TanStack file routes).
//
// Confirms via static inspection that:
//  - protected routes live under the `/_app` layout (AppShell / useRequireAuth).
//  - public/Customer routes live outside `/_app`.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  extractMountedAppRoutePaths,
  extractTanstackRouteIds,
  tanstackRouteIdToClassicPath,
} from "./helpers/routeManifestSyncHarness";

const MOUNTED = extractMountedAppRoutePaths();

/** Classic paths served under the pathless `/_app` layout (auth shell). */
function isUnderAppShell(classicPath: string): boolean {
  for (const id of extractTanstackRouteIds()) {
    if (!id.startsWith("/_app")) continue;
    if (id === "/_app") continue;
    if (tanstackRouteIdToClassicPath(id) === classicPath) return true;
  }
  return false;
}

const PROTECTED = new Set(MOUNTED.filter(isUnderAppShell));
const PUBLIC = new Set(MOUNTED.filter((p) => !isUnderAppShell(p)));

const REQUIRED_PROTECTED = [
  "/operator/ecowitt",
  "/operator/one-tent-proof-record",
  "/operator/demo-preview",
  "/operator/subscriber-growth",
  "/diagnostics",
  "/pi-ingest-status",
  "/ingest-inspector",
  "/sensors",
  "/sensors/ecowitt-audit",
  "/sensors/ingest-normalizer",

  "/actions",
  "/admin/leads",
  "/leads",
  "/settings",
];

const REQUIRED_PUBLIC = [
  "/auth",
  "/reset-password",
  "/welcome",
  "/pricing",
  "/hardware-integrations",
  "/quick-log",
];

describe("Operator routes require authenticated AppShell", () => {
  for (const p of REQUIRED_PROTECTED) {
    it(`${p} is mounted inside the AppShell-protected block`, () => {
      expect(PROTECTED.has(p)).toBe(true);
      expect(PUBLIC.has(p)).toBe(false);
    });
  }
});

describe("Customer/public routes stay accessible without auth", () => {
  for (const p of REQUIRED_PUBLIC) {
    it(`${p} is mounted in the public block (NOT under AppShell)`, () => {
      expect(PUBLIC.has(p)).toBe(true);
      expect(PROTECTED.has(p)).toBe(false);
    });
  }
});

describe("AppShell protected boundary", () => {
  it("AppShell sends signed-out visitors to the public landing", () => {
    const shell = fs.readFileSync(path.resolve(__dirname, "../components/AppShell.tsx"), "utf8");
    // The destination is built by buildSignedOutRedirect, which always
    // resolves to /welcome (with an optional manifest-validated redirectTo).
    expect(shell).toMatch(
      /const signedOutRedirect = buildSignedOutRedirect\(\s*location\.pathname,\s*location\.search,\s*location\.hash,?\s*\)/,
    );
    expect(shell).toMatch(/useRequireAuth\(\s*signedOutRedirect\s*\)/);
    expect(shell).not.toMatch(/useRequireAuth\(\s*["']\/auth["']\s*\)/);
  });

  it("useRequireAuth navigates unauthenticated users to /auth (replace)", () => {
    const hook = fs.readFileSync(path.resolve(__dirname, "../hooks/useRequireAuth.ts"), "utf8");
    expect(hook).toMatch(/nav\(redirectTo,\s*\{\s*replace:\s*true\s*\}\)/);
    expect(hook).toMatch(/redirectTo:\s*string\s*=\s*"\/auth"/);
  });

  it("does not reference service_role or pull_request_target", () => {
    const routesSrc = fs.readFileSync(path.resolve(__dirname, "../routes/__root.tsx"), "utf8");
    expect(routesSrc).not.toMatch(/service_role/i);
    expect(routesSrc).not.toMatch(/pull_request_target/i);
  });
});
