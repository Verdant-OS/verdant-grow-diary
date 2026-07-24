#!/usr/bin/env node
/**
 * CI regression gate for `config validate --dry-run` against every shipped
 * example env file. Locks in:
 *   - exit 0
 *   - stdout contains `config_ok` followed by a `config_effective` envelope
 *   - the effective envelope has `dry_run: true`
 *   - no raw UUID / bridge token / ingest URL from the source .env leaks into
 *     stdout or stderr (redaction invariant)
 *   - no mqtt import / network activity
 *
 * Pure subprocess runner. Never imports mqtt, never touches the network,
 * never echoes tent UUIDs or bridge tokens beyond checking for their absence.
 */
import { spawnSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(new URL("..", import.meta.url).pathname);
const BRIDGE = join(REPO, "scripts/ecowitt-live-soil-bridge.ts");
const EXAMPLES_DIR = join(REPO, "examples/ecowitt-bridge");

/** Parse KEY=VALUE .env files without shell expansion. */
function loadEnvFile(path) {
  const out = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    // Preserve original (untrimmed) value from the raw line so JSON blobs
    // survive intact.
    const value = raw.slice(raw.indexOf("=") + 1);
    if (key) out[key] = value;
  }
  return out;
}

function runDryRun(env, extraArgs = []) {
  const cleanEnv = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    ...env,
  };
  const r = spawnSync(
    "bun",
    ["run", BRIDGE, "config", "validate", "--dry-run", ...extraArgs],
    { encoding: "utf8", env: cleanEnv, timeout: 20_000 },
  );
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function jsonLines(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try { out.push(JSON.parse(t)); } catch { /* ignore */ }
  }
  return out;
}

/** Collect UUIDs, bridge tokens (vbt_...), and ingest URL host+path from env. */
function collectSecrets(env) {
  const secrets = new Set();
  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  for (const value of Object.values(env)) {
    if (!value) continue;
    for (const m of value.matchAll(uuidRe)) secrets.add(m[0].toLowerCase());
  }
  if (env.VERDANT_BRIDGE_TOKEN && env.VERDANT_BRIDGE_TOKEN.length >= 4) {
    secrets.add(env.VERDANT_BRIDGE_TOKEN);
  }
  if (env.VERDANT_INGEST_URL) {
    try {
      const u = new URL(env.VERDANT_INGEST_URL);
      // Path is the sensitive part (project ref lives in the host too).
      if (u.pathname && u.pathname !== "/") secrets.add(u.pathname);
    } catch { /* ignore */ }
  }
  return [...secrets];
}

const failures = [];
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}${detail ? `  — ${detail}` : ""}`);
    failures.push(label);
  }
}

if (!existsSync(EXAMPLES_DIR)) {
  console.error(`FAIL examples dir missing: ${EXAMPLES_DIR}`);
  process.exit(1);
}

const files = readdirSync(EXAMPLES_DIR)
  .filter((f) => f === ".env.example" || f.endsWith(".env.example"))
  .sort();

if (files.length === 0) {
  console.error("FAIL no example .env files found");
  process.exit(1);
}

for (const file of files) {
  const path = join(EXAMPLES_DIR, file);
  console.log(`\n[dry-run] ${file}`);
  const env = loadEnvFile(path);
  const r = runDryRun(env);
  const envs = jsonLines(r.stdout);
  const ok = envs.find((e) => e.event === "config_ok");
  const eff = envs.find((e) => e.event === "config_effective");

  check("exit 0", r.status === 0, `status=${r.status}`);
  check("stdout has config_ok", !!ok);
  check("stdout has config_effective", !!eff);
  check("effective envelope marked dry_run:true", eff?.dry_run === true);
  check(
    "no stderr config_error",
    !r.stderr.includes('"event":"config_error"'),
  );
  check(
    "no mqtt import / network attempt",
    !/ECONNREFUSED|mqtt_connected|Cannot find module 'mqtt'/i.test(
      r.stdout + r.stderr,
    ),
  );

  // Redaction invariant: no raw secret from the env may appear in output.
  const combined = r.stdout + "\n" + r.stderr;
  const leaked = collectSecrets(env).filter((s) => combined.includes(s));
  check(
    "no raw secret leaked in output",
    leaked.length === 0,
    leaked.length ? `leaked=${leaked.length} value(s)` : "",
  );
}

console.log("");
if (failures.length > 0) {
  console.error(`FAIL ${failures.length} dry-run contract check(s) failed`);
  process.exit(1);
}
console.log(`ok — ${files.length} example env file(s) passed dry-run contract`);
