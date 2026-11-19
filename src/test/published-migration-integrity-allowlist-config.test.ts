import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(
  readFileSync("config/published-migration-integrity-allowlist.json", "utf8"),
) as { allow: Array<{ path: string; reason: string }> };

describe("published migration integrity allowlist", () => {
  it("exempts only the owner-approved email_infra deletion", () => {
    expect(config.allow.map((e) => e.path)).toEqual([
      "supabase/migrations/20260707153206_email_infra.sql",
    ]);
  });

  it("gives every exemption a written reason", () => {
    for (const entry of config.allow) expect(entry.reason.trim().length).toBeGreaterThan(20);
  });
});
