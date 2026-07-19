import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const MIGRATION = readFileSync(
  resolve(ROOT, "supabase/migrations/20260719033500_harden_ai_doctor_sessions_grants.sql"),
  "utf8",
);
const SEED = readFileSync(resolve(ROOT, "supabase/seed.sql"), "utf8");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/security-db-local.yml"), "utf8");

const APPEND_ONLY_GRANTS = [
  "REVOKE ALL ON TABLE public.ai_doctor_sessions",
  "FROM PUBLIC, anon, authenticated",
  "GRANT SELECT, INSERT ON TABLE public.ai_doctor_sessions TO authenticated",
  "GRANT ALL ON TABLE public.ai_doctor_sessions TO service_role",
] as const;

describe("AI Doctor session append-only grant hardening", () => {
  it("removes legacy browser mutation grants and restores only the intended roles", () => {
    for (const contract of APPEND_ONLY_GRANTS) {
      expect(MIGRATION).toContain(contract);
    }

    expect(MIGRATION.indexOf("REVOKE ALL")).toBeLessThan(MIGRATION.indexOf("GRANT SELECT, INSERT"));
    expect(MIGRATION).not.toMatch(/\b(?:DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+public\.)\b/i);
    expect(MIGRATION).not.toMatch(/\b(?:CREATE|DROP)\s+POLICY\b/i);
  });

  it("reapplies the narrow grant contract after the local legacy-parity seed", () => {
    for (const contract of APPEND_ONLY_GRANTS) {
      expect(SEED).toContain(contract);
    }

    expect(SEED.indexOf("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES")).toBeLessThan(
      SEED.indexOf("AI Doctor session history is browser-append-only"),
    );
  });

  it("propagates every logged database-command failure through the workflow", () => {
    const lines = WORKFLOW.split(/\r?\n/);
    const pipedCommands = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.includes("2>&1 | tee"));

    expect(pipedCommands.length).toBeGreaterThan(0);
    for (const { index } of pipedCommands) {
      const guardWindow = lines.slice(Math.max(0, index - 2), index).join("\n");
      expect(guardWindow).toMatch(/set -e?o pipefail/);
    }
  });
});
