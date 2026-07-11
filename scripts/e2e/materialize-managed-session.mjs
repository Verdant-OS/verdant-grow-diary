#!/usr/bin/env node
/**
 * materialize-managed-session — produce the LOVABLE_BROWSER_* managed-session
 * env for the One-Tent authenticated Playwright walk from a REAL session.
 *
 * Two honest sources, in priority order:
 *   1. An existing e2e/.auth/session-storage.json snapshot (written by
 *      e2e/auth.setup.ts after a real /auth UI login).
 *   2. A live password login via supabase-js, using E2E_TEST_EMAIL /
 *      E2E_TEST_PASSWORD against VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY.
 *
 * Output: writes e2e/.auth/managed-session.env (gitignored) containing the
 * export-ready env, and prints a NON-SECRET summary + the exact shell command
 * to load it. The access token is written only to that gitignored file, never
 * to stdout.
 *
 * It NEVER fabricates a login. With no snapshot and no credentials it exits 2
 * (BLOCKED) with a clear reason and writes nothing.
 *
 * Exit codes: 0 = env materialized, 2 = blocked (no real session available),
 * 1 = unexpected error.
 */

import fs from "node:fs";
import path from "node:path";
import {
  buildManagedSessionEnv,
  deriveSupabaseStorageKey,
  extractSessionFromStorageSnapshot,
  serializeEnvFile,
  validateFullSession,
} from "./managed-session-materialize-core.mjs";

const OUT_PATH = path.resolve("e2e/.auth/managed-session.env");
const SNAPSHOT_PATH = path.resolve("e2e/.auth/session-storage.json");

function blocked(reason, detail) {
  console.log("Managed session materialize: BLOCKED");
  console.log(`Reason: ${reason}`);
  if (detail) console.log(detail);
  console.log("No login fabricated. No env written.");
  process.exit(2);
}

function parseJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

async function fromSnapshot() {
  if (!fs.existsSync(SNAPSHOT_PATH)) return null;
  const snapshot = parseJsonFile(SNAPSHOT_PATH);
  const extracted = extractSessionFromStorageSnapshot(snapshot);
  if (!extracted) return null;
  let session;
  try {
    session = JSON.parse(extracted.sessionJson);
  } catch {
    return null;
  }
  return { source: "snapshot", ...extracted, session };
}

async function fromLogin() {
  const email = (process.env.E2E_TEST_EMAIL ?? "").trim();
  const password = (process.env.E2E_TEST_PASSWORD ?? "").trim();
  const url = (process.env.VITE_SUPABASE_URL ?? "").trim().replace(/^"|"$/g, "");
  const anon = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim().replace(/^"|"$/g, "");
  if (!email || !password) return { blocked: "missing_credentials" };
  if (!url || !anon) return { blocked: "missing_supabase_config" };

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    return { blocked: "login_failed" };
  }
  const session = data.session;
  const storageKey = deriveSupabaseStorageKey({
    supabaseUrl: url,
    projectId: (process.env.VITE_SUPABASE_PROJECT_ID ?? "").trim().replace(/^"|"$/g, ""),
  });
  if (!storageKey) return { blocked: "cannot_derive_storage_key" };
  return { source: "login", storageKey, sessionJson: JSON.stringify(session), session };
}

async function main() {
  // Prefer a pre-generated real snapshot; else attempt a live fixture login.
  let materialized = await fromSnapshot();
  if (!materialized) {
    const login = await fromLogin();
    if (login?.blocked) {
      if (login.blocked === "missing_credentials") {
        blocked(
          "no_session_source",
          "No e2e/.auth/session-storage.json snapshot and no E2E_TEST_EMAIL / " +
            "E2E_TEST_PASSWORD. Run `bunx playwright test e2e/auth.setup.ts` with " +
            "fixture credentials to generate a snapshot, or export the credentials.",
        );
      }
      blocked(login.blocked);
    }
    materialized = login;
  }

  const validation = validateFullSession(materialized.session);
  if (!validation.ok) {
    blocked(
      validation.reason,
      validation.missing ? `Missing session fields: ${validation.missing.join(", ")}` : undefined,
    );
  }

  const projectRef =
    deriveSupabaseStorageKey({
      supabaseUrl: (process.env.VITE_SUPABASE_URL ?? "").trim().replace(/^"|"$/g, ""),
      projectId: (process.env.VITE_SUPABASE_PROJECT_ID ?? "").trim().replace(/^"|"$/g, ""),
    }) === materialized.storageKey
      ? materialized.storageKey.replace(/^sb-/, "").replace(/-auth-token$/, "")
      : "";

  const env = buildManagedSessionEnv({
    sessionJson: materialized.sessionJson,
    storageKey: materialized.storageKey,
    projectRef,
  });

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, serializeEnvFile(env), { mode: 0o600 });

  // NON-SECRET summary only — never echo the token or session JSON.
  console.log("Managed session materialize: READY");
  console.log(`Source: ${materialized.source}`);
  console.log(`Storage key: ${materialized.storageKey}`);
  console.log(`Session complete (access+refresh+expires_at+user.id): yes`);
  console.log(`Env written: ${OUT_PATH} (gitignored, mode 600)`);
  console.log("");
  console.log("Load it into your shell, then run the walk:");
  console.log(`  set -a; source ${OUT_PATH}; set +a`);
  console.log("  bun run e2e:one-tent:preflight && bun run e2e:one-tent:seed \\");
  console.log("    && bun run e2e:one-tent:ui \\");
  console.log("    && bun run e2e:one-tent:teardown -- --execute --confirm-fixture-teardown");
  process.exit(0);
}

main().catch(() => {
  // Never echo the underlying error — it may contain env-derived strings.
  console.error("Managed session materialize: UNEXPECTED_ERROR");
  process.exit(1);
});
