#!/usr/bin/env -S bun run
/**
 * Strain Reference Library V1.1 — database parity audit (issue #419).
 *
 * Read-only. Compares the approved bundled profiles with a database read model
 * and writes a deterministic JSON report.
 *
 * Sources:
 *   --source=migration (default, offline)
 *       Parses the dollar-quoted payload out of the checked-in V1.1 migration
 *       and audits the rows it produces. No network, no database.
 *   --source=supabase
 *       Reads the published surface through PostgREST with the PUBLISHABLE /
 *       anon key only (SUPABASE_URL + SUPABASE_ANON_KEY or
 *       VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY). This is the
 *       preview/production deployment receipt: it also proves anon can read
 *       the published surface and nothing else. Never pass a service-role key.
 *
 * Flags:
 *   --strict             exit 1 unless status is `ready` (default: report only)
 *   --out=<path>         report path (default artifacts/strain-reference-library/db-parity-report.json)
 *   --migration=<path>   migration to audit in migration mode
 *
 * Exit codes: 0 report written (or ready in strict mode); 1 strict and not
 * ready; 2 usage or environment error.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  CULTIVAR_SOURCES,
  VERDANT_CULTIVARS,
  getCultivarGuideSections,
  getCultivarSources,
} from "@/constants/strainReferenceLibrary";
import {
  auditCultivarDatabaseParity,
  cultivarParityExitCode,
  type CultivarParityReport,
} from "@/lib/cultivarDatabaseParityRules";
import type { CultivarDatabaseSnapshot } from "@/lib/cultivarDatabaseReadModel";
import {
  cultivarSeedPayloadToSnapshot,
  extractCultivarSeedPayloadFromMigration,
} from "@/lib/cultivarDatabaseSeedPayloadRules";
import { fetchPublishedCultivarSnapshot } from "@/lib/cultivarReferenceService";

export const CULTIVAR_PARITY_MIGRATION_PATH =
  "supabase/migrations/20260930200000_strain_reference_library_v1_1_parity.sql";
const DEFAULT_OUT = "artifacts/strain-reference-library/db-parity-report.json";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function invalidReport(reason: string): CultivarParityReport {
  return {
    reportVersion: 1,
    status: "invalid",
    expectedSlugs: VERDANT_CULTIVARS.map((profile) => profile.slug).sort(),
    matchedSlugs: [],
    counts: {
      profiles: { expected: VERDANT_CULTIVARS.length, database: 0 },
      aliases: { expected: 0, database: 0 },
      terpeneClaims: { expected: 0, database: 0 },
      cannabinoidClaims: { expected: 0, database: 0 },
      profileSources: { expected: 0, database: 0 },
      guideSections: { expected: 0, database: 0 },
      sources: { expected: CULTIVAR_SOURCES.length, database: 0 },
    },
    issues: [{ slug: null, kind: "malformed", path: "source", message: reason }],
  };
}

async function loadSnapshot(source: string): Promise<CultivarDatabaseSnapshot | string> {
  if (source === "migration") {
    const path = resolve(process.cwd(), arg("migration") ?? CULTIVAR_PARITY_MIGRATION_PATH);
    let sql: string;
    try {
      sql = readFileSync(path, "utf8");
    } catch (error) {
      return `cannot read migration ${path}: ${(error as Error).message}`;
    }
    const extraction = extractCultivarSeedPayloadFromMigration(sql);
    return extraction.ok ? cultivarSeedPayloadToSnapshot(extraction.payload) : extraction.error;
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error("BLOCKED: supabase mode needs SUPABASE_URL and SUPABASE_ANON_KEY (publishable).");
    process.exit(2);
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && key === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("REFUSED: the parity receipt must read as anon, never with the service role.");
    process.exit(2);
  }
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await fetchPublishedCultivarSnapshot(client);
  return result.ok ? result.snapshot : `database read failed: ${result.error}`;
}

async function main() {
  const source = arg("source") ?? "migration";
  if (source !== "migration" && source !== "supabase") {
    console.error(`unknown --source=${source}; expected migration or supabase`);
    process.exit(2);
  }
  const strict = process.argv.includes("--strict");
  const out = resolve(process.cwd(), arg("out") ?? DEFAULT_OUT);

  const snapshot = await loadSnapshot(source);
  const report =
    typeof snapshot === "string"
      ? invalidReport(snapshot)
      : auditCultivarDatabaseParity({
          bundledProfiles: VERDANT_CULTIVARS,
          bundledSources: CULTIVAR_SOURCES,
          bundledSectionsFor: getCultivarGuideSections,
          bundledSourcesFor: getCultivarSources,
          snapshot,
        });

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ source, ...report }, null, 2)}\n`);

  console.log(`Strain Reference Library parity (${source}): ${report.status.toUpperCase()}`);
  for (const [label, count] of Object.entries(report.counts)) {
    console.log(`  ${label}: expected ${count.expected}, database ${count.database}`);
  }
  console.log(`  matched profiles: ${report.matchedSlugs.length}/${report.expectedSlugs.length}`);
  for (const issue of report.issues.slice(0, 25)) {
    console.log(
      `  - [${issue.kind}] ${issue.slug ?? "*"} ${issue.path}${issue.message ? ` — ${issue.message}` : ""}`,
    );
  }
  if (report.issues.length > 25) console.log(`  … ${report.issues.length - 25} more in ${out}`);
  console.log(`  report: ${out}`);
  process.exit(cultivarParityExitCode(report, strict));
}

await main();
