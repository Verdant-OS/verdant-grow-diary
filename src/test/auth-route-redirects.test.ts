import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");

describe("Deprecated auth route redirects", () => {
  it("/login redirects through the context-preserving alias", () => {
    expect(APP).toMatch(/path="\/login"\s+element=\{<RouteAliasRedirect\s+to="\/auth"\s*\/>\}/);
  });

  it("/signup redirects to signup mode through the context-preserving alias", () => {
    expect(APP).toMatch(
      /path="\/signup"\s+element=\{<RouteAliasRedirect\s+to="\/auth\?mode=signup"\s*\/>\}/,
    );
  });

  it("/register redirects to signup mode through the context-preserving alias", () => {
    expect(APP).toMatch(
      /path="\/register"\s+element=\{<RouteAliasRedirect\s+to="\/auth\?mode=signup"\s*\/>\}/,
    );
  });

  it("/auth route still exists directly (regression guard)", () => {
    expect(APP).toMatch(/path="\/auth"\s+element=\{<Auth\s*\/>\}/);
  });

  it("/features redirects to /welcome", () => {
    expect(APP).toMatch(/path="\/features"\s+element=\{<Navigate\s+to="\/welcome"/);
  });
});

describe("Auth route redirects — static safety", () => {
  it("does not duplicate the Auth page component", () => {
    // Only one import for the Auth page. Pages are code-split via React.lazy,
    // so App.tsx pulls them in with a dynamic import("./pages/Auth").
    const importMatches = APP.match(/import\(\s*["']\.\/pages\/Auth["']\s*\)/g);
    expect(importMatches).toHaveLength(1);
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
