/**
 * useInsertManualSnapshotEdit — static safety posture.
 *
 * The client mutation hook must:
 *  - Only call .insert() on manual_sensor_snapshot_edits
 *  - Never call .update()/.upsert()/.delete() anywhere
 *  - Never import or reference service_role / SUPABASE_SERVICE_ROLE_KEY
 *  - Never touch sensor_readings directly
 *  - Never touch AI Doctor / Action Queue / device-control / pheno files
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src", "hooks", "useInsertManualSnapshotEdit.ts"),
  "utf8",
);

describe("useInsertManualSnapshotEdit static safety", () => {
  it("only inserts into manual_sensor_snapshot_edits", () => {
    expect(SRC).toMatch(
      /\.from\(\s*["']manual_sensor_snapshot_edits["']\s*\)[\s\S]*\.insert\(/,
    );
  });

  it("does not call update/upsert/delete anywhere", () => {
    expect(SRC).not.toMatch(/\.update\(/);
    expect(SRC).not.toMatch(/\.upsert\(/);
    expect(SRC).not.toMatch(/\.delete\(/);
  });

  it("never uses service_role client or service key envs", () => {
    // Doc comments may mention "no service_role" for reviewers; guard only
    // against actual client construction / secret env access.
    expect(SRC).not.toMatch(/createClient\s*\([^)]*service_role/i);
    expect(SRC).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(SRC).not.toMatch(/serviceRoleKey/i);
  });

  it("does not touch sensor_readings directly", () => {
    expect(SRC).not.toMatch(/from\(\s*["']sensor_readings["']\s*\)/);
  });

  it("does not import forbidden AI/action-queue/pheno/mcp/device modules", () => {
    for (const forbidden of [
      /from ["']@\/lib\/pheno/,
      /from ["']@\/lib\/mcp\//,
      /aiDoctor/i,
      /actionQueue/i,
      /deviceControl/i,
    ]) {
      expect(SRC).not.toMatch(forbidden);
    }
  });
});
