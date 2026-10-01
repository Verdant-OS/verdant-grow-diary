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
import { classifySupabasePublicReadKey } from "../src/lib/supabasePublicReadKeyRules";

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
const anonKeyClass = classifySupabasePublicReadKey(anonKey);
if (!anonKeyClass.ok) {
  console.error(
    `[cultivar-reference-rls] REFUSED — SUPABASE_ANON_KEY is not a public key (${anonKeyClass.reason})`,
  );
  process.exit(2);
}
const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"];
// Both endpoints must be local: the service role below performs setup writes
// and auth-user creation through SUPABASE_URL, not only through the DB URL.
for (const [name, value] of [
  ["SUPABASE_DB_URL", dbUrl],
  ["SUPABASE_URL", url],
] as const) {
  let host: string;
  try {
    host = new URL(value!).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    host = "";
  }
  if (!loopback.includes(host)) {
    console.error(`[cultivar-reference-rls] REFUSED — ${name} must be a loopback host`);
    process.exit(2);
  }
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

function seeded<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`seed ${label}: ${result.error.message}`);
  return result.data;
}

function seededRow<T>(
  label: string,
  result: { data: T; error: { message: string } | null },
): NonNullable<T> {
  if (result.error || result.data === null) {
    throw new Error(`seed ${label}: ${result.error?.message ?? "no row returned"}`);
  }
  return result.data as NonNullable<T>;
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
  // Resolve real published rows first: a failed lookup must stop the harness,
  // never leave probes aimed at an undefined or nonexistent id.
  const gg4 = {
    data: seededRow(
      "gg4 cultivar lookup",
      await admin.from("cultivars").select("id").eq("slug", "gg4").single(),
    ),
  };
  const watts = {
    data: seededRow(
      "watts source lookup",
      await admin
        .from("cultivar_sources")
        .select("id")
        .eq("source_key", "watts-2021-terpene-genetics")
        .single(),
    ),
  };
  const sourceIds = new Map<string, string>();
  for (const key of [
    "sour-diesel-public-profile",
    "og-kush-public-profile",
    "blue-dream-public-profile",
  ]) {
    const data = seededRow(
      `${key} source lookup`,
      await admin.from("cultivar_sources").select("id").eq("source_key", key).single(),
    );
    sourceIds.set(key, data.id);
  }
  let hiddenCultivarId: string | null = null;
  let hiddenSectionId: string | null = null;
  let draftGuideId: string | null = null;
  const hiddenGuideIds: string[] = [];
  const hiddenSectionIds: string[] = [];
  let batchId: string | null = null;
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
      const guide = seededRow(
        `${status} guide`,
        await admin
          .from("cultivar_guides")
          .insert({
            cultivar_id: cultivar.id,
            version: 1,
            title: "Harness",
            publication_status: "published",
          })
          .select("id")
          .single(),
      );
      {
        hiddenGuideIds.push(guide.id);
        const section = seededRow(
          `${status} section`,
          await admin
            .from("cultivar_guide_sections")
            .insert({
              guide_id: guide.id,
              section_key: "overview",
              sort_order: 10,
              content: { title: "Harness" },
            })
            .select("id")
            .single(),
        );
        if (status === "draft") hiddenSectionId = section.id;
        hiddenSectionIds.push(section.id);
      }
      if (status === "draft") hiddenCultivarId = cultivar.id;
      seeded(
        `${status} alias`,
        await admin.from("cultivar_aliases").insert({
          cultivar_id: cultivar.id,
          alias: `Harness ${status}`,
          normalized_alias: `harness ${status}`,
        }),
      );
      seeded(
        `${status} profile source`,
        await admin.from("cultivar_profile_sources").insert({
          cultivar_id: cultivar.id,
          source_id: watts.data?.id,
          sort_order: 0,
        }),
      );
      seeded(
        `${status} claim`,
        await admin.from("cultivar_claims").insert({
          cultivar_id: cultivar.id,
          trait_key: "chemotype",
          value_text: "unknown",
          source_id: watts.data?.id,
        }),
      );
    }
    // A draft guide version on a PUBLISHED cultivar must stay hidden too.
    const draftGuide = seededRow(
      "draft guide",
      await admin
        .from("cultivar_guides")
        .insert({
          cultivar_id: gg4.data?.id,
          version: 99,
          title: "Harness draft",
          publication_status: "draft",
        })
        .select("id")
        .single(),
    );
    {
      created.push({ table: "cultivar_guides", column: "id", value: draftGuide.id });
      draftGuideId = draftGuide.id;
      hiddenGuideIds.push(draftGuide.id);
      const draftSection = seededRow(
        "draft guide section",
        await admin
          .from("cultivar_guide_sections")
          .insert({
            guide_id: draftGuide.id,
            section_key: "overview",
            sort_order: 10,
            content: { title: "Harness draft guide section" },
          })
          .select("id")
          .single(),
      );
      hiddenSectionIds.push(draftSection.id);
    }
    // Every hidden section carries a source link, so the direct child-table
    // probes below have real rows to (not) find.
    for (const sectionId of hiddenSectionIds) {
      seeded(
        "hidden section link",
        await admin.from("cultivar_guide_section_sources").insert({
          guide_section_id: sectionId,
          source_id: watts.data?.id,
          support_note: "Harness hidden link.",
        }),
      );
    }
    const batch = seededRow(
      "import batch",
      await admin
        .from("cultivar_import_batches")
        .insert({ filename: "harness.csv", file_checksum: `harness-${runId}` })
        .select("id")
        .single(),
    );
    {
      created.push({ table: "cultivar_import_batches", column: "id", value: batch.id });
      batchId = batch.id;
      seeded(
        "import row",
        await admin
          .from("cultivar_import_rows")
          .insert({ batch_id: batch.id, row_number: 1, raw_payload: {} }),
      );
    }

    {
      const { count: sectionCount } = await admin
        .from("cultivar_guide_sections")
        .select("*", { count: "exact", head: true })
        .in("guide_id", hiddenGuideIds);
      const { count: linkCount } = await admin
        .from("cultivar_guide_section_sources")
        .select("*", { count: "exact", head: true })
        .in("guide_section_id", hiddenSectionIds);
      check(
        "hidden child rows exist for the direct probes (service-role view)",
        (sectionCount ?? 0) >= 3 && (linkCount ?? 0) >= 3,
        JSON.stringify({ sectionCount, linkCount }),
      );
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
      {
        const sections = await client
          .from("cultivar_guide_sections")
          .select("id")
          .in("guide_id", hiddenGuideIds);
        check(
          `${label} cannot read sections of hidden guides directly`,
          Boolean(sections.error) || (sections.data ?? []).length === 0,
          JSON.stringify(sections.data?.slice(0, 3)),
        );
        const links = await client
          .from("cultivar_guide_section_sources")
          .select("guide_section_id")
          .in("guide_section_id", hiddenSectionIds);
        check(
          `${label} cannot read source links of hidden sections directly`,
          Boolean(links.error) || (links.data ?? []).length === 0,
          JSON.stringify(links.data?.slice(0, 3)),
        );
      }
      for (const table of IMPORT_TABLES) {
        const { data, error } = await client.from(table).select("id");
        check(`${label} cannot read ${table}`, Boolean(error) || (data ?? []).length === 0);
      }
    }

    console.log("→ client writes are rejected on every reference and staging table");
    const probeId = gg4.data.id;
    const wattsId = watts.data?.id;
    if (!wattsId || !hiddenCultivarId || !hiddenSectionId || !draftGuideId || !batchId) {
      throw new Error("harness setup did not produce every id the insert probes need");
    }
    const probeSource: Record<string, string | undefined> = {
      anon: sourceIds.get("sour-diesel-public-profile"),
      authenticated: sourceIds.get("og-kush-public-profile"),
      control: sourceIds.get("blue-dream-public-profile"),
    };
    const probeSection: Record<string, string> = {
      anon: "germination",
      authenticated: "early_growth",
      control: "vegetative",
    };
    const probeOrdinal: Record<string, number> = { anon: 1, authenticated: 2, control: 3 };

    /**
     * Structurally valid, harness-owned rows: each satisfies NOT NULL, CHECK,
     * FK and unique constraints, so a refusal can only come from grants or
     * RLS. `match` identifies the row for the service-role existence check.
     */
    interface InsertProbe {
      table: string;
      payload: Record<string, unknown>;
      match: Record<string, unknown>;
    }
    const insertProbes = (label: string): InsertProbe[] => {
      const tag = `${runId}-${label}`;
      const source = probeSource[label];
      const ordinal = probeOrdinal[label];
      return [
        {
          table: "breeders",
          payload: {
            name: `Harness ${tag}`,
            normalized_name: `harness ${tag}`,
            slug: `harness-${tag}`,
          },
          match: { slug: `harness-${tag}` },
        },
        {
          table: "cultivars",
          payload: {
            canonical_name: `Harness probe ${tag}`,
            normalized_name: `harness probe ${tag}`,
            slug: `harness-probe-${tag}`,
            description: "Harness probe.",
            publication_status: "draft",
          },
          match: { slug: `harness-probe-${tag}` },
        },
        {
          table: "cultivar_aliases",
          payload: {
            cultivar_id: probeId,
            alias: `Harness ${tag}`,
            normalized_alias: `harness ${tag}`,
          },
          match: { cultivar_id: probeId, normalized_alias: `harness ${tag}` },
        },
        {
          table: "cultivar_sources",
          payload: {
            source_key: `harness-${tag}`,
            title: "Harness probe",
            publisher: "Harness",
            url: "https://example.com/harness",
            source_type: "community",
            retrieved_at: "2026-01-01T00:00:00Z",
            license_or_usage_notes: "Harness probe.",
          },
          match: { source_key: `harness-${tag}` },
        },
        {
          table: "cultivar_profile_sources",
          payload: { cultivar_id: hiddenCultivarId, source_id: source, sort_order: 50 + ordinal },
          match: { cultivar_id: hiddenCultivarId, source_id: source },
        },
        {
          table: "cultivar_claims",
          payload: {
            cultivar_id: probeId,
            trait_key: `harness_probe_${label}_${runId}`,
            value_text: "probe",
            source_id: wattsId,
          },
          match: { cultivar_id: probeId, trait_key: `harness_probe_${label}_${runId}` },
        },
        {
          table: "cultivar_guides",
          payload: {
            cultivar_id: probeId,
            version: 1000 + ordinal,
            title: "Harness probe",
            publication_status: "draft",
          },
          match: { cultivar_id: probeId, version: 1000 + ordinal },
        },
        {
          table: "cultivar_guide_sections",
          payload: {
            guide_id: draftGuideId,
            section_key: probeSection[label],
            sort_order: 20,
            content: { title: "Harness probe" },
          },
          match: { guide_id: draftGuideId, section_key: probeSection[label] },
        },
        {
          table: "cultivar_guide_section_sources",
          payload: {
            guide_section_id: hiddenSectionId,
            source_id: source,
            support_note: "Harness probe.",
          },
          match: { guide_section_id: hiddenSectionId, source_id: source },
        },
        {
          table: "cultivar_import_batches",
          payload: { filename: "harness-probe.csv", file_checksum: `harness-probe-${tag}` },
          match: { file_checksum: `harness-probe-${tag}` },
        },
        {
          table: "cultivar_import_rows",
          payload: { batch_id: batchId, row_number: 10 + ordinal, raw_payload: {} },
          match: { batch_id: batchId, row_number: 10 + ordinal },
        },
      ];
    };

    const rowExists = async (table: string, match: Record<string, unknown>) => {
      const { count } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .match(match);
      return (count ?? 0) > 0;
    };

    const beforeWrites = await rowCounts();
    for (const [label, client] of [
      ["anon", anonymous],
      ["authenticated", authenticated],
    ] as const) {
      for (const probe of insertProbes(label)) {
        await client.from(probe.table).insert(probe.payload);
        const leaked = await rowExists(probe.table, probe.match);
        check(`${label} cannot insert a valid row into ${probe.table}`, !leaked);
        if (leaked) await admin.from(probe.table).delete().match(probe.match);
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
    const afterWrites = await rowCounts();
    check(
      "client update/delete attempts changed no row count (service-role view)",
      JSON.stringify(beforeWrites) === JSON.stringify(afterWrites),
      JSON.stringify({ beforeWrites, afterWrites }),
    );
    const { data: untouched } = await admin
      .from("cultivars")
      .select("description")
      .eq("id", probeId)
      .single();
    check(
      "published content is unchanged after write attempts",
      untouched?.description !== "tampered",
    );

    // Fixtures: the same probe shapes DO insert as the service role, so every
    // client refusal above came from grants/RLS, not from an invalid payload.
    // They then serve as harness-owned targets for update/delete denial on
    // every protected table, verified by value with the service role.
    const mutations: Record<string, { column: string; value: unknown }> = {
      breeders: { column: "name", value: "tampered" },
      cultivars: { column: "description", value: "tampered" },
      cultivar_aliases: { column: "alias", value: "tampered" },
      cultivar_sources: { column: "title", value: "tampered" },
      cultivar_profile_sources: { column: "sort_order", value: 999 },
      cultivar_claims: { column: "value_text", value: "tampered" },
      cultivar_guides: { column: "title", value: "tampered" },
      cultivar_guide_sections: { column: "sort_order", value: 999 },
      cultivar_guide_section_sources: { column: "support_note", value: "tampered" },
      cultivar_import_batches: { column: "status", value: "approved" },
      cultivar_import_rows: { column: "status", value: "approved" },
    };
    const fixtures = insertProbes("control");
    const fixtureValue = async (probe: InsertProbe, column: string) => {
      const { data } = await admin.from(probe.table).select(column).match(probe.match);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return rows.length === 1 ? rows[0][column] : undefined;
    };
    const original = new Map<string, unknown>();
    for (const probe of fixtures) {
      const { error } = await admin.from(probe.table).insert(probe.payload);
      const value = await fixtureValue(probe, mutations[probe.table].column);
      check(
        `control: probe payload for ${probe.table} is structurally valid`,
        !error && value !== undefined,
        error?.message,
      );
      original.set(probe.table, value);
    }
    try {
      for (const [label, client] of [
        ["anon", anonymous],
        ["authenticated", authenticated],
      ] as const) {
        for (const probe of fixtures) {
          const { column, value } = mutations[probe.table];
          await client
            .from(probe.table)
            .update({ [column]: value })
            .match(probe.match);
          const afterUpdate = await fixtureValue(probe, column);
          check(
            `${label} cannot update ${probe.table}`,
            afterUpdate !== undefined &&
              JSON.stringify(afterUpdate) === JSON.stringify(original.get(probe.table)),
            JSON.stringify({ before: original.get(probe.table), after: afterUpdate }),
          );
          await client.from(probe.table).delete().match(probe.match);
          const stillThere = await fixtureValue(probe, column);
          check(`${label} cannot delete from ${probe.table}`, stillThere !== undefined);
        }
      }
    } finally {
      for (const probe of [...fixtures].reverse()) {
        await admin.from(probe.table).delete().match(probe.match);
      }
    }
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
