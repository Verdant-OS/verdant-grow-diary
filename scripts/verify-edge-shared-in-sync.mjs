#!/usr/bin/env node
/**
 * verify-edge-shared-in-sync.mjs
 *
 * Thin wrapper around scripts/sync-edge-shared.mjs --check.
 * Kept as its own entry point so package.json / CI can call a purpose-named
 * script without shell quoting.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const child = spawn(
  process.execPath,
  [path.join(ROOT, "scripts", "sync-edge-shared.mjs"), "--check"],
  { stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
