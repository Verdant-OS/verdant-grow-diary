import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");

describe("Deprecated auth route redirects", () => {
  it("/login redirects to /auth", () => {
    expect(APP).toMatch(/path="\/login"\s+element=\{<Navigate\s+to="\/auth"/);
  });

  it("/signup redirects to /auth", () => {
    expect(APP).toMatch(/path="\/signup"\s+element=\{<Navigate\s+to="\/auth"/);
  });

  it("/register redirects to /auth", () => {
    expect(APP).toMatch(/path="\/register"\s+element=\{<Navigate\s+to="\/auth"/);
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
    // Only one import for Auth page.
    const importMatches = APP.match(/import\s+Auth\s+from/g);
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
