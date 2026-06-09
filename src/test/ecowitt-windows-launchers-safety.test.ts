/**
 * Static safety scan for the generated EcoWitt Windows launchers and
 * for scripts/dev/ecowitt-windows-doctor.ts itself.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildLauncherFiles } from "../../scripts/dev/ecowitt-windows-doctor";

const SCRIPT_PATH = resolve(__dirname, "../../scripts/dev/ecowitt-windows-doctor.ts");
const SRC = readFileSync(SCRIPT_PATH, "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("ecowitt-windows-doctor — static safety", () => {
  it("does not import supabase SDK", () => {
    expect(SRC).not.toMatch(/@supabase\/supabase-js/);
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
  });
  it("performs no DB writes", () => {
    expect(CODE).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
  });
  it("never references service_role or action_queue or device control", () => {
    expect(CODE).not.toMatch(/service[_-]?role/i);
    expect(CODE).not.toMatch(/action_queue/i);
    expect(CODE).not.toMatch(/device_command|relay_on|valve_open|light_on/i);
  });
  it("never reads VERDANT_BRIDGE_TOKEN or Supabase env values", () => {
    expect(CODE).not.toMatch(/VERDANT_BRIDGE_TOKEN/);
    expect(CODE).not.toMatch(/SUPABASE_/);
  });
  it("does not call fetch — diagnostic tool only", () => {
    expect(CODE).not.toMatch(/\bfetch\s*\(/);
  });
});

describe("ecowitt windows launchers — generated content safety", () => {
  const launchers = buildLauncherFiles("C:\\repo");

  it("only the documented filenames are generated", () => {
    expect(Object.keys(launchers).sort()).toEqual([
      "01-watch-mqtt.cmd",
      "02-start-http-bridge.cmd",
      "03-test-http-bridge.cmd",
      "04-run-mqtt-dry-run.cmd",
      "README.txt",
    ]);
  });

  it("uses quoted paths in every .cmd", () => {
    for (const [name, body] of Object.entries(launchers)) {
      if (!name.endsWith(".cmd")) continue;
      // Either there is no Windows path, or any path appears inside quotes.
      const matches = body.match(/[A-Z]:\\[^\s"]+/g) ?? [];
      for (const p of matches) {
        const idx = body.indexOf(p);
        const before = body.slice(Math.max(0, idx - 1), idx);
        const after = body.slice(idx + p.length, idx + p.length + 1);
        expect(before === '"' && after === '"').toBe(true);
      }
    }
  });

  it("README explains the workflow and warnings", () => {
    const r = launchers["README.txt"];
    expect(r).toMatch(/Mosquitto/);
    expect(r).toMatch(/ecowitt\/grow/);
    expect(r).toMatch(/RECOMMENDED IPv4/);
    expect(r).toMatch(/8080/);
    expect(r).toMatch(/Never paste bridge tokens/i);
    expect(r).toMatch(/Never paste service_role/i);
    expect(r).toMatch(/Live send is NOT part of this fast path/i);
  });

  it("launchers contain no live sender, no Supabase webhook, no token, no service_role", () => {
    const all = Object.values(launchers).join("\n");
    expect(all).not.toMatch(/VERDANT_BRIDGE_TOKEN/);
    expect(all).not.toMatch(/service[_-]?role/i);
    expect(all).not.toMatch(/sensor-ingest-webhook/);
    expect(all).not.toMatch(/supabase\.co/i);
    // Live sender shortcut is the `dev:send-ecowitt` / live runner — not the dry-run.
    expect(all).not.toMatch(/dev:send-ecowitt\b/);
    expect(all).not.toMatch(/dev:ecowitt-mqtt"/); // only the :dry-run variant
  });

  it("repo-command launchers begin with cd /d <repo-root> so they work from anywhere", () => {
    expect(launchers["02-start-http-bridge.cmd"]).toMatch(/^@echo off\r\nchcp 65001 >nul\r\ncd \/d "C:\\repo"/);
    expect(launchers["04-run-mqtt-dry-run.cmd"]).toMatch(/^@echo off\r\nchcp 65001 >nul\r\ncd \/d "C:\\repo"/);
  });

  it("test launcher clearly labels FAKE LOCAL TEST PAYLOAD", () => {
    expect(launchers["03-test-http-bridge.cmd"]).toMatch(/FAKE LOCAL TEST PAYLOAD/);
  });
});
