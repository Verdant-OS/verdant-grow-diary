/**
 * Build contract for Verdant's Vite manual chunk strategy.
 *
 * Locks the invariant established in PR #138: the React-context / eval-order
 * graph (react, react-dom, react-router, @tanstack/*, @radix-ui/*, sonner,
 * form libs) MUST stay together in the single `vendor` chunk, and only
 * React-context-free leaf libraries may be split into their own chunks.
 *
 * Splitting the React graph into sibling manual chunks does not guarantee the
 * react chunk initializes first and reintroduces the "Cannot read properties
 * of undefined (reading 'createContext')" white-screen. This test fails loudly
 * if a future build optimization tries it.
 */
import { describe, it, expect } from "vitest";
import { viteManualChunks } from "@/lib/build/manualChunks";

const CONTEXT_INVARIANT_MESSAGE =
  "Do not split React-context/eval-order libraries out of `vendor`; this can " +
  "reintroduce createContext white-screen failures. See src/lib/build/manualChunks.ts.";

/** Build a realistic absolute module id under node_modules (POSIX + Windows). */
function nodeId(pkgRelPath: string): string {
  return `/Users/x/project/node_modules/${pkgRelPath}`;
}
function winNodeId(pkgRelPath: string): string {
  return `C:\\project\\node_modules\\${pkgRelPath.replace(/\//g, "\\")}`;
}

describe("vite manualChunks — React-context graph stays in `vendor`", () => {
  const CONTEXT_GRAPH = [
    "react/index.js",
    "react-dom/client.js",
    "react-router/dist/index.js",
    "react-router-dom/dist/index.js",
    "@tanstack/react-query/build/index.js",
    "@tanstack/query-core/build/index.js",
    "@radix-ui/react-dialog/dist/index.js",
    "@radix-ui/react-tabs/dist/index.js",
    "@radix-ui/react-select/dist/index.js",
    "sonner/dist/index.js",
    "react-hook-form/dist/index.js",
  ];

  it.each(CONTEXT_GRAPH)("%s → vendor (posix id)", (rel) => {
    expect(viteManualChunks(nodeId(rel)), CONTEXT_INVARIANT_MESSAGE).toBe("vendor");
  });

  it.each(CONTEXT_GRAPH)("%s → vendor (windows id)", (rel) => {
    expect(viteManualChunks(winNodeId(rel)), CONTEXT_INVARIANT_MESSAGE).toBe("vendor");
  });

  it("none of the React-context graph leaks into a non-vendor chunk", () => {
    for (const rel of CONTEXT_GRAPH) {
      const chunk = viteManualChunks(nodeId(rel));
      expect(
        chunk === "vendor",
        `${rel} resolved to "${chunk}" but must be "vendor". ${CONTEXT_INVARIANT_MESSAGE}`,
      ).toBe(true);
    }
  });
});

describe("vite manualChunks — leaf libraries stay split", () => {
  const LEAF_CASES: Array<[string, string]> = [
    ["@supabase/supabase-js/dist/module/index.js", "vendor-supabase"],
    ["@supabase/auth-js/dist/module/index.js", "vendor-supabase"],
    ["@supabase/realtime-js/dist/module/index.js", "vendor-supabase"],
    ["@supabase/postgrest-js/dist/index.js", "vendor-supabase"],
    ["@supabase/storage-js/dist/index.js", "vendor-supabase"],
    ["zod/lib/index.js", "vendor-utils"],
    ["date-fns/index.js", "vendor-utils"],
    ["lucide-react/dist/esm/lucide-react.js", "vendor-icons"],
    ["recharts/es6/index.js", "vendor-charts"],
    ["xlsx/xlsx.mjs", "vendor-export"],
    ["jszip/dist/jszip.min.js", "vendor-export"],
  ];

  it.each(LEAF_CASES)("%s → %s (posix)", (rel, chunk) => {
    expect(viteManualChunks(nodeId(rel))).toBe(chunk);
  });

  it.each(LEAF_CASES)("%s → %s (windows)", (rel, chunk) => {
    expect(viteManualChunks(winNodeId(rel))).toBe(chunk);
  });

  it("leaf chunks have not collapsed back into `vendor`", () => {
    for (const [rel, expectedChunk] of LEAF_CASES) {
      const chunk = viteManualChunks(nodeId(rel));
      expect(chunk, `${rel} collapsed into "${chunk}" but must stay in "${expectedChunk}".`).toBe(
        expectedChunk,
      );
      expect(chunk).not.toBe("vendor");
    }
  });
});

describe("vite manualChunks — app source is never forced into a vendor chunk", () => {
  const APP_IDS = [
    "/Users/x/project/src/App.tsx",
    "/Users/x/project/src/pages/Dashboard.tsx",
    "/Users/x/project/src/lib/build/manualChunks.ts",
    "C:\\project\\src\\components\\AppShell.tsx",
    "\0virtual:some-plugin-module",
  ];

  it.each(APP_IDS)("%s → undefined (let Rollup group with its route)", (id) => {
    expect(viteManualChunks(id)).toBeUndefined();
  });
});

describe("vite manualChunks — the config actually uses this helper", () => {
  it("vite.config.ts wires manualChunks to the shared helper and nothing else", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const config = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

    // The config must import and reference the shared helper by name.
    expect(config).toMatch(/from ["']\.\/src\/lib\/build\/manualChunks["']/);
    expect(config).toMatch(/manualChunks:\s*viteManualChunks\b/);

    // Allowlist every `manualChunks` mention instead of blacklisting one
    // inline syntax (a blacklist misses `manualChunks: (id) => {…}`,
    // `manualChunks: function (id) {…}`, method shorthand, etc.). Each line
    // that mentions the identifier must be either the helper's import path
    // or the exact sanctioned wiring — any inline implementation fails.
    const mentions = config.match(/^.*\bmanualChunks\b.*$/gm) ?? [];
    expect(mentions.length).toBeGreaterThan(0);
    for (const line of mentions) {
      const isImportPathOrComment = line.includes("build/manualChunks");
      const isSanctionedWiring = /manualChunks:\s*viteManualChunks\s*,?\s*$/.test(line.trim());
      expect(
        isImportPathOrComment || isSanctionedWiring,
        `Unsanctioned manualChunks usage in vite.config.ts: "${line.trim()}". ` +
          "Do not inline a manualChunks implementation (function, arrow, or method " +
          "shorthand) — route it through src/lib/build/manualChunks.ts so this " +
          "contract test stays authoritative. Splitting React-context/eval-order " +
          "libraries out of `vendor` can reintroduce createContext white-screen failures.",
      ).toBe(true);
    }
  });
});
