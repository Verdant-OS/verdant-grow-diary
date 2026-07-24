import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  auditSubscriberGrowthMigrationContract,
  SUBSCRIBER_GROWTH_MIGRATION_CONTRACT,
} from "../../scripts/releases/subscriber-growth-migration-contract.mjs";

describe("subscriber growth migration contract", () => {
  it("accepts all fixed repository migrations and their safety fences", () => {
    const audit = auditSubscriberGrowthMigrationContract((file: string) =>
      readFileSync(resolve(process.cwd(), file), "utf8"),
    );
    expect(audit).toMatchObject({ ok: true, migrationsPassed: 5, migrationsTotal: 5 });
    expect(audit.issues).toEqual([]);
  });

  it("fails closed for a missing migration, marker, or forbidden grant", () => {
    const sources = Object.fromEntries(
      SUBSCRIBER_GROWTH_MIGRATION_CONTRACT.map((contract) => [
        contract.path,
        contract.markers.join("\n"),
      ]),
    );
    const [lead, growth, signup] = SUBSCRIBER_GROWTH_MIGRATION_CONTRACT;
    delete sources[signup.path];
    sources[growth.path] = sources[growth.path].replace("bs.status = 'active'", "");
    sources[lead.path] += "\nGRANT SELECT ON public.leads TO anon;";

    const audit = auditSubscriberGrowthMigrationContract((file: string) => {
      if (!(file in sources)) throw new Error("missing");
      return sources[file];
    });

    expect(audit.ok).toBe(false);
    expect(audit.migrationsPassed).toBe(2);
    expect(audit.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("missing_file"),
        expect.stringContaining("missing_marker:bs.status = 'active'"),
        expect.stringContaining("forbidden_pattern"),
      ]),
    );
  });
});
