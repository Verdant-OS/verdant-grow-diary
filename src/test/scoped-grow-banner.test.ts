/**
 * Static tests for the improved scoped grow context banners across
 * Logs/Timeline, Plants, Tents, and Action Queue.
 *
 * Verifies:
 *  - Banner resolves the grow from the authenticated user's loaded grows list.
 *  - When the grow is valid, the banner renders the grow name and a Back to Grow link.
 *  - When invalid/unavailable, the safe generic fallback copy is preserved.
 *  - The existing Clear grow filter link is preserved on every page.
 *  - No ai-coach / device-control / service_role surface is introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PLANTS = readFileSync(resolve(ROOT, "src/pages/Plants.tsx"), "utf8");
const TENTS = readFileSync(resolve(ROOT, "src/pages/Tents.tsx"), "utf8");
const TIMELINE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const ACTIONQ = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");

const SAFE = (src: string) => {
  expect(src).not.toMatch(/ai-coach|ai_coach/);
  expect(src).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i);
};

describe("Plants — scoped banner", () => {
  it("resolves growId against loaded grows", () => {
    expect(PLANTS).toMatch(/grows\.find\(\s*\(\s*g\s*\)\s*=>\s*g\.id\s*===\s*growId\s*\)/);
  });
  it("renders grow name when valid", () => {
    expect(PLANTS).toMatch(/Showing plants for\s*<[^>]*>\{scopedGrow\.name\}/);
  });
  it("renders Back to Grow link to /grows/:id when valid", () => {
    expect(PLANTS).toMatch(/to=\{`\/grows\/\$\{scopedGrow\.id\}`\}/);
    expect(PLANTS).toMatch(/Back to Grow/);
  });
  it("keeps safe fallback copy", () => {
    expect(PLANTS).toMatch(/Showing plants for this grow/);
  });
  it("keeps Clear grow filter link", () => {
    expect(PLANTS).toMatch(/to=\s*["']\/plants["'][^>]*>Clear grow filter/);
  });
  it("safe surface", () => SAFE(PLANTS));
});

describe("Tents — scoped banner", () => {
  it("resolves growId against loaded grows", () => {
    expect(TENTS).toMatch(/grows\.find\(\s*\(\s*g\s*\)\s*=>\s*g\.id\s*===\s*growId\s*\)/);
  });
  it("renders grow name when valid", () => {
    expect(TENTS).toMatch(/Showing tents for\s*<[^>]*>\{scopedGrow\.name\}/);
  });
  it("renders Back to Grow link to /grows/:id when valid", () => {
    expect(TENTS).toMatch(/to=\{`\/grows\/\$\{scopedGrow\.id\}`\}/);
    expect(TENTS).toMatch(/Back to Grow/);
  });
  it("keeps safe fallback copy", () => {
    expect(TENTS).toMatch(/Showing tents for this grow/);
  });
  it("keeps Clear grow filter link", () => {
    expect(TENTS).toMatch(/to=\s*["']\/tents["'][^>]*>Clear grow filter/);
  });
  it("safe surface", () => SAFE(TENTS));
});

describe("Timeline/Logs — scoped banner", () => {
  it("resolves urlGrowId against loaded grows", () => {
    expect(TIMELINE).toMatch(/grows\.find\(\s*\(\s*g\s*\)\s*=>\s*g\.id\s*===\s*urlGrowId\s*\)/);
  });
  it("renders grow name with scope label when valid", () => {
    expect(TIMELINE).toMatch(/Showing \{scopeLabel\} for\s*<[^>]*>\{scopedGrow\.name\}/);
  });
  it("renders Back to Grow link to /grows/:id when valid", () => {
    expect(TIMELINE).toMatch(/to=\{`\/grows\/\$\{scopedGrow\.id\}`\}/);
    expect(TIMELINE).toMatch(/Back to Grow/);
  });
  it("keeps safe fallback copy", () => {
    expect(TIMELINE).toMatch(/Showing \{scopeLabel\} for this grow/);
  });
  it("keeps Clear grow filter link", () => {
    expect(TIMELINE).toMatch(/Clear grow filter/);
  });
  it("safe surface", () => SAFE(TIMELINE));
});

describe("ActionQueue — scoped banner", () => {
  it("resolves urlGrowId against loaded grows", () => {
    expect(ACTIONQ).toMatch(/grows\.find\(\s*\(\s*g\s*\)\s*=>\s*g\.id\s*===\s*urlGrowId\s*\)/);
  });
  it("renders grow name when valid", () => {
    expect(ACTIONQ).toMatch(/Showing actions for\s*<[^>]*>\{scopedGrow\.name\}/);
  });
  it("renders Back to Grow link to /grows/:id when valid", () => {
    expect(ACTIONQ).toMatch(/to=\{`\/grows\/\$\{scopedGrow\.id\}`\}/);
    expect(ACTIONQ).toMatch(/Back to Grow/);
  });
  it("keeps safe fallback copy", () => {
    expect(ACTIONQ).toMatch(/Showing actions for this grow/);
  });
  it("keeps Clear grow filter link to /actions", () => {
    expect(ACTIONQ).toMatch(/to=\s*["']\/actions["']/);
    expect(ACTIONQ).toMatch(/Clear grow filter/);
  });
  it("safe surface", () => SAFE(ACTIONQ));
});
