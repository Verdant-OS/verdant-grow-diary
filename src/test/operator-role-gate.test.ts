/**
 * Operator role gate — static audit (TanStack file routes).
 *
 * Confirms every `/operator/*` URL is mounted under `/_app/_operator`
 * (RequireOperatorRole layout), so role-restricted surfaces require
 * server-side has_role('operator') in addition to auth.
 *
 * Also confirms:
 *  - RequireOperatorRole uses useHasRole("operator") (server-side RPC).
 *  - Public Customer/marketing routes remain unwrapped.
 *  - The guard never references service_role or token internals.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  extractMountedAppRoutePaths,
  getMountedOperatorPaths,
  isMountedUnderOperatorLayout,
  readAllRouteModuleSources,
} from "./helpers/routeManifestSyncHarness";

const ROUTES_SRC = readAllRouteModuleSources();
const GUARD = fs.readFileSync(
  path.resolve(__dirname, "../components/RequireOperatorRole.tsx"),
  "utf8",
);

const ALL_OPERATOR_PATHS = getMountedOperatorPaths();

describe("Slice A — Operator routes are role-gated", () => {
  it("operator layout imports the RequireOperatorRole guard", () => {
    expect(ROUTES_SRC).toMatch(/RequireOperatorRole/);
    expect(ROUTES_SRC).toMatch(/createFileRoute\(\s*["']\/_app\/_operator["']/);
  });

  it("at least one /operator/* route is present (sanity)", () => {
    expect(ALL_OPERATOR_PATHS.length).toBeGreaterThan(0);
  });

  it.each(ALL_OPERATOR_PATHS)("%s is mounted under /_app/_operator", (p) => {
    expect(isMountedUnderOperatorLayout(p)).toBe(true);
  });

  it("no /operator/* route is left outside the operator layout", () => {
    const ungated = ALL_OPERATOR_PATHS.filter((p) => !isMountedUnderOperatorLayout(p));
    expect(ungated).toEqual([]);
  });
});

describe("Slice A — RequireOperatorRole guard contract", () => {
  it("delegates to server-side useHasRole('operator')", () => {
    expect(GUARD).toMatch(/useHasRole\(\s*["']operator["']\s*\)/);
  });

  it("renders <Outlet /> only when role status is granted", () => {
    expect(GUARD).toMatch(/status\s*!==?\s*["']granted["']/);
    expect(GUARD).toMatch(/<Outlet\s*\/>/);
  });

  it("does not reference service_role, tokens, or raw payloads", () => {
    expect(GUARD).not.toMatch(/service_role/i);
    expect(GUARD).not.toMatch(/access_token|bearer|raw_payload/i);
  });
});

describe("Slice A — Denied state copy is calm and leak-free", () => {
  it("uses the approved access-restricted copy", () => {
    expect(GUARD).toContain("This account does not have operator access.");
    expect(GUARD).toContain(
      "Use an operator-role account or ask the project owner to grant operator access.",
    );
    expect(GUARD).toContain("No operator data was loaded.");
    expect(GUARD).toContain("Signed in, but email is unavailable.");
  });

  it("leaks no internal identifiers or auth internals in the denied JSX", () => {
    const start = GUARD.indexOf('data-testid="require-operator-denied"');
    expect(start).toBeGreaterThan(-1);
    const end = GUARD.indexOf("return <Outlet", start);
    const denied = GUARD.slice(start, end);
    expect(denied).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    for (const banned of ["user_roles", "has_role", "service_role", "jwt", "auth.uid", "token"]) {
      expect(denied.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
});

describe("Slice A — Public/customer routes remain unaffected", () => {
  const PUBLIC = ["/auth", "/welcome", "/pricing", "/hardware-integrations", "/billing/:plan"];
  it.each(PUBLIC)("%s is not under the operator layout", (p) => {
    expect(isMountedUnderOperatorLayout(p)).toBe(false);
    expect(extractMountedAppRoutePaths()).toContain(p);
  });
});
