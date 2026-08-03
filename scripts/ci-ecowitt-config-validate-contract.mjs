#!/usr/bin/env node
/**
 * CI contract test for `bun run scripts/ecowitt-live-soil-bridge.ts config validate`.
 *
 * Loads:
 *   - examples/ecowitt-bridge/.env.example                     → expect ok
 *   - fixtures/ecowitt-bridge-config/failing/<code>.env        → expect exit 2 with `code`
 *
 * Locks in the machine-readable error-code catalog and the JSON envelope
 * shape so refactors cannot silently rename codes or reshape the payload
 * that downstream automation depends on.
 *
 * Pure subprocess runner: never imports mqtt, never touches the network,
 * never echoes tent UUIDs or bridge tokens.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const REPO = resolve(new URL("..", import.meta.url).pathname);
const BRIDGE = join(REPO, "scripts/ecowitt-live-soil-bridge.ts");
const EXAMPLE_ENV = join(REPO, "examples/ecowitt-bridge/.env.example");
const FAILING_DIR = join(REPO, "fixtures/ecowitt-bridge-config/failing");

/** Parse a KEY=VALUE .env file into a plain object. No shell expansion. */
function loadEnvFile(path) {
  const out = {};
  const text = readFileSync(path, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1);
    if (key) out[key] = value;
  }
  return out;
}

function runValidate(env, extraArgs = []) {
  // Start from an EMPTY env so the caller's shell cannot mask a fixture's
  // "unset VERDANT_TENT_ID" case. Only inherit what bun/node genuinely need.
  const cleanEnv = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    ...env,
  };
  const r = spawnSync("bun", ["run", BRIDGE, "config", "validate", ...extraArgs], {
    encoding: "utf8",
    env: cleanEnv,
    timeout: 20_000,
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Extract the last JSON envelope from a stream (one per line). */
function lastJsonLine(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
  if (lines.length === 0) return null;
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
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

// ---------------------------------------------------------------- passing ----
console.log(`\n[passing] ${EXAMPLE_ENV}`);
if (!existsSync(EXAMPLE_ENV)) {
  failures.push("missing example env");
  console.log("  FAIL example env not found");
} else {
  const env = loadEnvFile(EXAMPLE_ENV);
  const r = runValidate(env);
  const env2 = lastJsonLine(r.stdout);
  check("exit 0", r.status === 0, `status=${r.status}`);
  check("stdout has config_ok event", env2?.event === "config_ok");
  check("no stderr config_error", !r.stderr.includes('"event":"config_error"'));
}

// ---------------------------------------------------------------- failing ----
const files = readdirSync(FAILING_DIR)
  .filter((f) => f.endsWith(".env"))
  .sort();
if (files.length === 0) {
  failures.push("no failing fixtures found");
  console.log(`\n[failing] no fixtures in ${FAILING_DIR}`);
}

// Fixture filename → expected code (also documented in each fixture's header).
// A fixture may accept more than one code when the assertion order is not
// contractually pinned (e.g. mismatch can surface as mixed_ or mismatch_).
const ALLOWED = {
  "missing_tent_id.env": ["missing_tent_id"],
  "invalid_tent_id.env": ["invalid_tent_id"],
  "invalid_channel_map_schema.env": ["invalid_channel_map_schema"],
  "mixed_tent_channel_map.env": ["mixed_tent_channel_map"],
  "channel_map_tent_mismatch.env": ["channel_map_tent_mismatch", "mixed_tent_channel_map"],
};

for (const file of files) {
  console.log(`\n[failing] ${file}`);
  const env = loadEnvFile(join(FAILING_DIR, file));
  const r = runValidate(env);
  const errEnv = lastJsonLine(r.stderr);
  const allowed = ALLOWED[basename(file)] ?? [basename(file, ".env")];
  check("exit 2", r.status === 2, `status=${r.status}`);
  check("stderr has config_error event", errEnv?.event === "config_error");
  check(
    `code ∈ ${JSON.stringify(allowed)}`,
    typeof errEnv?.code === "string" && allowed.includes(errEnv.code),
    `got code=${errEnv?.code ?? "<none>"}`,
  );
  check(
    "no mqtt import / network attempt",
    !/ECONNREFUSED|mqtt_connected|Cannot find module 'mqtt'/i.test(r.stderr),
  );
}

console.log("");
if (failures.length > 0) {
  console.error(`FAIL ${failures.length} contract check(s) failed`);
  process.exit(1);
}
console.log(`ok — ${files.length + 1} fixtures passed the config-validate contract`);
