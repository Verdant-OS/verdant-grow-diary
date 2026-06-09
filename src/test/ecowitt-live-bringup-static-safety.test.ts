/**
 * EcoWitt Live Bring-Up — static safety scan.
 *
 * Asserts the page, view model, and live-evidence form rules do not
 * import/call Supabase, fetch, functions.invoke, model clients, Edge
 * Function helpers, ingest write helpers, alert/Action Queue writers,
 * device-control names, secrets, env values, or browser persistence/
 * clipboard APIs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE_PATH = "src/pages/EcowittLiveBringup.tsx";
const VM_PATH = "src/lib/ecowittLiveBringupViewModel.ts";
const FORM_PATH = "src/lib/ecowittLiveEvidenceFormRules.ts";
const TEMPLATES_PATH = "src/lib/ecowittLiveEvidenceTemplates.ts";
const UNIT_WARN_PATH = "src/lib/ecowittLiveEvidenceUnitWarningRules.ts";
const MULTI_PLANT_PATH = "src/lib/ecowittLiveEvidenceMultiPlantRules.ts";
const EXPORT_PATH = "src/lib/ecowittLiveEvidenceExportRules.ts";
const TONIGHT_PATH = "src/lib/ecowittTonightModeViewModel.ts";

function read(p: string): string {
  return readFileSync(resolve(ROOT, p), "utf8");
}

function stripComments(src: string): string {
  let r = src.replace(/\/\/.*$/gm, "");
  r = r.replace(/\/\*[\s\S]*?\*\//g, "");
  return r;
}

const pageSrc = read(PAGE_PATH);
const vmSrc = read(VM_PATH);
const formSrc = read(FORM_PATH);
const templatesSrc = read(TEMPLATES_PATH);
const unitWarnSrc = read(UNIT_WARN_PATH);
const multiPlantSrc = read(MULTI_PLANT_PATH);
const exportSrc = read(EXPORT_PATH);
const tonightSrc = read(TONIGHT_PATH);
const pageNoComments = stripComments(pageSrc);
const vmNoComments = stripComments(vmSrc);
const formNoComments = stripComments(formSrc);
const templatesNoComments = stripComments(templatesSrc);
const unitWarnNoComments = stripComments(unitWarnSrc);
const multiPlantNoComments = stripComments(multiPlantSrc);
const exportNoComments = stripComments(exportSrc);
const tonightNoComments = stripComments(tonightSrc);

// Targets for the strict no-browser-API/no-network/etc checks. The page is
// allowed to use Blob / URL / document for the local snapshot download, so
// it is handled separately below.
const libTargets: Array<[string, string]> = [
  ["view model", vmNoComments],
  ["form rules", formNoComments],
  ["templates", templatesNoComments],
  ["unit warning rules", unitWarnNoComments],
  ["multi-plant rules", multiPlantNoComments],
  ["export rules", exportNoComments],
  ["tonight mode view model", tonightNoComments],
];

const targets: Array<[string, string]> = [
  ["page", pageNoComments],
  ...libTargets,
];


const FORBIDDEN_DEVICE_NAMES = [
  "controlDevice",
  "executeDevice",
  "sendCommand",
  "turnOn",
  "turnOff",
  "setFan",
  "setLight",
  "setPump",
  "setHeater",
  "setHumidifier",
  "doseNutrients",
  "flushReservoir",
];

const FORBIDDEN_COPY = [
  "Execute",
  "Run command",
  "Send command",
  "Control device",
  "Turn on",
  "Turn off",
  "Set fan",
  "Set light",
  "Flush immediately",
  "Guaranteed",
  "Definitely",
  "Certainly",
];

describe("ecowitt-live-bringup — static safety", () => {
  it.each(targets)("[%s] does not import supabase client", (_, src) => {
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/from\s+["']@supabase/);
    expect(src).not.toMatch(/supabase\./);
  });

  it.each(targets)("[%s] does not call fetch or functions.invoke", (_, src) => {
    expect(src).not.toMatch(/fetch\s*\(/);
    expect(src).not.toMatch(/functions\.invoke/);
  });

  it.each(targets)("[%s] does not reference DB write helpers", (_, src) => {
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it.each(targets)("[%s] does not reference alerts/action_queue tables", (_, src) => {
    expect(src).not.toMatch(/from\(["']alerts["']\)/);
    expect(src).not.toMatch(/from\(["']action_queue["']\)/);
  });

  it.each(targets)("[%s] does not reference service_role/bridge token/secrets/env", (_, src) => {
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/bridge[-_ ]?token/i);
    expect(src).not.toMatch(/OPENAI_API_KEY/);
    expect(src).not.toMatch(/VITE_/);
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/sk-[A-Za-z0-9]/);
  });

  it.each(targets)("[%s] does not contain executable device-control names", (_, src) => {
    for (const name of FORBIDDEN_DEVICE_NAMES) {
      expect(src).not.toContain(name);
    }
  });

  it.each(targets)("[%s] does not import model/API clients", (_, src) => {
    expect(src).not.toMatch(/openai/i);
    expect(src).not.toMatch(/anthropic/i);
    expect(src).not.toMatch(/gemini/i);
    expect(src).not.toMatch(/gpt-/i);
    expect(src).not.toMatch(/calculateAiDoctorConfidence/);
    expect(src).not.toMatch(/generateMultimodalDiagnosisPhase1/);
    expect(src).not.toMatch(/compilePlantContextFromRows/);
  });

  it.each(targets)("[%s] does not use browser persistence or clipboard", (_, src) => {
    expect(src).not.toContain("localStorage");
    expect(src).not.toContain("sessionStorage");
    expect(src).not.toContain("navigator.clipboard");
  });

  it.each(libTargets)("[%s lib] does not use Blob/URL/document browser APIs", (_, src) => {
    // Browser download APIs are page-only; helpers must stay pure.
    expect(src).not.toMatch(/\bnew\s+Blob\b/);
    expect(src).not.toMatch(/URL\.createObjectURL/);
    expect(src).not.toMatch(/URL\.revokeObjectURL/);
    expect(src).not.toMatch(/document\.createElement/);
  });

  it.each(targets)("[%s] has no forbidden execution copy", (_, src) => {
    for (const phrase of FORBIDDEN_COPY) {
      expect(src).not.toMatch(new RegExp(phrase, "i"));
    }
  });

  it("page imports only react and local lib helpers", () => {
    const fromMatches = pageSrc.match(/from\s+["'][^"']+["']/g) || [];
    for (const m of fromMatches) {
      const ok =
        m.includes('"react"') ||
        m.includes("ecowittLiveBringupViewModel") ||
        m.includes("liveSourceTruthGateRules") ||
        m.includes("ecowittLiveEvidenceFormRules") ||
        m.includes("ecowittLiveEvidenceTemplates") ||
        m.includes("ecowittLiveEvidenceUnitWarningRules") ||
        m.includes("ecowittLiveEvidenceMultiPlantRules") ||
        m.includes("ecowittLiveEvidenceExportRules") ||
        m.includes("ecowittTonightModeViewModel");
      expect(ok).toBe(true);
    }
  });


  it("view model has no external imports", () => {
    const fromMatches = vmSrc.match(/from\s+["'][^"']+["']/g) || [];
    expect(fromMatches.length).toBe(0);
  });

  it("form rules only import from liveSourceTruthGateRules", () => {
    const fromMatches = formSrc.match(/from\s+["'][^"']+["']/g) || [];
    for (const m of fromMatches) {
      expect(m).toMatch(/liveSourceTruthGateRules/);
    }
  });

  it("form rules do not call Date.now", () => {
    expect(formNoComments).not.toMatch(/Date\.now\s*\(/);
  });

  it("templates / unit-warning / multi-plant / export / tonight rules do not call Date.now", () => {
    expect(templatesNoComments).not.toMatch(/Date\.now\s*\(/);
    expect(unitWarnNoComments).not.toMatch(/Date\.now\s*\(/);
    expect(multiPlantNoComments).not.toMatch(/Date\.now\s*\(/);
    expect(exportNoComments).not.toMatch(/Date\.now\s*\(/);
    expect(tonightNoComments).not.toMatch(/Date\.now\s*\(/);
  });

  it("new lib files import only from the local helper modules", () => {
    const ALLOWED =
      /ecowittLiveEvidenceFormRules|liveSourceTruthGateRules|ecowittLiveEvidenceUnitWarningRules|ecowittLiveEvidenceMultiPlantRules/;
    for (const src of [templatesSrc, unitWarnSrc, multiPlantSrc, exportSrc, tonightSrc]) {
      const fromMatches = src.match(/from\s+["'][^"']+["']/g) || [];
      for (const m of fromMatches) {
        expect(ALLOWED.test(m)).toBe(true);
      }
    }
  });
});

