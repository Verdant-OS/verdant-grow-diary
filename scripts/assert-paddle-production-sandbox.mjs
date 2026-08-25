#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveCanonicalPaddleProductionToken } from "./e2e/managed-session-materialize-core.mjs";

const TOKEN_NAME = "VITE_PAYMENTS_CLIENT_TOKEN";
const MAX_PRODUCTION_ENV_BYTES = 64 * 1024;

function fixedFailure(reason) {
  return { ok: false, reason };
}

function readCanonicalProductionEnv(rootDir) {
  try {
    const bytes = readFileSync(resolve(rootDir, ".env.production"));
    if (bytes.byteLength > MAX_PRODUCTION_ENV_BYTES) {
      return fixedFailure("canonical_paddle_env_too_large");
    }
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return fixedFailure("canonical_paddle_env_read_failed");
  }
}

function resolveEffectiveProductionToken(token) {
  if (typeof token !== "string") {
    return fixedFailure("effective_paddle_token_invalid");
  }

  // JSON quoting keeps line breaks and delimiter bytes inert while reusing the
  // strict canonical parser instead of introducing a second token classifier.
  const resolved = resolveCanonicalPaddleProductionToken(`${TOKEN_NAME}=${JSON.stringify(token)}`);
  if (!resolved.ok) {
    return fixedFailure("effective_paddle_token_invalid");
  }
  return resolved;
}

async function loadEffectiveProductionEnv(rootDir) {
  const hadDebug = Object.hasOwn(process.env, "DEBUG");
  const previousDebug = process.env.DEBUG;
  const previousStdoutWrite = process.stdout.write;
  const previousStderrWrite = process.stderr.write;
  const previousConsole = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };
  const suppressConsoleOutput = () => undefined;
  const suppressStreamOutput = () => true;

  delete process.env.DEBUG;
  process.stdout.write = suppressStreamOutput;
  process.stderr.write = suppressStreamOutput;
  console.debug = suppressConsoleOutput;
  console.error = suppressConsoleOutput;
  console.info = suppressConsoleOutput;
  console.log = suppressConsoleOutput;
  console.warn = suppressConsoleOutput;

  try {
    const { loadEnv } = await import("vite");
    return { ok: true, env: loadEnv("production", rootDir, "VITE_PAYMENTS_") };
  } catch {
    return fixedFailure("effective_paddle_env_resolution_failed");
  } finally {
    process.stdout.write = previousStdoutWrite;
    process.stderr.write = previousStderrWrite;
    console.debug = previousConsole.debug;
    console.error = previousConsole.error;
    console.info = previousConsole.info;
    console.log = previousConsole.log;
    console.warn = previousConsole.warn;
    if (hadDebug) process.env.DEBUG = previousDebug;
    else delete process.env.DEBUG;
  }
}

/**
 * Standing production client-token gate: verify the committed production
 * source and the exact value Vite will bundle. Accepts test_ or live_.
 * Results contain fixed codes only; token bytes never leave locals.
 */
async function verifyPaddleProductionClientToken(rootDir = process.cwd()) {
  const rawEnv = readCanonicalProductionEnv(rootDir);
  if (!rawEnv.ok) return rawEnv;

  const canonical = resolveCanonicalPaddleProductionToken(rawEnv.text);
  if (!canonical.ok) return fixedFailure(canonical.reason);

  const effectiveEnv = await loadEffectiveProductionEnv(rootDir);
  if (!effectiveEnv.ok) return effectiveEnv;

  const effective = resolveEffectiveProductionToken(effectiveEnv.env[TOKEN_NAME]);
  if (!effective.ok) return effective;
  if (effective.token !== canonical.token) {
    return fixedFailure("effective_paddle_token_mismatch");
  }

  return { ok: true };
}

async function main() {
  const result = await verifyPaddleProductionClientToken();
  if (!result.ok) {
    console.error(`[paddle-production-policy] ${result.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log("[paddle-production-policy] production client token verified.");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
