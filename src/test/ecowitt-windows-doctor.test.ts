/**
 * Tests for scripts/dev/ecowitt-windows-doctor.ts
 *
 * Covers:
 *  - detectIpCandidates excludes 127.*, 169.254.*, and labels virtual adapters
 *  - recommendedIp prefers a real LAN address
 *  - buildDoctorReport emits Ecowitt app settings and next commands
 *  - report contains no Supabase env values or bridge tokens
 *  - writeLaunchers refuses paths outside tmp/ecowitt-windows/
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildDoctorReport,
  buildLauncherFiles,
  detectIpCandidates,
  recommendedIp,
  writeLaunchers,
} from "../../scripts/dev/ecowitt-windows-doctor";

const fakeIfaces = (): ReturnType<typeof import("node:os").networkInterfaces> => ({
  lo: [{ address: "127.0.0.1", netmask: "255.0.0.0", family: "IPv4", mac: "00:00:00:00:00:00", internal: true, cidr: "127.0.0.1/8" }],
  "Ethernet 2": [
    { address: "192.168.1.42", netmask: "255.255.255.0", family: "IPv4", mac: "aa:bb", internal: false, cidr: "192.168.1.42/24" },
  ],
  "vEthernet (WSL)": [
    { address: "172.20.16.1", netmask: "255.255.240.0", family: "IPv4", mac: "aa:bb", internal: false, cidr: "172.20.16.1/20" },
  ],
  "vEthernet (Default Switch)": [
    { address: "169.254.10.1", netmask: "255.255.0.0", family: "IPv4", mac: "aa:bb", internal: false, cidr: "169.254.10.1/16" },
  ],
});

describe("detectIpCandidates", () => {
  it("excludes 127.* and 169.254.* and flags virtual adapters", () => {
    const c = detectIpCandidates(fakeIfaces());
    const addrs = c.map((x) => x.address);
    expect(addrs).not.toContain("127.0.0.1");
    expect(addrs).not.toContain("169.254.10.1");
    expect(addrs).toContain("192.168.1.42");
    const wsl = c.find((x) => x.address === "172.20.16.1");
    expect(wsl?.reason).toMatch(/virtual/i);
  });

  it("recommends a real LAN address over virtual adapters", () => {
    const c = detectIpCandidates(fakeIfaces());
    expect(recommendedIp(c)).toBe("192.168.1.42");
  });
});

describe("buildDoctorReport", () => {
  it("emits IPv4, settings, mosquitto hints, and ordered next commands", () => {
    const r = buildDoctorReport({
      cwd: "/repo",
      packageJsonFound: true,
      bunVersion: "1.2.3",
      ifaces: fakeIfaces(),
    });
    expect(r.recommendedIp).toBe("192.168.1.42");
    expect(r.ecowittAppSettings).toEqual({
      protocol: "Ecowitt",
      serverIp: "192.168.1.42",
      port: 8080,
      path: "/data/report",
      intervalSeconds: 60,
    });
    expect(r.mosquittoHints.some((h) => h.includes("mosquitto_sub.exe"))).toBe(true);
    expect(r.nextCommands).toHaveLength(4);
    expect(r.nextCommands[1]).toMatch(/dev:ecowitt-http-bridge/);
    expect(r.nextCommands[3]).toMatch(/dev:ecowitt-mqtt:dry-run/);
  });

  it("does not include VERDANT_BRIDGE_TOKEN, service_role, or Supabase env values", () => {
    const r = buildDoctorReport({
      cwd: "/repo",
      packageJsonFound: true,
      bunVersion: "1.0.0",
      ifaces: fakeIfaces(),
    });
    const s = JSON.stringify(r);
    expect(s).not.toMatch(/VERDANT_BRIDGE_TOKEN/);
    expect(s).not.toMatch(/service[_-]?role/i);
    expect(s).not.toMatch(/SUPABASE_/);
    expect(s).not.toMatch(/vbt_/);
  });
});

describe("buildLauncherFiles", () => {
  it("includes the four launchers + README", () => {
    const m = buildLauncherFiles("C:\\repo");
    expect(Object.keys(m).sort()).toEqual([
      "01-watch-mqtt.cmd",
      "02-start-http-bridge.cmd",
      "03-test-http-bridge.cmd",
      "04-run-mqtt-dry-run.cmd",
      "README.txt",
    ]);
  });

  it("repo-command launchers include cd /d <repo-root> before bun", () => {
    const m = buildLauncherFiles("C:\\repo");
    expect(m["02-start-http-bridge.cmd"]).toMatch(/cd \/d "C:\\repo"[\s\S]*bun run dev:ecowitt-http-bridge/);
    expect(m["04-run-mqtt-dry-run.cmd"]).toMatch(/cd \/d "C:\\repo"[\s\S]*bun run dev:ecowitt-mqtt:dry-run/);
  });

  it("every .cmd starts with @echo off + chcp 65001 and ends with pause", () => {
    const m = buildLauncherFiles("C:\\repo");
    for (const [name, body] of Object.entries(m)) {
      if (!name.endsWith(".cmd")) continue;
      expect(body.startsWith("@echo off\r\nchcp 65001 >nul\r\n")).toBe(true);
      expect(body.trimEnd().endsWith("pause")).toBe(true);
    }
  });

  it("every .cmd file contains no secrets, no service_role literal, no live sender, no Supabase webhook", () => {
    const files = buildLauncherFiles("C:\\repo");
    for (const [name, body] of Object.entries(files)) {
      if (!name.endsWith(".cmd")) continue;
      expect(body, name).not.toMatch(/VERDANT_BRIDGE_TOKEN/);
      expect(body, name).not.toMatch(/service[_-]?role/i);
      expect(body, name).not.toMatch(/sensor-ingest-webhook/);
      expect(body, name).not.toMatch(/supabase\.co/i);
      expect(body, name).not.toMatch(/dev:send-ecowitt/);
    }
  });
});

describe("writeLaunchers", () => {
  let tmp: string;
  afterEach(() => {
    if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  });

  it("writes only under tmp/ecowitt-windows/ and is idempotent (overwrites)", () => {
    tmp = mkdtempSync(join(tmpdir(), "ecowitt-doctor-"));
    const out = resolve(tmp, "tmp/ecowitt-windows");
    const a = writeLaunchers(out, tmp);
    expect(a.written.length).toBeGreaterThan(0);
    // Second invocation overwrites, not appends — file size stays stable.
    const sizeFirst = readFileSync(join(out, "02-start-http-bridge.cmd"), "utf8").length;
    writeLaunchers(out, tmp);
    const sizeSecond = readFileSync(join(out, "02-start-http-bridge.cmd"), "utf8").length;
    expect(sizeSecond).toBe(sizeFirst);
  });

  it("refuses to write outside tmp/ecowitt-windows/", () => {
    tmp = mkdtempSync(join(tmpdir(), "ecowitt-doctor-"));
    expect(() => writeLaunchers(resolve(tmp, "tmp/elsewhere"), tmp)).toThrow(
      /refusing to write/i,
    );
  });
});
