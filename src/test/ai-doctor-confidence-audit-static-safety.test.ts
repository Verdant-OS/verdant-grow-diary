/**
 * AI Doctor Confidence Audit — Static Safety Tests.
 *
 * Ensures the page and view model do not import or reference:
 *   Supabase, fetch, functions.invoke, model clients, Edge Functions,
 *   ingest mutation helpers, alert write helpers, Action Queue write helpers,
 *   insert, update, upsert, delete, rpc, service_role, bridge token,
 *   or executable device-control names.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function readFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), ...segments), "utf-8");
}

function stripComments(src: string): string {
  let result = src.replace(/\/\/.*$/gm, "");
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");
  return result;
}

const PAGE_PATH = "src/pages/AiDoctorConfidenceAudit.tsx";
const VM_PATH = "src/lib/aiDoctorConfidenceAuditViewModel.ts";

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
  "Dose",
  "Flush immediately",
  "Guaranteed",
  "Definitely",
  "Certainly",
];

const FORBIDDEN_IMPORTS = [
  "calculateAiDoctorConfidence",
  "generateMultimodalDiagnosisPhase1",
  "compilePlantContextFromRows",
];

describe("AI Doctor Confidence Audit — static safety", () => {
  for (const filePath of [PAGE_PATH, VM_PATH]) {
    it(`${filePath} does not import from Supabase`, () => {
      const src = readFile(filePath);
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(src).not.toMatch(/\bsupabase\b/);
    });

    it(`${filePath} does not contain fetch(`, () => {
      expect(readFile(filePath)).not.toContain("fetch(");
    });

    it(`${filePath} does not contain functions.invoke`, () => {
      expect(readFile(filePath)).not.toContain("functions.invoke");
    });

    it(`${filePath} does not reference insert/update/upsert/delete/rpc`, () => {
      const src = readFile(filePath);
      expect(src).not.toMatch(/\binsert\b/i);
      expect(src).not.toMatch(/\bupdate\b/i);
      expect(src).not.toMatch(/\bupsert\b/i);
      expect(src).not.toMatch(/\bdelete\b/i);
      expect(src).not.toMatch(/\brpc\b/i);
    });

    it(`${filePath} does not contain service_role`, () => {
      expect(readFile(filePath)).not.toContain("service_role");
    });

    it(`${filePath} does not contain bridge token`, () => {
      expect(readFile(filePath)).not.toMatch(/bridge\s*token/i);
    });

    it(`${filePath} does not contain executable device-control names`, () => {
      const src = readFile(filePath);
      for (const name of FORBIDDEN_DEVICE_NAMES) {
        expect(src).not.toContain(name);
      }
    });

    it(`${filePath} does not import scoring/model/compiler adapters`, () => {
      const src = readFile(filePath);
      for (const name of FORBIDDEN_IMPORTS) {
        expect(src).not.toContain(name);
      }
    });

    it(`${filePath} (excluding comments) has no forbidden execution copy`, () => {
      const src = stripComments(readFile(filePath));
      for (const phrase of FORBIDDEN_COPY) {
        expect(src).not.toMatch(new RegExp(phrase, "i"));
      }
    });
  }

  it("page only imports from react, react-router-dom, and the local view model", () => {
    const src = readFile(PAGE_PATH);
    const fromMatches = src.match(/from\s+["'][^"']+["']/g) || [];
    for (const match of fromMatches) {
      const isReact = match.includes('"react"');
      const isRouter = match.includes('"react-router-dom"');
      const isViewModel = match.includes("aiDoctorConfidenceAuditViewModel");
      expect(isReact || isRouter || isViewModel).toBe(true);
    }
  });

  it("view model has no external imports", () => {
    const src = readFile(VM_PATH);
    const fromMatches = src.match(/from\s+["'][^"']+["']/g) || [];
    expect(fromMatches.length).toBe(0);
  });

  it("page does not import model/edge/ingest/alert/action helpers", () => {
    const src = stripComments(readFile(PAGE_PATH));
    const fromMatches = src.match(/from\s+["'][^"']+["']/g) || [];
    for (const match of fromMatches) {
      if (match.includes("aiDoctorConfidenceAuditViewModel")) continue;
      if (match.includes('"react"')) continue;
      if (match.includes('"react-router-dom"')) continue;
      expect(match).not.toMatch(/model|edge|ingest|alert|action/i);
    }
  });
});
