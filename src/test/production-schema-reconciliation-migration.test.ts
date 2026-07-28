import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_NAME = "20260728090000_production_schema_reconciliation.sql";
const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const MIGRATION_PATH = resolve(MIGRATIONS_DIR, MIGRATION_NAME);
const sql = readFileSync(MIGRATION_PATH, "utf8");
const flat = sql.replace(/\s+/g, " ");

const PUBLISHED_CONTRACT_HASHES = {
  "20260619083000_add_soil_moisture_calibration_v1.sql":
    "0ae031af23acb0af06bf5262a3edd72331cfe9fc51d12409e241469af2b3cc78",
  "20260706191500_pheno_crosses_foundation.sql":
    "5b9ac7b730b197b33d43e03111561e481657183e1f2580572e3faace8e027a56",
  "20260707120001_pheno_reversals_and_cross_types.sql":
    "99713558236cd425e812f8160eb785089ad6cd441a81ee6ccaa4d6ab19176b73",
  "20260707210000_pheno_crosses_full_taxonomy.sql":
    "1fcd7a15d05df27768719609507ca1ab8ab4e79385ebab6876396e0054044e7f",
} as const;

const SOIL_COLUMNS = [
  "id",
  "user_id",
  "grow_id",
  "tent_id",
  "plant_id",
  "device_id",
  "label",
  "medium",
  "sensor_depth_cm",
  "dry_raw",
  "wet_raw",
  "source",
  "is_active",
  "notes",
  "created_at",
  "updated_at",
] as const;

const CROSS_TYPES = [
  "standard_f1",
  "feminized_cross",
  "selfing_s1",
  "filial",
  "ibl",
  "selfing_sn",
  "feminized_bx",
  "backcross",
  "sib_cross",
  "outcross",
  "line_cross",
  "open_pollination",
  "test_cross",
  "reciprocal_cross",
  "three_way_cross",
] as const;

describe("production schema reconciliation migration", () => {
  it("states the targeted-only boundary and defers the broader ledger drift", () => {
    expect(sql).toContain("This is targeted contract reconciliation");
    expect(sql).toContain("91-file unrecorded-history");
    expect(sql).toContain("bulk/include-all migration push is explicitly out of");
    expect(sql).toContain("Only the four exact historical rows");
  });

  it("uses one unique reconciliation timestamp and leaves published sources byte-identical", () => {
    const migrationNames = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    expect(migrationNames).toContain(MIGRATION_NAME);
    expect(migrationNames.filter((name) => name.startsWith("20260728090000_"))).toEqual([
      MIGRATION_NAME,
    ]);

    for (const [name, expectedHash] of Object.entries(PUBLISHED_CONTRACT_HASHES)) {
      const bytes = readFileSync(resolve(MIGRATIONS_DIR, name));
      expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(expectedHash);
    }
  });

  it("accepts only wholly absent/exact soil and exact pre-taxonomy/final Pheno states", () => {
    expect(sql).toContain("IF v_soil_exists THEN");
    expect(sql).toContain("IF NOT v_soil_exists THEN");
    expect(sql).toContain("refused partial soil_moisture_calibrations columns");
    expect(sql).toContain("refused orphaned soil_moisture_calibrations objects");

    expect(sql).toContain("v_pheno_state := 'post_20260707120001'");
    expect(sql).toContain("v_pheno_state := 'final_20260707210000'");
    expect(sql).toContain("refused partial or unexpected pheno_crosses columns");
    expect(sql).toMatch(
      /IF v_pheno_state = 'post_20260707120001' THEN[\s\S]*?ADD COLUMN channel text/,
    );
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS (channel|generation|recurrent_parent_id)/i);
    expect(sql).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.soil_moisture_calibrations/i);
  });

  it("creates the full 16-column soil contract with checks, indexes, trigger, comments, and RLS", () => {
    const createStart = sql.indexOf("CREATE TABLE public.soil_moisture_calibrations");
    const createEnd = sql.indexOf("$ddl$;", createStart);
    const createTable = sql.slice(createStart, createEnd);

    expect(createStart).toBeGreaterThan(0);
    for (const column of SOIL_COLUMNS) {
      expect(createTable, `soil column ${column}`).toMatch(new RegExp(`\\b${column}\\b`));
    }
    expect(createTable).toContain("CHECK (dry_raw <> wet_raw)");
    expect(createTable).toContain("dry_raw <> 'NaN'::numeric");
    expect(createTable).toContain("wet_raw <> 'NaN'::numeric");
    expect(createTable).toContain("source IN ('manual', 'csv', 'demo')");
    expect(createTable).toContain("sensor_depth_cm >= 0 AND sensor_depth_cm <= 1000");

    for (const index of [
      "soil_moisture_calibrations_user_grow_tent_idx",
      "soil_moisture_calibrations_plant_idx",
      "soil_moisture_calibrations_active_probe_uidx",
    ]) {
      expect(sql).toContain(`CREATE ${index.includes("uidx") ? "UNIQUE " : ""}INDEX ${index}`);
    }
    expect(sql).toContain("CREATE TRIGGER soil_moisture_calibrations_set_updated_at");
    expect(sql).toContain("EXECUTE FUNCTION public.set_updated_at()");
    expect(sql).toContain("COMMENT ON TABLE public.soil_moisture_calibrations");
    expect(sql).toContain(
      "ALTER TABLE public.soil_moisture_calibrations ENABLE ROW LEVEL SECURITY",
    );

    for (const policy of [
      "Users view own soil moisture calibrations",
      "Users insert own soil moisture calibrations",
      "Users update own soil moisture calibrations",
      "Users delete own soil moisture calibrations",
    ]) {
      expect(sql).toContain(`CREATE POLICY "${policy}"`);
    }
    expect(sql).toContain("Users insert own soil moisture calibrations|a|f|t");
    expect(sql).toContain("Users update own soil moisture calibrations|w|t|t");
    expect(sql).toContain("refused noncanonical soil_moisture_calibrations policy commands");
  });

  it("revokes legacy defaults before granting only the canonical new-soil ACL", () => {
    const revoke = sql.search(
      /REVOKE ALL ON TABLE public\.soil_moisture_calibrations\s+FROM PUBLIC, anon, authenticated/,
    );
    const authenticatedGrant = sql.search(
      /GRANT SELECT, INSERT, UPDATE, DELETE\s+ON TABLE public\.soil_moisture_calibrations TO authenticated/,
    );
    const serviceGrant = sql.search(
      /GRANT ALL ON TABLE public\.soil_moisture_calibrations TO service_role/,
    );

    expect(revoke).toBeGreaterThan(0);
    expect(authenticatedGrant).toBeGreaterThan(revoke);
    expect(serviceGrant).toBeGreaterThan(authenticatedGrant);
    expect(sql).not.toMatch(
      /GRANT[\s\S]*?ON(?: TABLE)? public\.soil_moisture_calibrations TO (?:PUBLIC|anon)\b/i,
    );
  });

  it("hardens soil writes against same-user grow, tent, and plant mismatches", () => {
    const insertStart = sql.indexOf('CREATE POLICY "Users insert own soil moisture calibrations"');
    const phenoStart = sql.indexOf("-- Apply the exact 20260707210000 taxonomy", insertStart);
    const hardenedPolicies = sql.slice(insertStart, phenoStart);

    expect(insertStart).toBeGreaterThan(0);
    expect(phenoStart).toBeGreaterThan(insertStart);
    expect(sql).toContain("v_soil_policy_state := 'published'");
    expect(sql).toContain("v_soil_policy_state := 'hardened'");
    expect(sql).toContain('DROP POLICY "Users insert own soil moisture calibrations"');
    expect(sql).toContain('DROP POLICY "Users update own soil moisture calibrations"');
    expect(hardenedPolicies).toContain("g.id = soil_moisture_calibrations.grow_id");
    expect(hardenedPolicies).toContain("t.id = soil_moisture_calibrations.tent_id");
    expect(hardenedPolicies).toContain("t.grow_id = soil_moisture_calibrations.grow_id");
    expect(hardenedPolicies).toContain("p.id = soil_moisture_calibrations.plant_id");
    expect(hardenedPolicies).toContain("p.grow_id = soil_moisture_calibrations.grow_id");
    expect(hardenedPolicies).toContain("p.tent_id = soil_moisture_calibrations.tent_id");
    expect(hardenedPolicies).not.toMatch(/\bt\.grow_id\s*=\s*grow_id\b/);
    expect(hardenedPolicies).not.toMatch(/\bp\.grow_id\s*=\s*grow_id\b/);
    expect(hardenedPolicies).not.toMatch(/\bp\.tent_id\s*=\s*tent_id\b/);
    expect(sql).toContain("schema reconciliation failed hardened soil write policy postcondition");
  });

  it("applies the exact full taxonomy and rebuilds only the two owner write policies", () => {
    for (const crossType of CROSS_TYPES) {
      expect(sql, `cross type ${crossType}`).toContain(`'${crossType}'`);
    }
    for (const channel of [
      "natural_male",
      "colloidal_silver",
      "sts",
      "ga3",
      "rodelization",
      "open_pollination",
    ]) {
      expect(sql, `channel ${channel}`).toContain(`'${channel}'`);
    }

    expect(sql).toContain("ADD CONSTRAINT pheno_crosses_channel_check");
    expect(sql).toContain("ADD CONSTRAINT pheno_crosses_generation_check");
    expect(sql).toContain("ADD CONSTRAINT pheno_crosses_recurrent_parent_by_type");
    expect(sql).toContain("REFERENCES public.pheno_keepers(id) ON DELETE CASCADE");
    expect(sql).toContain("CREATE INDEX pheno_crosses_recurrent_parent_idx");
    expect(sql).toContain("pheno_crosses_insert_own|a|f|t");
    expect(sql).toContain("pheno_crosses_update_own|w|t|t");
    expect(sql).toContain("refused noncanonical pheno_crosses owner policy metadata");

    const droppedOwnerPolicies = [
      ...sql.matchAll(/EXECUTE 'DROP POLICY "([^"]+)" ON public\.pheno_crosses'/g),
    ].map((match) => match[1]);
    expect(droppedOwnerPolicies).toEqual(["pheno_crosses_insert_own", "pheno_crosses_update_own"]);
    expect(sql).not.toMatch(/DROP POLICY[^;\n]*pheno_crosses_pro_required_/i);
  });

  it("accepts only canonical or exact legacy-bloated Pheno ACLs and normalizes both", () => {
    const ownerRefusal = sql.indexOf(
      "schema reconciliation refused unexpected Pheno relation owners",
    );
    const columnRefusal = sql.indexOf("schema reconciliation refused unexpected Pheno column ACLs");
    const grantorRefusal = sql.indexOf(
      "schema reconciliation refused unexpected Pheno ACL grantors",
    );
    const aclRefusal = sql.indexOf("schema reconciliation refused unexpected Pheno ACL shape");
    const revoke = sql.indexOf("'REVOKE ALL PRIVILEGES ON TABLE '");
    const grantorPostcondition = sql.indexOf(
      "schema reconciliation failed canonical Pheno ACL grantor normalization",
    );
    const soilDdl = sql.indexOf("CREATE TABLE public.soil_moisture_calibrations");

    expect(sql).toContain("v_cross_acl_canonical CONSTANT jsonb");
    expect(sql).toContain("v_reversal_acl_canonical CONSTANT jsonb");
    expect(sql).toContain("v_legacy_bloat_acl CONSTANT jsonb");
    expect(sql.match(/"postgres": \[/g)).toHaveLength(3);
    expect(sql).toContain("v_pheno_acl_state := 'canonical'");
    expect(sql).toContain("v_pheno_acl_state := 'known_legacy_default_bloat'");
    expect(ownerRefusal).toBeGreaterThan(0);
    expect(columnRefusal).toBeGreaterThan(ownerRefusal);
    expect(grantorRefusal).toBeGreaterThan(columnRefusal);
    expect(sql).toContain("schema reconciliation refused unexpected Pheno column ACLs");
    expect(sql).toContain("'public.pheno_crosses, public.pheno_reversals '");
    expect(sql).toContain("'FROM PUBLIC, anon, authenticated'");
    expect(sql).toContain("'GRANT DELETE, INSERT, SELECT, UPDATE '");
    expect(sql).toContain("'ON TABLE public.pheno_crosses TO authenticated'");
    expect(sql).toContain("'GRANT INSERT, SELECT '");
    expect(sql).toContain("'ON TABLE public.pheno_reversals TO authenticated'");
    expect(sql).toContain("'public.pheno_crosses, public.pheno_reversals TO service_role'");
    expect(sql).toContain("schema reconciliation failed canonical Pheno ACL normalization");
    expect(aclRefusal).toBeGreaterThan(grantorRefusal);
    expect(revoke).toBeGreaterThan(aclRefusal);
    expect(grantorPostcondition).toBeGreaterThan(revoke);
    expect(soilDdl).toBeGreaterThan(revoke);
    expect(sql).not.toMatch(/\bGRANT\b[\s\S]*?\bTO\s+(?:PUBLIC|anon)\b/i);
  });

  it("rejects every column ACL, non-postgres owners, and alternate grantors before soil DDL", () => {
    // This is source-contract coverage. PGlite is not a repository dependency,
    // and this catalog-heavy migration needs a disposable PostgreSQL/Supabase
    // runtime lane to execute these catalog states and transaction rollback.
    const ownerRefusal = sql.indexOf(
      "schema reconciliation refused unexpected Pheno relation owners",
    );
    const columnRefusal = sql.indexOf("schema reconciliation refused unexpected Pheno column ACLs");
    const grantorRefusal = sql.indexOf(
      "schema reconciliation refused unexpected Pheno ACL grantors",
    );
    const aclRefusal = sql.indexOf("schema reconciliation refused unexpected Pheno ACL shape");
    const revoke = sql.indexOf("'REVOKE ALL PRIVILEGES ON TABLE '");
    const grantorPostcondition = sql.indexOf(
      "schema reconciliation failed canonical Pheno ACL grantor normalization",
    );
    const soilDdl = sql.indexOf("CREATE TABLE public.soil_moisture_calibrations");

    const ownerGuard = sql.slice(sql.lastIndexOf("IF EXISTS (", ownerRefusal), ownerRefusal);
    const columnGuard = sql.slice(sql.lastIndexOf("IF EXISTS (", columnRefusal), columnRefusal);
    const grantorGuard = sql.slice(sql.lastIndexOf("IF EXISTS (", grantorRefusal), grantorRefusal);
    const grantorPostGuard = sql.slice(
      sql.lastIndexOf("IF EXISTS (", grantorPostcondition),
      grantorPostcondition,
    );
    const aclContract = sql.slice(ownerRefusal, soilDdl);

    expect(ownerGuard).toContain("owner_role.rolname IS DISTINCT FROM 'postgres'");
    expect(ownerGuard).toContain("'public.pheno_crosses'::regclass");
    expect(ownerGuard).toContain("'public.pheno_reversals'::regclass");

    expect(columnGuard).toContain("a.attacl IS NOT NULL");
    expect(columnGuard).not.toMatch(/\ba\.attnum\b/);
    expect(columnGuard).not.toMatch(/\ba\.attisdropped\b/);

    expect(grantorGuard).toContain("acl.grantor IS DISTINCT FROM c.relowner");
    expect(grantorPostGuard).toContain("acl.grantor IS DISTINCT FROM c.relowner");
    expect(aclContract).not.toContain("acl.grantee <> c.relowner");

    expect(ownerRefusal).toBeLessThan(columnRefusal);
    expect(columnRefusal).toBeLessThan(grantorRefusal);
    expect(grantorRefusal).toBeLessThan(aclRefusal);
    expect(aclRefusal).toBeLessThan(revoke);
    expect(revoke).toBeLessThan(grantorPostcondition);
    expect(grantorPostcondition).toBeLessThan(soilDdl);
  });

  it("preserves restrictive entitlement policies and row identity/counts", () => {
    expect(sql).toContain("p.polname LIKE 'pheno_crosses_pro_required_%'");
    expect(sql).toContain("p.polname LIKE 'pheno_reversals_pro_required_%'");
    expect(sql).toContain("NOT p.polpermissive");
    expect(sql).toContain("has_pheno_tracker_entitlement\\(auth.uid\\(\\)\\)");

    expect(sql).toContain("v_cross_count_before");
    expect(sql).toContain("v_cross_ids_before");
    expect(sql).toContain("v_reversal_count_before");
    expect(sql).toContain("v_reversal_ids_before");
    expect(sql).toContain("v_soil_count_before");
    expect(sql).toContain("v_soil_ids_before");
    expect(sql).toContain("array_agg(id ORDER BY id)");
    expect(sql).toContain("changed pheno_crosses row identity or count");
    expect(sql).toContain("changed pheno_reversals row identity or count");
    expect(sql).toContain("changed soil_moisture_calibrations row identity or count");
    expect(sql).toContain("v_restrictive_before");
    expect(sql).toContain("v_restrictive_after");
    expect(sql).toContain("changed restrictive Pheno entitlement policies");
    expect(sql).toContain("v_cross_acl_after_normalization");
    expect(sql).toContain("v_reversal_acl_after_normalization");
    expect(sql).toContain("changed normalized canonical Pheno ACLs");
  });

  it("writes exact historical markers only after postconditions and name-collision checks", () => {
    const ledgerStart = sql.lastIndexOf(
      "INSERT INTO supabase_migrations.schema_migrations (version, name, statements)",
    );
    const ledger = sql.slice(ledgerStart).trim();
    const collisionCheck = sql.indexOf(
      "schema reconciliation refused schema_migrations version/name collision",
    );
    const lastPostcondition = sql.indexOf(
      "schema reconciliation changed soil_moisture_calibrations row identity or count",
    );

    expect(ledgerStart).toBeGreaterThan(collisionCheck);
    expect(collisionCheck).toBeGreaterThan(lastPostcondition);
    expect(ledger).toMatch(/ON CONFLICT \(version\) DO NOTHING;$/);

    const expected = [
      ["20260619083000", "add_soil_moisture_calibration_v1"],
      ["20260706191500", "pheno_crosses_foundation"],
      ["20260707120001", "pheno_reversals_and_cross_types"],
      ["20260707210000", "pheno_crosses_full_taxonomy"],
    ] as const;
    for (const [version, name] of expected) {
      expect(ledger).toMatch(
        new RegExp(
          `'${version}',\\s*'${name}',\\s*ARRAY\\['-- reconciled by 20260728090000_production_schema_reconciliation'\\]`,
        ),
      );
    }
    expect(ledger).not.toMatch(/\(\s*'20260728090000'\s*,/);
  });

  it("contains no data deletion, device control, anon grant, or RLS disable", () => {
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\s+public\./i);
    expect(sql).not.toMatch(/\bUPDATE\s+public\./i);
    expect(sql).not.toMatch(
      /device[_-]?control|device_command|execute_device|mqtt|setpoint_write|irrigation_control|light_control|fan_control/i,
    );
    expect(sql).not.toMatch(/\bGRANT\b[\s\S]*?\bTO\s+(?:PUBLIC|anon)\b/i);
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(flat).not.toMatch(/\baction_queue\b/i);
  });
});
