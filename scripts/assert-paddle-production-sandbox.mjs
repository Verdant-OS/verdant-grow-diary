#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  classifyStripeProductionKey,
  resolveCanonicalStripeLiveKey,
} from "./stripe-production-key-rules.mjs";

const TOKEN_NAME = "VITE_PAYMENTS_CLIENT_TOKEN";
const MAX_PRODUCTION_ENV_BYTES = 64 * 1024;

function fixedFailure(reason) {
  return { ok: false, reason };
}

function readCanonicalProductionEnv(rootDir) {
  try {
    const bytes = readFileSync(resolve(rootDir, ".env.production"));
    if (bytes.byteLength > MAX_PRODUCTION_ENV_BYTES) {
      return fixedFailure("canonical_payments_env_too_large");
    }
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return fixedFailure("canonical_payments_env_read_failed");
  }
}

function resolveEffectiveProductionToken(token) {
  const classified = classifyStripeProductionKey(token);
  if (!classified.ok) return fixedFailure(`effective_${classified.reason}`);
  return classified;
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
    return fixedFailure("effective_payments_env_resolution_failed");
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
 * Standing production client-key gate: production accepts exactly one
 * well-formed live Stripe publishable key (pk_live_), in the committed file and
 * in the exact value Vite will bundle. Test keys, Paddle tokens, malformed
 * values and duplicate assignments are refused. Fixed codes only.
 */
async function verifyStripeProductionClientKey(rootDir = process.cwd()) {
  const rawEnv = readCanonicalProductionEnv(rootDir);
  if (!rawEnv.ok) return rawEnv;

  const canonical = resolveCanonicalStripeLiveKey(rawEnv.text);
  if (!canonical.ok) return fixedFailure(canonical.reason);

  const effectiveEnv = await loadEffectiveProductionEnv(rootDir);
  if (!effectiveEnv.ok) return effectiveEnv;

  const effective = resolveEffectiveProductionToken(effectiveEnv.env[TOKEN_NAME]);
  if (!effective.ok) return effective;
  if (effective.key !== canonical.key) return fixedFailure("effective_stripe_key_mismatch");

  return { ok: true };
}

async function main() {
  const result = await verifyStripeProductionClientKey();
  if (!result.ok) {
    console.error(`[payments-production-policy] ${result.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log("[payments-production-policy] live Stripe key verified.");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
