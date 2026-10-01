#!/usr/bin/env -S bun run
/**
 * Runtime harness for the Strain Reference Library V1.1 public read surface
 * (issue #419). Local security lane only.
 *
 * Proves, against a freshly replayed local Supabase:
 *   1. anon and authenticated readers get EXACT approved parity (the same
 *      strict audit the deployment receipt runs) — i.e. the migration SQL
 *      really produces the bundled content;
 *   2. re-applying the V1.1 migration is idempotent (same rows, same parity);
 *   3. draft/archived cultivars, their guides/sections/aliases/claims/source
 *      links, and import staging rows are invisible to anon and authenticated;
 *   4. anon and authenticated cannot insert, update, or delete any reference
 *      or import-staging table.
 *
 * Real anon and authenticated clients exercise PostgREST. The service role is
 * limited to setup, verification, and teardown of harness-owned rows.
 *
 *   bun run scripts/run-cultivar-reference-rls-harness.ts --confirm-local-security-lane
 *
 * Required env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 * SUPABASE_DB_URL on a loopback host, psql on PATH.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CULTIVAR_SOURCES,
  VERDANT_CULTIVARS,
  getCultivarGuideSections,
  getCultivarSources,
} from "../src/constants/strainReferenceLibrary";
import { auditCultivarDatabaseParity } from "../src/lib/cultivarDatabaseParityRules";
import { CULTIVAR_DATABASE_TABLES } from "../src/lib/cultivarDatabaseReadModel";
import {
  fetchPublishedCultivarSnapshot,
  type CultivarReferenceReadClient,
} from "../src/lib/cultivarReferenceService";

const LOCAL_LANE_FLAG = "--confirm-local-security-lane";
const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20260930200000_strain_reference_library_v1_1_parity.sql",
);
const IMPORT_TABLES = ["cultivar_import_batches", "cultivar_import_rows"] as const;

if (!process.argv.includes(LOCAL_LANE_FLAG)) {
  console.log(`[cultivar-reference-rls] SKIP — pass ${LOCAL_LANE_FLAG} to run the local harness.`);
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.SUPABASE_DB_URL;
for (const [name, value] of [
  ["SUPABASE_URL", url],
  ["SUPABASE_ANON_KEY", anonKey],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["SUPABASE_DB_URL", dbUrl],
] as const) {
  if (!value) {
    console.error(`[cultivar-reference-rls] BLOCKED — missing ${name}`);
    process.exit(2);
  }
}
const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"];
if (!loopback.includes(new URL(dbUrl!).hostname.toLowerCase())) {
  console.error("[cultivar-reference-rls] REFUSED — SUPABASE_DB_URL must be a loopback host");
  process.exit(2);
}

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url!, serviceKey!, options);
const anonymous = createClient(url!, anonKey!, options);
const runId = crypto.randomUUID().slice(0, 8);
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail.slice(0, 400)}` : ""}`);
  }
}

async function auditAs(label: string, client: SupabaseClient) {
  const result = await fetchPublishedCultivarSnapshot(
    client as unknown as CultivarReferenceReadClient,
  );
  if (!result.ok) {
    check(`${label} can read the published surface`, false, result.error);
    return null;
  }
  const report = auditCultivarDatabaseParity({
    bundledProfiles: VERDANT_CULTIVARS,
    bundledSources: CULTIVAR_SOURCES,
    bundledSectionsFor: getCultivarGuideSections,
    bundledSourcesFor: getCultivarSources,
    snapshot: result.snapshot,
  });
  check(
    `${label} parity is READY (10 profiles, 140 sections)`,
    report.status === "ready" &&
      report.counts.profiles.database === 10 &&
      report.counts.guideSections.database === 140,
    JSON.stringify({ status: report.status, issues: report.issues.slice(0, 5) }),
  );
  return result.snapshot;
}

async function rowCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of CULTIVAR_DATABASE_TABLES) {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
    counts[table] = error ? -1 : (count ?? -1);
  }
  return counts;
}

async function signedInClient(): Promise<{ client: SupabaseClient; userId: string }> {
  const email = `cultivar-reference-${runId}@verdant.test`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "no user"}`);
  const client = createClient(url!, anonKey!, options);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn: ${signInError.message}`);
  return { client, userId: data.user.id };
}

async function main() {
  console.log("→ published parity as real anon and authenticated readers");
  const { client: authenticated, userId } = await signedInClient();
  await auditAs("anon", anonymous);
  await auditAs("authenticated", authenticated);

  console.log("→ idempotency: re-apply the V1.1 migration");
  const before = await rowCounts();
  try {
    execFileSync("psql", [dbUrl!, "-v", "ON_ERROR_STOP=1", "-q", "-f", MIGRATION], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    check("migration re-applies without error", true);
  } catch (error) {
    check(
      "migration re-applies without error",
      false,
      String((error as { stderr?: string }).stderr ?? error),
    );
  }
  const after = await rowCounts();
  check(
    "re-apply leaves every table's row count unchanged",
    JSON.stringify(before) === JSON.stringify(after),
    JSON.stringify({ before, after }),
  );
  await auditAs("anon after re-apply", anonymous);

  console.log("→ hidden rows: draft/archived cultivars and import staging");
  const created: { table: string; column: string; value: string }[] = [];
  const gg4 = await admin.from("cultivars").select("id").eq("slug", "gg4").single();
  const watts = await admin
    .from("cultivar_sources")
    .select("id")
    .eq("source_key", "watts-2021-terpene-genetics")
    .single();
  try {
    for (const status of ["draft", "archived"] as const) {
      const slug = `harness-${status}-${runId}`;
      const { data: cultivar, error } = await admin
        .from("cultivars")
        .insert({
          canonical_name: `Harness ${status} ${runId}`,
          normalized_name: `harness ${status} ${runId}`,
          slug,
          description: "Harness-only row.",
          publication_status: status,
        })
        .select("id")
        .single();
      if (error || !cultivar) throw new Error(`seed ${status}: ${error?.message}`);
      created.push({ table: "cultivars", column: "id", value: cultivar.id });
      const { data: guide } = await admin
        .from("cultivar_guides")
        .insert({
          cultivar_id: cultivar.id,
          version: 1,
          title: "Harness",
          publication_status: "published",
        })
        .select("id")
        .single();
      if (guide) {
        await admin.from("cultivar_guide_sections").insert({
          guide_id: guide.id,
          section_key: "overview",
          sort_order: 10,
          content: { title: "Harness" },
        });
      }
      await admin.from("cultivar_aliases").insert({
        cultivar_id: cultivar.id,
        alias: `Harness ${status}`,
        normalized_alias: `harness ${status}`,
      });
      await admin.from("cultivar_profile_sources").insert({
        cultivar_id: cultivar.id,
        source_id: watts.data?.id,
        sort_order: 0,
      });
      await admin.from("cultivar_claims").insert({
        cultivar_id: cultivar.id,
        trait_key: "chemotype",
        value_text: "unknown",
        source_id: watts.data?.id,
      });
    }
    // A draft guide version on a PUBLISHED cultivar must stay hidden too.
    const { data: draftGuide } = await admin
      .from("cultivar_guides")
      .insert({
        cultivar_id: gg4.data?.id,
        version: 99,
        title: "Harness draft",
        publication_status: "draft",
      })
      .select("id")
      .single();
    if (draftGuide) created.push({ table: "cultivar_guides", column: "id", value: draftGuide.id });
    const { data: batch } = await admin
      .from("cultivar_import_batches")
      .insert({ filename: "harness.csv", file_checksum: `harness-${runId}` })
      .select("id")
      .single();
    if (batch) {
      created.push({ table: "cultivar_import_batches", column: "id", value: batch.id });
      await admin
        .from("cultivar_import_rows")
        .insert({ batch_id: batch.id, row_number: 1, raw_payload: {} });
    }

    for (const [label, client] of [
      ["anon", anonymous],
      ["authenticated", authenticated],
    ] as const) {
      const snapshot = await auditAs(`${label} with hidden rows present`, client);
      if (snapshot) {
        const hiddenIds = new Set(
          created.filter((item) => item.table === "cultivars").map((item) => item.value),
        );
        const leaks = [
          ...snapshot.cultivars.filter((row) => String(row.slug).startsWith("harness-")),
          ...snapshot.cultivar_aliases.filter((row) => hiddenIds.has(String(row.cultivar_id))),
          ...snapshot.cultivar_claims.filter((row) => hiddenIds.has(String(row.cultivar_id))),
          ...snapshot.cultivar_profile_sources.filter((row) =>
            hiddenIds.has(String(row.cultivar_id)),
          ),
          ...snapshot.cultivar_guides.filter(
            (row) => hiddenIds.has(String(row.cultivar_id)) || row.version === 99,
          ),
        ];
        check(
          `${label} sees no draft/archived rows or draft guide versions`,
          leaks.length === 0,
          JSON.stringify(leaks.slice(0, 3)),
        );
        const { data: unfilteredGuides } = await client
          .from("cultivar_guides")
          .select("id,version");
        check(
          `${label} cannot read a draft guide even without a filter`,
          !(unfilteredGuides ?? []).some((row) => row.version === 99),
        );
      }
      for (const table of IMPORT_TABLES) {
        const { data, error } = await client.from(table).select("id");
        check(`${label} cannot read ${table}`, Boolean(error) || (data ?? []).length === 0);
      }
    }

    console.log("→ client writes are rejected on every reference and staging table");
    const probeId = gg4.data?.id ?? "00000000-0000-0000-0000-000000000000";
    for (const [label, client] of [
      ["anon", anonymous],
      ["authenticated", authenticated],
    ] as const) {
      for (const table of [...CULTIVAR_DATABASE_TABLES, ...IMPORT_TABLES]) {
        const insert = await client.from(table).insert({}).select();
        check(
          `${label} cannot insert into ${table}`,
          Boolean(insert.error) || (insert.data ?? []).length === 0,
        );
      }
      const update = await client
        .from("cultivars")
        .update({ description: "tampered" })
        .eq("id", probeId)
        .select();
      check(
        `${label} cannot update cultivars`,
        Boolean(update.error) || (update.data ?? []).length === 0,
      );
      const remove = await client
        .from("cultivar_guide_sections")
        .delete()
        .neq("section_key", "")
        .select();
      check(
        `${label} cannot delete guide sections`,
        Boolean(remove.error) || (remove.data ?? []).length === 0,
      );
      const removeLinks = await client
        .from("cultivar_profile_sources")
        .delete()
        .eq("cultivar_id", probeId)
        .select();
      check(
        `${label} cannot delete profile sources`,
        Boolean(removeLinks.error) || (removeLinks.data ?? []).length === 0,
      );
    }
    const { data: untouched } = await admin
      .from("cultivars")
      .select("description")
      .eq("id", probeId)
      .single();
    check(
      "published content is unchanged after write attempts",
      untouched?.description !== "tampered",
    );
    await auditAs("anon after write attempts", anonymous);
  } finally {
    console.log("→ teardown (service role, harness-owned rows only)");
    for (const item of created.reverse()) {
      await admin.from(item.table).delete().eq(item.column, item.value);
    }
    await admin.auth.admin.deleteUser(userId);
  }

  console.log(`\n[cultivar-reference-rls] ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(
    `[cultivar-reference-rls] FAIL — ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
});
