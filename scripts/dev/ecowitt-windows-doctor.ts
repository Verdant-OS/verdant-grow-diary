#!/usr/bin/env -S bun run
/**
 * EcoWitt Windows operator doctor.
 *
 * Local dev-only diagnostic tool. Prints:
 *  - cwd + package.json confirmation
 *  - Bun version
 *  - LAN IPv4 candidates with a RECOMMENDED pick
 *  - Mosquitto path hints
 *  - Recommended Ecowitt app settings
 *  - Exact next commands in order
 *
 * Optionally writes a small set of .cmd launchers under
 * tmp/ecowitt-windows/ when invoked with --write-launchers.
 *
 * Hard safety rules:
 *  - never reads or prints VERDANT_BRIDGE_TOKEN or any *_SUPABASE_* env value
 *  - never calls the Verdant ingest webhook
 *  - never calls Supabase
 *  - never writes outside tmp/ecowitt-windows/
 *  - never claims automation
 *  - never executes device commands
 */

import { networkInterfaces } from "node:os";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

export interface IpCandidate {
  iface: string;
  address: string;
  recommended: boolean;
  reason?: string;
}

const VIRTUAL_PATTERNS = [
  /wsl/i,
  /hyper-?v/i,
  /vethernet/i,
  /virtualbox/i,
  /vbox/i,
  /vmware/i,
  /docker/i,
  /loopback/i,
  /tailscale/i,
  /zerotier/i,
  /openvpn/i,
  /tap-windows/i,
];

export function detectIpCandidates(
  ifaces: ReturnType<typeof networkInterfaces> = networkInterfaces(),
): IpCandidate[] {
  const out: IpCandidate[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== "IPv4") continue;
      if (a.internal) continue;
      const addr = a.address;
      if (addr.startsWith("127.")) continue;
      if (addr.startsWith("169.254.")) continue;
      const virtual = VIRTUAL_PATTERNS.some((re) => re.test(name));
      out.push({
        iface: name,
        address: addr,
        recommended: false,
        reason: virtual ? "virtual/NAT adapter — usually wrong" : undefined,
      });
    }
  }
  // Recommend the first non-virtual private address; prefer 192.168.* > 10.* > 172.16-31.*.
  const score = (ip: string): number => {
    if (ip.startsWith("192.168.")) return 3;
    if (ip.startsWith("10.")) return 2;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 1;
    return 0;
  };
  const real = out.filter((c) => !c.reason);
  real.sort((a, b) => score(b.address) - score(a.address));
  if (real[0]) {
    const pick = out.find((c) => c.address === real[0].address && c.iface === real[0].iface);
    if (pick) pick.recommended = true;
  }
  return out;
}

export function recommendedIp(candidates: IpCandidate[]): string | null {
  return candidates.find((c) => c.recommended)?.address ?? null;
}

export interface DoctorReport {
  cwd: string;
  packageJsonFound: boolean;
  bunVersion: string | null;
  ips: IpCandidate[];
  recommendedIp: string | null;
  ecowittAppSettings: {
    protocol: "Ecowitt";
    serverIp: string;
    port: number;
    path: string;
    intervalSeconds: number;
  };
  mosquittoHints: string[];
  nextCommands: string[];
}

export function buildDoctorReport(opts: {
  cwd: string;
  packageJsonFound: boolean;
  bunVersion: string | null;
  ifaces?: ReturnType<typeof networkInterfaces>;
}): DoctorReport {
  const ips = detectIpCandidates(opts.ifaces);
  const recIp = recommendedIp(ips) ?? "<your-PC-LAN-IPv4>";
  return {
    cwd: opts.cwd,
    packageJsonFound: opts.packageJsonFound,
    bunVersion: opts.bunVersion,
    ips,
    recommendedIp: recommendedIp(ips),
    ecowittAppSettings: {
      protocol: "Ecowitt",
      serverIp: recIp,
      port: 8080,
      path: "/data/report",
      intervalSeconds: 60,
    },
    mosquittoHints: [
      "C:\\Program Files\\mosquitto\\mosquitto.exe",
      "C:\\Program Files\\mosquitto\\mosquitto_sub.exe",
    ],
    nextCommands: [
      '1) confirm/start Mosquitto: "C:\\Program Files\\mosquitto\\mosquitto.exe" -v',
      "2) start Verdant HTTP bridge: bun run dev:ecowitt-http-bridge",
      '3) fake POST test: curl.exe -X POST "http://127.0.0.1:8080/data/report" -d "temp1f=77.4&humidity1=58&soilmoisture1=33&co2=721"',
      "4) MQTT dry-run report: bun run dev:ecowitt-mqtt:dry-run -- --once --write-report",
    ],
  };
}

/** Launcher file map. Keys are filenames under tmp/ecowitt-windows/. */
export function buildLauncherFiles(repoRoot: string): Record<string, string> {
  const cd = `cd /d "${repoRoot}"`;
  const header = `@echo off\r\nchcp 65001 >nul\r\n`;
  const footer = `\r\npause\r\n`;
  return {
    "01-watch-mqtt.cmd":
      header +
      `"C:\\Program Files\\mosquitto\\mosquitto_sub.exe" -h 127.0.0.1 -p 1883 -t "ecowitt/#" -v\r\n` +
      footer,
    "02-start-http-bridge.cmd":
      header + `${cd}\r\nbun run dev:ecowitt-http-bridge\r\n` + footer,
    "03-test-http-bridge.cmd":
      header +
      `echo FAKE LOCAL TEST PAYLOAD -- not live data\r\n` +
      `curl.exe -X POST "http://127.0.0.1:8080/data/report" -d "temp1f=77.4&humidity1=58&soilmoisture1=33&co2=721"\r\n` +
      footer,
    "04-run-mqtt-dry-run.cmd":
      header +
      `${cd}\r\n` +
      `set ECOWITT_MQTT_URL=mqtt://127.0.0.1:1883\r\n` +
      `set ECOWITT_MQTT_TOPIC=ecowitt/grow\r\n` +
      `bun run dev:ecowitt-mqtt:dry-run -- --once --write-report\r\n` +
      `start "" tmp\\ecowitt-last-ingest-report.json\r\n` +
      footer,
    "README.txt":
      "EcoWitt Windows local pipeline\r\n" +
      "==============================\r\n\r\n" +
      "1. Confirm Mosquitto is running.\r\n" +
      "2. Run 01-watch-mqtt.cmd\r\n" +
      "3. Run 02-start-http-bridge.cmd\r\n" +
      "4. Run 03-test-http-bridge.cmd\r\n" +
      "5. Confirm a message appears on topic 'ecowitt/grow'.\r\n" +
      "6. Point the Ecowitt app to the RECOMMENDED IPv4 / port 8080 / path /data/report.\r\n" +
      "7. Run 04-run-mqtt-dry-run.cmd\r\n" +
      "8. Review the dry-run report BEFORE any live send.\r\n\r\n" +
      "WARNINGS\r\n" +
      "  - Never paste bridge tokens into these launchers.\r\n" +
      "  - Never paste service-role keys anywhere.\r\n" +
      "  - Live send is NOT part of this fast path.\r\n",
  };
}

export function writeLaunchers(
  outDir: string,
  repoRoot: string,
): { written: string[]; outDir: string } {
  // Safety: only ever write under tmp/ecowitt-windows/
  const normalized = resolve(outDir);
  const expectedSuffix = resolve(repoRoot, "tmp/ecowitt-windows");
  if (normalized !== expectedSuffix) {
    throw new Error(
      `refusing to write launchers outside tmp/ecowitt-windows/ (got: ${normalized})`,
    );
  }
  mkdirSync(normalized, { recursive: true });
  const files = buildLauncherFiles(repoRoot);
  const written: string[] = [];
  for (const [name, content] of Object.entries(files)) {
    const p = join(normalized, name);
    writeFileSync(p, content, "utf8");
    written.push(p);
  }
  return { written, outDir: normalized };
}

function detectBunVersion(): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = (globalThis as unknown as { Bun?: { version?: string } }).Bun;
  return b?.version ?? null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const wantJson = argv.includes("--json");
  const wantLaunchers = argv.includes("--write-launchers");
  const cwd = process.cwd();
  const packageJsonFound = existsSync(resolve(cwd, "package.json"));

  if (!packageJsonFound) {
    // eslint-disable-next-line no-console
    console.error(
      "[ecowitt-doctor] preflight FAILED — package.json not found in cwd:",
      cwd,
    );
    process.exit(2);
  }

  const report = buildDoctorReport({
    cwd,
    packageJsonFound,
    bunVersion: detectBunVersion(),
  });

  if (wantJson) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log("[ecowitt-doctor] cwd:", report.cwd);
    // eslint-disable-next-line no-console
    console.log("[ecowitt-doctor] package.json:", report.packageJsonFound ? "OK" : "MISSING");
    // eslint-disable-next-line no-console
    console.log("[ecowitt-doctor] bun:", report.bunVersion ?? "(not detected)");
    // eslint-disable-next-line no-console
    console.log("[ecowitt-doctor] IPv4 candidates:");
    for (const c of report.ips) {
      // eslint-disable-next-line no-console
      console.log(
        `  - ${c.address}  [${c.iface}]${c.recommended ? "  RECOMMENDED" : ""}${
          c.reason ? `  (${c.reason})` : ""
        }`,
      );
    }
    // eslint-disable-next-line no-console
    console.log("[ecowitt-doctor] Mosquitto hints:");
    for (const h of report.mosquittoHints) {
      // eslint-disable-next-line no-console
      console.log(`  - ${h}`);
    }
    // eslint-disable-next-line no-console
    console.log("[ecowitt-doctor] Ecowitt app settings:");
    for (const [k, v] of Object.entries(report.ecowittAppSettings)) {
      // eslint-disable-next-line no-console
      console.log(`  - ${k}: ${v}`);
    }
    // eslint-disable-next-line no-console
    console.log("[ecowitt-doctor] Next commands:");
    for (const c of report.nextCommands) {
      // eslint-disable-next-line no-console
      console.log(`  ${c}`);
    }
  }

  if (wantLaunchers) {
    const outDir = resolve(cwd, "tmp/ecowitt-windows");
    const res = writeLaunchers(outDir, cwd);
    // eslint-disable-next-line no-console
    console.log("[ecowitt-doctor] launchers written:", res.outDir);
    for (const p of res.written) {
      // eslint-disable-next-line no-console
      console.log("  -", p);
    }
  }
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].includes("ecowitt-windows-doctor");

if (invokedDirectly) {
  void main();
}
