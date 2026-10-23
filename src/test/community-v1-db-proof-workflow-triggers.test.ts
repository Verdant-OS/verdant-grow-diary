/**
 * Community V1 DB proof must stay manual-only: AGENTS.md forbids push-triggered jobs
 * that probe non-production databases; this workflow uses a disposable local Supabase.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WF_PATH = resolve(__dirname, "../../.github/workflows/community-v1-db-proof.yml");

describe("community-v1-db-proof workflow triggers", () => {
  it("workflow file exists", () => {
    expect(existsSync(WF_PATH)).toBe(true);
  });

  const yml = existsSync(WF_PATH) ? readFileSync(WF_PATH, "utf8") : "";

  it("uses workflow_dispatch and never declares push, pull_request or schedule triggers", () => {
    expect(yml).toMatch(/workflow_dispatch/);
    expect(yml).not.toMatch(/^\s*push:/m);
    expect(yml).not.toMatch(/^\s*pull_request:/m);
    expect(yml).not.toMatch(/^\s*schedule:/m);
  });
});
