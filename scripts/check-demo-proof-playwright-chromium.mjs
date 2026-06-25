#!/usr/bin/env node
// Demo-Proof local helper: verify Playwright Chromium is installed before E2E.
// Dependency-free. Deterministic. Never auto-installs.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const INSTALL_MSG = [
  "Playwright Chromium was not found.",
  "Run: bunx playwright install chromium",
  "For Linux CI/system dependencies, run: bunx playwright install chromium --with-deps",
].join("\n");

function candidateRoots() {
  const roots = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== "0") {
    roots.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  }
  const home = homedir();
  if (process.platform === "darwin") {
    roots.push(join(home, "Library", "Caches", "ms-playwright"));
  } else if (process.platform === "win32") {
    if (process.env.LOCALAPPDATA) {
      roots.push(join(process.env.LOCALAPPDATA, "ms-playwright"));
    }
  } else {
    roots.push(join(home, ".cache", "ms-playwright"));
  }
  return roots.filter(Boolean);
}

function hasChromiumDir(root) {
  if (!existsSync(root)) return null;
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return null;
  }
  const match = entries.find(
    (name) => name.startsWith("chromium-") || name.startsWith("chromium_headless_shell-"),
  );
  if (!match) return null;
  const full = join(root, match);
  try {
    if (statSync(full).isDirectory()) return full;
  } catch {
    return null;
  }
  return null;
}

let found = null;
for (const root of candidateRoots()) {
  const hit = hasChromiumDir(root);
  if (hit) {
    found = hit;
    break;
  }
}

if (found) {
  console.log(`Playwright Chromium detected at: ${found}`);
  process.exit(0);
}

console.error(INSTALL_MSG);
process.exit(1);
