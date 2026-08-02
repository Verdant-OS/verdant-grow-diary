#!/usr/bin/env node
/**
 * capture-ssr-head-snapshots-with-server
 *
 * Boots the freshly built Nitro server (dist/server/index.mjs) on an ephemeral
 * port, runs scripts/capture-ssr-head-snapshots.ts against it, then shuts the
 * server down. This is what lets the head-fidelity gate run inside `postbuild`
 * with no externally running app.
 *
 * A server that never comes up is reported as BLOCKED, never as head drift.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

const distDir = resolve(process.argv[2] ?? "dist");
const entry = join(distDir, "server", "index.mjs");
const port = Number(process.env["SEO_SNAPSHOT_PORT"] ?? 8791);
const baseUrl = `http://127.0.0.1:${port}`;

if (!existsSync(entry)) {
  console.error(`capture-ssr-head-snapshots-with-server: BLOCKED — no server entry at ${entry}.`);
  process.exit(1);
}

const server = spawn(process.execPath, [entry], {
  env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", NITRO_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));

const shutdown = () => {
  if (!server.killed) server.kill("SIGTERM");
};
process.on("exit", shutdown);

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) return false;
    try {
      const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
      if (response.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

if (!(await waitForServer())) {
  shutdown();
  console.error(
    `capture-ssr-head-snapshots-with-server: BLOCKED — built server did not answer on ${baseUrl}.\n${serverLog}`,
  );
  process.exit(1);
}

const capture = spawn("bun", ["scripts/capture-ssr-head-snapshots.ts", distDir], {
  env: { ...process.env, SEO_SNAPSHOT_BASE_URL: baseUrl },
  stdio: "inherit",
});

capture.on("exit", (code) => {
  shutdown();
  process.exit(code ?? 1);
});
