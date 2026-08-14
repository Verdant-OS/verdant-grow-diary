/**
 * #569 — listPhenoHuntsForOwner maps `name` from the row only (no join with
 * grow name or defaultHuntName). Concatenated labels are stored data.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const SERVICE = readFileSync(resolve(__dirname, "../lib/phenoHuntCandidatesService.ts"), "utf8");
const INDEX = readFileSync(resolve(__dirname, "../pages/PhenoHuntsIndex.tsx"), "utf8");

describe("pheno hunt name mapping (#569)", () => {
  it("listPhenoHuntsForOwner assigns name from row.name only", () => {
    const fn = SERVICE.slice(SERVICE.indexOf("export async function listPhenoHuntsForOwner"));
    const body = fn.slice(0, fn.indexOf("export async function loadPhenoHuntCandidates"));
    expect(body).toMatch(/name:\s*row\.name\s*\?\?\s*["']Untitled hunt["']/);
    expect(body).not.toMatch(/defaultHuntName/);
    expect(body).not.toMatch(/grow.*name.*\+/);
    expect(body).not.toMatch(/name\s*\+/);
  });

  it("PhenoHuntsIndex renders h.name once per card heading", () => {
    expect(INDEX).toMatch(/\{h\.name\}/);
    // Single heading interpolation — no adjacent name fields.
    const headingHits = INDEX.match(/<h2[^>]*>\{h\.name\}<\/h2>/g) ?? [];
    expect(headingHits.length).toBe(1);
    expect(INDEX).not.toMatch(/\{h\.name\}\s*\{/);
    expect(INDEX).not.toMatch(/defaultHuntName/);
  });
});
