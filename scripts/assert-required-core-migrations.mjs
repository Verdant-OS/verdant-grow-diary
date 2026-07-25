#!/usr/bin/env node
/**
 * Assert that every migration named by the core/advisory schema manifest
 * remains present in immutable migration history.
 */
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_CORE_MIGRATIONS } from "./required-core-migrations.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

const missing = REQUIRED_CORE_MIGRATIONS.filter(
  (filename) => !existsSync(join(MIGRATIONS_DIR, filename)),
);

if (missing.length > 0) {
  console.error("Missing required core-schema migration files:");
  for (const filename of missing) {
    console.error(`  supabase/migrations/${filename}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `All ${REQUIRED_CORE_MIGRATIONS.length} required core-schema migration files are present.`,
  );
}
