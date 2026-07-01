/**
 * Pheno Comparison — static safety scan.
 *
 * Proves the surface is read-only at the source level, independent of what
 * any single render happens to exercise:
 *   - No Supabase client import and no write calls
 *     (.insert/.update/.delete/.upsert/.rpc).
 *   - No pheno-hunt write helpers (createPhenoHunt / deletePhenoHunt).
 *   - No network I/O (fetch / XMLHttpRequest).
 *   - Presenter has no click handlers / interactive write controls.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

const LIB_FILES = [
  "lib/phenoComparisonRules.ts",
  "lib/phenoComparisonViewModel.ts",
  "lib/phenoComparisonFixtures.ts",
  "lib/phenoSelectionRules.ts",
];
const PAGE_FILE = "pages/PhenoComparison.tsx";
const ALL_FILES = [...LIB_FILES, PAGE_FILE];

const WRITE_CALL_PATTERNS = [
  /\.insert\s*\(/,
  /\.update\s*\(/,
  /\.delete\s*\(/,
  /\.upsert\s*\(/,
  /\.rpc\s*\(/,
];

const FORBIDDEN_IMPORTS = [
  "@/integrations/supabase",
  "phenoHuntService",
  "createPhenoHunt",
  "deletePhenoHunt",
];

describe("pheno-comparison static safety", () => {
  it.each(ALL_FILES)("%s performs no write calls", (file) => {
    const src = read(file);
    for (const pattern of WRITE_CALL_PATTERNS) {
      expect(pattern.test(src), `${file} matches ${pattern}`).toBe(false);
    }
  });

  it.each(ALL_FILES)("%s imports no write helpers or supabase client", (file) => {
    const src = read(file);
    for (const token of FORBIDDEN_IMPORTS) {
      expect(src.includes(token), `${file} references ${token}`).toBe(false);
    }
  });

  it.each(ALL_FILES)("%s performs no network I/O", (file) => {
    const src = read(file);
    expect(/\bfetch\s*\(/.test(src)).toBe(false);
    expect(src.includes("XMLHttpRequest")).toBe(false);
    expect(src.includes("sendBeacon")).toBe(false);
    expect(src.includes("WebSocket")).toBe(false);
    expect(src.includes("EventSource")).toBe(false);
    expect(src.includes("supabase")).toBe(false);
  });

  it("the presenter has no click handlers or interactive controls", () => {
    const src = read(PAGE_FILE);
    expect(src.includes("onClick")).toBe(false);
    expect(src.includes("onSubmit")).toBe(false);
    for (const tag of ["button", "form", "input", "select", "textarea"]) {
      expect(new RegExp(`<${tag}\\b`).test(src), `<${tag}> present`).toBe(false);
    }
  });

  it("the rules + view model stay pure (no React imports)", () => {
    for (const file of LIB_FILES) {
      const src = read(file);
      expect(src.includes('from "react"')).toBe(false);
      expect(src.includes('from "@/integrations')).toBe(false);
    }
  });

  it("mounts /pheno-comparison OUTSIDE the providers and AppShell", () => {
    // GrowsProvider reads real grow rows on mount for signed-in users, and
    // AppShell renders global write chrome (fast-add button, Quick Log FAB +
    // sheet). The read-only preview must be mounted before AuthProvider,
    // GrowsProvider, and the AppShell wrapper so none of that runs/renders.
    const app = read("App.tsx");
    const routeIdx = app.indexOf('path="/pheno-comparison"');
    expect(routeIdx).toBeGreaterThan(-1);
    for (const marker of ["<AuthProvider>", "<GrowsProvider>", "<Route element={<AppShell"]) {
      const idx = app.indexOf(marker);
      expect(idx, `${marker} not found`).toBeGreaterThan(-1);
      expect(routeIdx, `route should precede ${marker}`).toBeLessThan(idx);
    }
  });
});
