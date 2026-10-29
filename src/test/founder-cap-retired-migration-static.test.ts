import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KNOWN_MONEY_MIGRATIONS,
  REQUIRED_MONEY_MIGRATIONS,
} from "../../scripts/required-money-migrations.mjs";

const ROOT = resolve(__dirname, "../..");
const MIGRATION = "20261029030000_founder_cap_retired.sql";
const PRIOR_SERIALIZATION = "20260915193000_founder_refund_grant_serialization.sql";

const readMigration = (name: string) =>
  readFileSync(resolve(ROOT, "supabase/migrations", name), "utf8").replace(/\r\n/g, "\n");

const capRetired = readMigration(MIGRATION);

describe("founder cap retired migration (PR B)", () => {
  it("sorts after the refund/grant serialization migration it replaces the cap refusal in", () => {
    expect(MIGRATION.localeCompare(PRIOR_SERIALIZATION)).toBeGreaterThan(0);
  });

  it("is known to money migration review but not deploy-required before operator apply", () => {
    expect(KNOWN_MONEY_MIGRATIONS.has(MIGRATION)).toBe(true);
    expect(REQUIRED_MONEY_MIGRATIONS).not.toContain(MIGRATION);
  });

  it("drops the public seats-remaining counter RPC", () => {
    expect(capRetired).toContain(
      "DROP FUNCTION IF EXISTS public.founder_lifetime_slots_remaining();",
    );
  });

  it("removes the pre-insert cap_reached refusal while keeping post-insert seat guards", () => {
    expect(capRetired).not.toMatch(
      /RETURN jsonb_build_object\('ok', false, 'reason', 'cap_reached'/,
    );
    expect(capRetired).toMatch(/IF v_seats_consumed < 100 THEN/);
    expect(capRetired).toMatch(/SELECT public\.founders_seats_consumed\(\) INTO v_seats_consumed;/);
  });

  it("always inserts the lifetime subscription before optional Wall seat minting", () => {
    const insertIdx = capRetired.indexOf("INSERT INTO public.subscriptions (");
    const liveFounderIdx = capRetired.indexOf("IF p_environment = 'live' THEN", insertIdx);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(liveFounderIdx).toBeGreaterThan(insertIdx);
  });
});
