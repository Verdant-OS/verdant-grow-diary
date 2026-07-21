#!/usr/bin/env node
/**
 * verify-edge-shared-in-sync.mjs
 *
 * Thin wrapper around scripts/sync-edge-shared.mjs --check.
 * Kept as its own entry point so package.json / CI can call a purpose-named
 * script without shell quoting.
 */
import { spawn } from "node:child_process";
import * as path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const child = spawn(
  process.execPath,
  [path.join(ROOT, "scripts", "sync-edge-shared.mjs"), "--check"],
  { stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
