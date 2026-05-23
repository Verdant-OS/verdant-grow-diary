/**
 * Static guardrails for the V0 release candidate documentation package.
 *
 * Verifies that the three RC docs exist and cover the required surface:
 *   - release candidate summary
 *   - partner demo script
 *   - manual QA checklist
 *
 * Docs-only. No product behavior asserted here — the behavioral contract
 * lives in src/test/v0-operating-loop-contract.test.ts.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const RC = resolve(ROOT, "docs/v0-release-candidate.md");
const DEMO = resolve(ROOT, "docs/v0-partner-demo-script.md");
const QA = resolve(ROOT, "docs/v0-manual-qa-checklist.md");

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

describe("V0 release candidate · docs exist", () => {
  it("docs/v0-release-candidate.md exists", () => {
    expect(existsSync(RC)).toBe(true);
  });
  it("docs/v0-partner-demo-script.md exists", () => {
    expect(existsSync(DEMO)).toBe(true);
  });
  it("docs/v0-manual-qa-checklist.md exists", () => {
    expect(existsSync(QA)).toBe(true);
  });
});

describe("V0 release candidate · shared content contract", () => {
  const combined = (read(RC) + "\n" + read(DEMO) + "\n" + read(QA)).toLowerCase();

  it.each([
    ["full v0 operating loop (grow → tent → plant)", /grow.*tent.*plant/],
    ["operating loop reaches action queue", /action queue/],
    ["no automation", /no automation/],
    ["no device control", /no device control/],
    ["approval-required actions", /approval-required/],
    ["no fake live sensor data", /no fake live sensor data/],
    ["hardware-neutral positioning", /hardware-neutral/],
    ["read-only partner value", /read-only/],
    ["stop-ship conditions", /stop-ship/],
    [
      "does not over-claim native hardware integrations",
      /not (native )?(certified )?(partner )?integration|hardware-neutral/,
    ],
  ])("docs mention %s", (_label, re) => {
    expect(combined).toMatch(re);
  });

  it("any 1886/1886 reference is labeled as historical V0 RC baseline", () => {
    for (const path of [RC, DEMO, QA]) {
      const text = read(path);
      if (/1886\s*\/\s*1886/.test(text)) {
        expect(text.toLowerCase()).toMatch(/historical/);
        expect(text).toContain("docs/v0-release-checkpoint.md");
      }
    }
  });

  it("current-baseline pointer references docs/v0-release-checkpoint.md", () => {
    expect(combined).toContain("docs/v0-release-checkpoint.md");
  });


  it.each([
    ["grow-room mode", /grow-room mode/],
    ["real sensor ingestion adapter", /sensor ingestion adapter/],
    ["AI Doctor context upgrade", /ai doctor context upgrade/],
    [
      "PPFD / soil EC / reservoir schema expansion",
      /ppfd.*soil ec.*reservoir.*schema/,
    ],
  ])("next build order includes %s", (_label, re) => {
    expect(combined).toMatch(re);
  });
});

describe("V0 release candidate · RC summary specifics", () => {
  const rc = read(RC).toLowerCase();

  it("calls itself a release candidate", () => {
    expect(rc).toMatch(/release candidate/);
  });

  it("references the contract test for stop-ship", () => {
    expect(rc).toContain("src/test/v0-operating-loop-contract.test.ts");
  });

  it("links to demo script and QA checklist", () => {
    expect(rc).toContain("docs/v0-partner-demo-script.md");
    expect(rc).toContain("docs/v0-manual-qa-checklist.md");
  });

  it("lists known limitations (ingestion, AI Doctor, schema, automation)", () => {
    expect(rc).toMatch(/known limitations/);
    expect(rc).toMatch(/ingestion adapter/);
    expect(rc).toMatch(/ai doctor/);
    expect(rc).toMatch(/ppfd/);
    expect(rc).toMatch(/automation/);
  });
});

describe("V0 release candidate · partner demo specifics", () => {
  const d = read(DEMO).toLowerCase();

  it.each([
    /hardware-neutral/,
    /do not replace/,
    /your hardware collects the data/,
    /plant memory/,
    /approval-required/,
    /no blind autopilot/,
    /read-only/,
    /grower stays in control/,
  ])("partner demo says %s", (re) => {
    expect(d).toMatch(re);
  });
});

describe("V0 release candidate · manual QA specifics", () => {
  const q = read(QA);

  it.each([
    /select.*grow/i,
    /select.*tent/i,
    /select.*plant/i,
    /diary entry/i,
    /manual sensor reading/i,
    /dashboard latest environment/i,
    /environment alert/i,
    /alert detail/i,
    /add to action queue/i,
    /already in action queue/i,
    /pending_approval/i,
    /advisory/i,
    /device command/i,
    /stale source-alert warning/i,
    /v0 safety contract/i,
  ])("QA checklist covers %s", (re) => {
    expect(q).toMatch(re);
  });
});
