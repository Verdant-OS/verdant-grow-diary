/**
 * Sensor Truth Audit — Static Safety Tests.
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

const PAGE_PATH = "src/pages/SensorTruthAudit.tsx";
const VM_PATH = "src/lib/sensorTruthAuditViewModel.ts";

describe("sensor truth audit static safety", () => {
  it("page does not import from Supabase", () => {
    const src = readFile(PAGE_PATH);
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/from\s+["']\.\.\/integrations\/supabase/);
    expect(src).not.toMatch(/supabase\b/);
  });

  it("view model does not import from Supabase", () => {
    const src = readFile(VM_PATH);
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/supabase\b/);
  });

  it("page does not contain fetch(", () => {
    const src = readFile(PAGE_PATH);
    expect(src).not.toContain("fetch(");
  });

  it("view model does not contain fetch(", () => {
    const src = readFile(VM_PATH);
    expect(src).not.toContain("fetch(");
  });

  it("page does not contain functions.invoke", () => {
    const src = readFile(PAGE_PATH);
    expect(src).not.toContain("functions.invoke");
  });

  it("view model does not contain functions.invoke", () => {
    const src = readFile(VM_PATH);
    expect(src).not.toContain("functions.invoke");
  });

  it("page does not reference insert / update / upsert / delete / rpc", () => {
    const src = readFile(PAGE_PATH);
    expect(src).not.toMatch(/\binsert\b/);
    expect(src).not.toMatch(/\bupdate\b/);
    expect(src).not.toMatch(/\bupsert\b/);
    expect(src).not.toMatch(/\bdelete\b/);
    expect(src).not.toMatch(/\brpc\b/);
  });

  it("view model does not reference insert / update / upsert / delete / rpc", () => {
    const src = readFile(VM_PATH);
    expect(src).not.toMatch(/\binsert\b/);
    expect(src).not.toMatch(/\bupdate\b/);
    expect(src).not.toMatch(/\bupsert\b/);
    expect(src).not.toMatch(/\bdelete\b/);
    expect(src).not.toMatch(/\brpc\b/);
  });

  it("page does not contain service_role", () => {
    const src = readFile(PAGE_PATH);
    expect(src).not.toContain("service_role");
  });

  it("view model does not contain service_role", () => {
    const src = readFile(VM_PATH);
    expect(src).not.toContain("service_role");
  });

  it("page does not contain bridge token", () => {
    const src = readFile(PAGE_PATH);
    expect(src).not.toMatch(/bridge\s*token/i);
  });

  it("view model does not contain bridge token", () => {
    const src = readFile(VM_PATH);
    expect(src).not.toMatch(/bridge\s*token/i);
  });

  it("page does not contain executable device-control names", () => {
    const src = readFile(PAGE_PATH);
    const forbidden = [
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
    for (const name of forbidden) {
      expect(src).not.toContain(name);
    }
  });

  it("view model does not contain executable device-control names", () => {
    const src = readFile(VM_PATH);
    const forbidden = [
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
    for (const name of forbidden) {
      expect(src).not.toContain(name);
    }
  });

  it("page does not import model/edge/ingest/alert/action helpers", () => {
    const src = readFile(PAGE_PATH);
    expect(src).not.toMatch(/from\s+["'].*(?:model|edge|ingest|alert|action)/i);
    expect(src).not.toMatch(/from\s+["'].*ai-doctor/i);
    expect(src).not.toMatch(/from\s+["'].*confidence/i);
  });

  it("view model does not import model/edge/ingest/alert/action helpers", () => {
    const src = readFile(VM_PATH);
    expect(src).not.toMatch(/from\s+["'].*(?:model|edge|ingest|alert|action)/i);
    expect(src).not.toMatch(/from\s+["'].*ai-doctor/i);
    expect(src).not.toMatch(/from\s+["'].*confidence/i);
  });

  it("page does not contain forbidden execution copy", () => {
    const src = readFile(PAGE_PATH);
    const forbidden = [
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
    for (const phrase of forbidden) {
      expect(src).not.toMatch(new RegExp(phrase, "i"));
    }
  });

  it("view model does not contain forbidden execution copy", () => {
    const src = readFile(VM_PATH);
    const forbidden = [
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
    for (const phrase of forbidden) {
      expect(src).not.toMatch(new RegExp(phrase, "i"));
    }
  });

  it("page only imports from react and the local view model", () => {
    const src = readFile(PAGE_PATH);
    const importLines = src
      .split("\n")
      .filter((l) => l.trim().startsWith("import"));
    for (const line of importLines) {
      const isReact = line.includes("from \"react\"");
      const isViewModel = line.includes("sensorTruthAuditViewModel");
      expect(isReact || isViewModel).toBe(true);
    }
  });
});
