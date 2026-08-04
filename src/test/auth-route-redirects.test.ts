import { describe, it, expect } from "vitest";
import {
  extractMountedAppRoutePaths,
  getRouteAliasRedirectTarget,
  readAllRouteModuleSources,
} from "./helpers/routeManifestSyncHarness";

const APP = readAllRouteModuleSources();

describe("Deprecated auth route redirects", () => {
  it("/login redirects through the context-preserving alias", () => {
    expect(extractMountedAppRoutePaths()).toContain("/login");
    expect(getRouteAliasRedirectTarget("/login")).toBe("/auth");
  });

  it("/signup redirects to signup mode through the context-preserving alias", () => {
    expect(extractMountedAppRoutePaths()).toContain("/signup");
    expect(getRouteAliasRedirectTarget("/signup")).toBe("/auth?mode=signup");
  });

  it("/register redirects to signup mode through the context-preserving alias", () => {
    expect(extractMountedAppRoutePaths()).toContain("/register");
    expect(getRouteAliasRedirectTarget("/register")).toBe("/auth?mode=signup");
  });

  it("/auth route still exists directly (regression guard)", () => {
    expect(extractMountedAppRoutePaths()).toContain("/auth");
    expect(APP).toMatch(/Auth|@\/pages\/Auth|pages\/Auth/);
  });

  it("/features redirects to /welcome through the context-preserving alias", () => {
    expect(extractMountedAppRoutePaths()).toContain("/features");
    expect(getRouteAliasRedirectTarget("/features")).toBe("/welcome");
  });
});

describe("Auth route redirects — static safety", () => {
  it("does not duplicate the Auth page component", () => {
    // Auth is mounted once via createFileRoute + @/pages/Auth import.
    const importMatches = APP.match(/@\/pages\/Auth|from\s+["'][^"']*pages\/Auth["']/g) ?? [];
    expect(importMatches.length).toBeGreaterThanOrEqual(1);
    // No classic lazy("./pages/Auth") duplicates.
    const classic = APP.match(/import\(\s*["']\.\/pages\/Auth["']\s*\)/g) ?? [];
    expect(classic).toHaveLength(0);
  });

  it("does not introduce new Supabase auth logic", () => {
    expect(APP).not.toMatch(/supabase\.auth\.(signIn|signUp|signOut|resetPassword)/);
    expect(APP).not.toMatch(/supabase\.auth\.(onAuthStateChange|getUser|getSession)/);
  });

  it("does not introduce schema/RLS/RPC changes in route file", () => {
    expect(APP).not.toMatch(/service_role/);
    expect(APP).not.toMatch(/CREATE TABLE|CREATE POLICY|GRANT/);
    expect(APP).not.toMatch(/rpc\s*\(/);
  });

  it("does not introduce device-control or automation language", () => {
    expect(APP).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
    expect(APP).not.toMatch(/autopilot|auto[- ]?execute|auto[- ]?run/i);
  });
});
