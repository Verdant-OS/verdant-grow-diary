#!/usr/bin/env node
/**
 * Local parity runner for the ecowitt bridge status page suite.
 *
 * Mirrors the exact command CI runs (see .github/workflows/ci.yml and
 * package.json#test:ecowitt-bridge:ci). Captures stdout+stderr to
 * artifacts/ecowitt-bridge-ci-output.txt and the real exit code to
 * artifacts/ecowitt-bridge-ci-exit-code.txt, then exits with that
 * same code so callers can gate on it.
 *
 * Safety: Node built-ins only. Never prints env/secrets. Never
 * mutates product code, schema, RLS, or Edge Functions.
 */
import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream, writeFileSync } from "node:fs";
import { join } from "node:path";

const ARTIFACT_DIR = "artifacts";
const OUTPUT_FILE = join(ARTIFACT_DIR, "ecowitt-bridge-ci-output.txt");
const EXIT_CODE_FILE = join(ARTIFACT_DIR, "ecowitt-bridge-ci-exit-code.txt");

// EXACT parity command (single-line form). Must match:
//   - docs/test-validation-notes.md
//   - .github/workflows/ci.yml ("Run ecowitt bridge CI validation")
//   - package.json#test:ecowitt-bridge:ci
const PARITY_COMMAND =
  "NODE_OPTIONS=--max-old-space-size=4096 bunx vitest run src/test/ecowitt-bridge-status-page.test.tsx --reporter=verbose --isolate --pool=forks";

mkdirSync(ARTIFACT_DIR, { recursive: true });
writeFileSync(EXIT_CODE_FILE, "not-run\n");
writeFileSync(OUTPUT_FILE, "");

const out = createWriteStream(OUTPUT_FILE, { flags: "w" });

const child = spawn(
  "bunx",
  [
    "vitest",
    "run",
    "src/test/ecowitt-bridge-status-page.test.tsx",
    "--reporter=verbose",
    "--isolate",
    "--pool=forks",
  ],
  {
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  out.write(chunk);
});
child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  out.write(chunk);
});

const finish = (code) => {
  out.end(() => {
    writeFileSync(EXIT_CODE_FILE, `${code}\n`);
    console.log(`Ecowitt bridge CI validation exit code: ${code}`);
    console.log(`Parity command: ${PARITY_COMMAND}`);
    process.exit(code);
  });
};

child.on("error", (err) => {
  out.write(`\n[runner error] ${err.message}\n`);
  finish(1);
});
child.on("exit", (code, signal) => {
  const status = code ?? (signal ? 1 : 1);
  finish(status);
});
