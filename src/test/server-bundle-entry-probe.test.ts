/**
 * Behavioral contracts for scripts/lib/serverBundleEntryProbe.mjs.
 * Temp fixtures only — no network, no real build.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatServerBundleProbe,
  probeServerBundleEntry,
} from "../../scripts/lib/serverBundleEntryProbe.mjs";

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    const root = fixtures.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "server-bundle-probe-"));
  fixtures.push(root);
  return root;
}

describe("probeServerBundleEntry", () => {
  it("resolves serverEntry declared by a Vercel Nitro .vercel/output/nitro.json layout", () => {
    const root = makeRoot();
    const vercelOutput = join(root, ".vercel", "output");
    const serverDir = join(vercelOutput, "server");
    mkdirSync(serverDir, { recursive: true });
    const entryPath = join(serverDir, "index.mjs");
    writeFileSync(entryPath, "export default {};\n", "utf8");
    writeFileSync(
      join(vercelOutput, "nitro.json"),
      JSON.stringify({
        preset: "vercel",
        serverEntry: "./server/index.mjs",
      }),
      "utf8",
    );

    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      const probe = probeServerBundleEntry(join(root, "dist"));
      expect(probe.entry).toBe(resolve(entryPath));
      expect(probe.detectedFrom).toContain(".vercel/output/nitro.json");
      expect(probe.detectedFrom).toContain('serverEntry="./server/index.mjs"');
      expect(probe.candidates.some((c) => c.exists && c.path === resolve(entryPath))).toBe(true);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("resolves the conventional .vercel/output/server/index.mjs when nitro.json is absent", () => {
    const root = makeRoot();
    const entryPath = join(root, ".vercel", "output", "server", "index.mjs");
    mkdirSync(join(root, ".vercel", "output", "server"), { recursive: true });
    writeFileSync(entryPath, "export default {};\n", "utf8");

    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      const probe = probeServerBundleEntry(join(root, "dist"));
      expect(probe.entry).toBe(resolve(entryPath));
      expect(probe.detectedFrom).toContain(".vercel/output/server/index.mjs");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("resolves wrangler.json main under .vercel/output when present", () => {
    const root = makeRoot();
    const vercelOutput = join(root, ".vercel", "output");
    const serverDir = join(vercelOutput, "server");
    mkdirSync(serverDir, { recursive: true });
    const entryPath = join(serverDir, "worker.mjs");
    writeFileSync(entryPath, "export default {};\n", "utf8");
    writeFileSync(
      join(serverDir, "wrangler.json"),
      JSON.stringify({ main: "./worker.mjs" }),
      "utf8",
    );

    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      const probe = probeServerBundleEntry(join(root, "dist"));
      expect(probe.entry).toBe(resolve(entryPath));
      expect(probe.detectedFrom).toContain("wrangler.json main=");
      expect(probe.detectedFrom).toContain(".vercel/output/server/wrangler.json");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("keeps resolving legacy .output/server/index.mjs", () => {
    const root = makeRoot();
    const entryPath = join(root, ".output", "server", "index.mjs");
    mkdirSync(join(root, ".output", "server"), { recursive: true });
    writeFileSync(entryPath, "export default {};\n", "utf8");

    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      const probe = probeServerBundleEntry(join(root, "dist"));
      expect(probe.entry).toBe(resolve(entryPath));
      expect(probe.detectedFrom).toContain(".output/server/index.mjs");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("does not invent an entry when no candidate file exists", () => {
    const root = makeRoot();
    mkdirSync(join(root, "dist"), { recursive: true });
    // nitro.json present but serverEntry file missing — must not resolve.
    mkdirSync(join(root, ".vercel", "output"), { recursive: true });
    writeFileSync(
      join(root, ".vercel", "output", "nitro.json"),
      JSON.stringify({ preset: "vercel", serverEntry: "./server/index.mjs" }),
      "utf8",
    );

    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      const probe = probeServerBundleEntry(join(root, "dist"));
      expect(probe.entry).toBeNull();
      expect(probe.detectedFrom).toBeNull();
      expect(probe.candidates.every((c) => c.exists === false)).toBe(true);
      expect(formatServerBundleProbe(probe, "test")).toContain("BLOCKED");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("honors an explicit override ahead of vercel/nitro layouts", () => {
    const root = makeRoot();
    const override = join(root, "custom-entry.mjs");
    writeFileSync(override, "export default {};\n", "utf8");
    mkdirSync(join(root, ".vercel", "output", "server"), { recursive: true });
    writeFileSync(join(root, ".vercel", "output", "server", "index.mjs"), "export default {};\n");

    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      const probe = probeServerBundleEntry(join(root, "dist"), override);
      expect(probe.entry).toBe(resolve(override));
      expect(probe.detectedFrom).toContain("explicit override");
    } finally {
      process.chdir(previousCwd);
    }
  });
});
