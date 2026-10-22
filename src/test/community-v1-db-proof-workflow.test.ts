/**
 * Contract for .github/workflows/community-v1-db-proof.yml.
 *
 * The workflow must stay manual-only: AGENTS.md forbids push-triggered jobs that
 * probe a non-production database, and this proof runs against disposable local
 * Supabase on the runner.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/community-v1-db-proof.yml");
const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf8");
const doc = yaml.load(WORKFLOW) as {
  on?: { workflow_dispatch?: { inputs?: Record<string, { type?: string; options?: string[] }> } };
  jobs?: Record<string, { steps?: { name?: string; run?: string; with?: { path?: string } }[] }>;
};

describe("community v1 db proof workflow — dispatch-only local proof", () => {
  it("uses workflow_dispatch only (no push, pull_request, or schedule triggers)", () => {
    expect(Object.keys(doc.on ?? {})).toEqual(["workflow_dispatch"]);
    expect(WORKFLOW).not.toMatch(/^\s*push:/m);
    expect(WORKFLOW).not.toMatch(/^\s*pull_request:/m);
    expect(WORKFLOW).not.toMatch(/^\s*schedule:/m);
  });

  it("requires an expect input with red and green modes", () => {
    const expectInput = doc.on?.workflow_dispatch?.inputs?.expect;
    expect(expectInput?.type).toBe("choice");
    expect(expectInput?.options).toEqual(["red", "green"]);
  });

  it("replays migrations locally and runs the security proof scripts", () => {
    const steps = doc.jobs?.["community-v1-db-proof"]?.steps ?? [];
    const names = steps.map((step) => step.name ?? "");
    expect(names.some((name) => name.includes("Prepare immutable migration replay"))).toBe(true);
    expect(names.some((name) => name.includes("Start local Supabase"))).toBe(true);
    const proofStep = steps.find((step) => step.name === "Community V1 runtime proof");
    expect(proofStep?.run).toContain("run-community-v1-db-security.mjs");
    expect(proofStep?.run).toContain("--expect-red");
    const catalogStep = steps.find((step) => step.name === "Community V1 catalog proof");
    expect(catalogStep?.run).toContain("community_v1_permissions.sql");
  });

  it("masks local Supabase credentials before writing GITHUB_ENV", () => {
    expect(WORKFLOW).toMatch(/::add-mask::/);
    expect(WORKFLOW).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(WORKFLOW).toContain("SUPABASE_DB_URL");
  });
});
