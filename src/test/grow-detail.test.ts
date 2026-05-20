/**
 * GrowDetail page — read-only grow hub.
 *
 * Asserts:
 *  - /grows/:growId route registered.
 *  - Loads grow by id via authenticated client + maybeSingle.
 *  - Safe not-found / RLS-blocked state.
 *  - Hub links to Timeline, Plants, Tents, Action Queue.
 *  - No writes from this page (no .insert/.update/.delete/.upsert/.rpc).
 *  - No device-control surface or service_role.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");
const PAGE = readFileSync(resolve(ROOT, "src/pages/GrowDetail.tsx"), "utf8") + "\n" + readFileSync(resolve(ROOT, "src/hooks/useGrowDetailData.ts"), "utf8") + "\n" + readFileSync(resolve(ROOT, "src/lib/growStatus.ts"), "utf8");

describe("GrowDetail", () => {
  it("registers /grows/:growId route in App.tsx", () => {
    expect(APP).toMatch(/path="\/grows\/:growId"\s+element=\{<GrowDetail\s*\/>\}/);
    expect(APP).toMatch(/import GrowDetail from "\.\/pages\/GrowDetail"/);
  });

  it("uses useParams growId from URL", () => {
    expect(PAGE).toMatch(/useParams<\{\s*growId:\s*string\s*\}>/);
  });

  it("queries grows by id with maybeSingle (safe not-found)", () => {
    expect(PAGE).toMatch(
      /\.from\(\s*["']grows["']\s*\)[\s\S]{0,400}\.eq\(\s*["']id["']\s*,\s*growId\s*\)[\s\S]{0,80}\.maybeSingle\(\)/,
    );
  });

  it("renders a not-found / RLS-blocked safe state", () => {
    expect(PAGE).toMatch(/Grow not found/);
    expect(PAGE).toMatch(/do not have access/);
  });

  it("renders hub links to Timeline, Plants, Tents, Action Queue", () => {
    expect(PAGE).toMatch(/\/timeline\?growId=/);
    expect(PAGE).toMatch(/\/plants\?growId=/);
    expect(PAGE).toMatch(/\/tents\?growId=/);
    expect(PAGE).toMatch(/\/actions\?growId=/);
  });

  it("is read-only — no writes from this page", () => {
    expect(PAGE).not.toMatch(/\.insert\(/);
    expect(PAGE).not.toMatch(/\.update\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/\.rpc\(/);
  });

  it("introduces no device-control surface or service_role", () => {
    expect(PAGE).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
    expect(PAGE).not.toMatch(/service_role/i);
  });
});
