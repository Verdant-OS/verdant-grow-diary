/**
 * Grows index page — read-only browse with link to /grows/:growId.
 *
 * Asserts:
 *  - /grows route exists in App.tsx
 *  - Page queries grows via Supabase (through useGrows / GrowsProvider)
 *  - Each card links to /grows/:growId
 *  - Empty / error / loading states render
 *  - No ai-coach call, no device-control surface, no service_role
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");
const PAGE = readFileSync(resolve(ROOT, "src/pages/Grows.tsx"), "utf8");
const STORE = readFileSync(resolve(ROOT, "src/store/grows.tsx"), "utf8");
const COMBINED = PAGE + "\n" + STORE;

describe("Grows index page", () => {
  it("registers /grows route in App.tsx", () => {
    expect(APP).toMatch(/path="\/grows"\s+element=\{<Grows\s*\/>\}/);
    expect(APP).toMatch(/import Grows from "\.\/pages\/Grows"/);
  });

  it("queries grows via Supabase (provider + RLS)", () => {
    expect(COMBINED).toMatch(/\.from\(\s*["']grows["']\s*\)[\s\S]{0,200}\.select\(/);
  });

  it("renders grow cards that link to /grows/:growId", () => {
    expect(PAGE).toMatch(/to=\{`\/grows\/\$\{g\.id\}`\}/);
    expect(PAGE).toMatch(/data-testid="grow-card-link"/);
  });

  it("renders empty state when no grows", () => {
    expect(PAGE).toMatch(/data-testid="grows-empty"/);
    expect(PAGE).toContain("No grows yet.");
  });

  it("renders safe error state when load fails", () => {
    expect(PAGE).toMatch(/data-testid="grows-error"/);
    expect(PAGE).toContain("Unable to load grows.");
    expect(STORE).toMatch(/setError\(/);
  });

  it("renders loading state", () => {
    expect(PAGE).toMatch(/data-testid="grows-loading"/);
  });

  it("shows stage, grow_type, started, and notes per card", () => {
    expect(PAGE).toMatch(/stageLabel\(g\.stage\)/);
    expect(PAGE).toMatch(/growTypeLabel\(g\.grow_type\)/);
    expect(PAGE).toMatch(/g\.started_at/);
    expect(PAGE).toMatch(/g\.updated_at/);
    expect(PAGE).toMatch(/g\.notes/);
    expect(PAGE).toMatch(/g\.is_archived[\s\S]{0,200}archived/);
  });

  it("introduces no ai-coach call", () => {
    expect(PAGE).not.toMatch(/["']ai-coach["']/);
    expect(PAGE).not.toMatch(/functions\.invoke/);
  });

  it("introduces no device-control surface or service_role", () => {
    expect(PAGE).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
    expect(PAGE).not.toMatch(/service_role/i);
    expect(STORE).not.toMatch(/service_role/i);
  });
});
