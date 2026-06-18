/**
 * Static safety scan for the Pheno Hunt Start Page v0 slice.
 *
 * Guards against scope creep into AI, alerts, Action Queue, device control,
 * marketplace/sales copy, write paths, or service-role exposure.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const RULES = read("src/lib/phenoHuntStartPageRules.ts");
const VM = read("src/lib/phenoHuntStartPageViewModel.ts");
const COMPONENT = read("src/components/PhenoHuntStartPage.tsx");
const PAGE = read("src/pages/PhenoHuntNew.tsx");
const APP = read("src/App.tsx");

const PURE_FILES = [
  { name: "rules", src: RULES },
  { name: "view-model", src: VM },
];
const ALL_SLICE = [
  { name: "rules", src: RULES },
  { name: "view-model", src: VM },
  { name: "component", src: COMPONENT },
  { name: "page", src: PAGE },
];

describe("pheno hunt start page — static safety", () => {
  it.each(PURE_FILES)("$name is pure (no React/Supabase/toast)", ({ src }) => {
    expect(src).not.toMatch(/from\s+["']react["']/);
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/sonner/);
  });

  it.each(ALL_SLICE)("$name does not import AI / model / coach helpers", ({ src }) => {
    expect(src).not.toMatch(/@\/lib\/ai\//);
    expect(src).not.toMatch(/aiDoctor/i);
    expect(src).not.toMatch(/aiCoach/i);
    expect(src).not.toMatch(/openai|anthropic/i);
  });

  it.each(ALL_SLICE)("$name does not import alerts", ({ src }) => {
    expect(src).not.toMatch(/@\/lib\/alerts/);
    expect(src).not.toMatch(/alertActionQueue/);
  });

  it.each(ALL_SLICE)("$name does not import Action Queue helpers", ({ src }) => {
    expect(src).not.toMatch(/actionQueue/i);
  });

  it.each(ALL_SLICE)("$name does not import device-control helpers", ({ src }) => {
    expect(src).not.toMatch(/deviceControl|device_control/);
    expect(src).not.toMatch(/bridgeToken/);
  });

  it.each(ALL_SLICE)("$name does not import customer/public mode", ({ src }) => {
    expect(src).not.toMatch(/customerMode|@\/lib\/customerMode/);
    expect(src).not.toMatch(/publicMode/);
  });

  // Skip the rules module itself — it intentionally encodes the forbidden
  // patterns to detect them. Scan the user-visible / runtime files.
  const COPY_FILES = ALL_SLICE.filter((f) => f.name !== "rules");
  it.each(COPY_FILES)("$name does not contain marketplace/sales copy", ({ src }) => {
    expect(src).not.toMatch(/marketplace/i);
    expect(src).not.toMatch(/\bresale\b/i);
    expect(src).not.toMatch(/seed sale/i);
    expect(src).not.toMatch(/clone sale/i);
    expect(src).not.toMatch(/guaranteed (keeper|phenotype)/i);
    expect(src).not.toMatch(/genetic certainty\b(?! claims)/i); // safety note may use "certainty claims"
  });

  it("page does not perform Supabase writes (read-only)", () => {
    expect(PAGE).not.toMatch(/\.insert\(/);
    expect(PAGE).not.toMatch(/\.update\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/\.upsert\(/);
  });

  it.each(ALL_SLICE)("$name does not expose service role or tokens", ({ src }) => {
    expect(src).not.toMatch(/SERVICE_ROLE/i);
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/bridge_token/i);
  });

  it("route is mounted inside the protected AppShell block, not in the public routes", () => {
    expect(APP).toMatch(/\/pheno-hunts\/new/);
    // Public routes live before the AppShell block. Ensure the pheno-hunts
    // route is registered after the AppShell mount.
    const appShellIdx = APP.indexOf("<AppShell");
    const phenoIdx = APP.indexOf("/pheno-hunts/new");
    expect(appShellIdx).toBeGreaterThan(-1);
    expect(phenoIdx).toBeGreaterThan(appShellIdx);
  });
});
