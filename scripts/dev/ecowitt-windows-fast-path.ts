#!/usr/bin/env -S bun run
/**
 * EcoWitt Windows fast path.
 *
 * One local command that:
 *   1. Runs the Windows doctor (and optionally writes safe .cmd launchers).
 *   2. Runs the HTTP→MQTT smoke check against the already-running local bridge.
 *   3. Prints the next dry-run command on PASS.
 *
 * Flags:
 *   --write-launchers   Write safe .cmd launchers under tmp/ecowitt-windows/.
 *   --verbose           Print structured step logs (doctor + smoke), still
 *                       fully redacted, still no live ingest.
 *
 * Hard safety rules — same as the underlying tools:
 *   - never imports the supabase SDK
 *   - never calls the Verdant ingest webhook
 *   - never reads VERDANT_BRIDGE_TOKEN
 *   - never writes to any database
 *   - never executes device commands
 *   - never runs the live sender
 *   - fake test payload is clearly labeled FAKE LOCAL TEST
 *
 * Exit codes:
 *   0 — doctor OK + smoke PASS
 *   1 — smoke FAIL (bridge down / mqtt unreachable / no message)
 *   2 — doctor preflight failed (package.json missing)
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildDoctorReport,
  writeLaunchers,
} from "./ecowitt-windows-doctor";
import { runSmoke, type SmokeOptions, type SmokeResult } from "./ecowitt-local-bridge-smoke";

export const NEXT_DRY_RUN_LINES = [
  "HTTP→MQTT smoke passed.",
  "Next dry-run step:",
  '$env:ECOWITT_MQTT_URL="mqtt://127.0.0.1:1883"',
  '$env:ECOWITT_MQTT_TOPIC="ecowitt/grow"',
  "bun run dev:ecowitt-mqtt:dry-run -- --once --write-report",
];
export const NEXT_DRY_RUN_COMMAND = "bun run dev:ecowitt-mqtt:dry-run -- --once --write-report";

export const BRIDGE_DOWN_LINES = [
  "HTTP bridge is not running.",
  "Start it with:",
  "bun run dev:ecowitt-http-bridge",
];

export const MQTT_DOWN_LINES = [
  "MQTT broker not reachable on mqtt://127.0.0.1:1883.",
  "Check Mosquitto with:",
  '"C:\\Program Files\\mosquitto\\mosquitto_sub.exe" -h 127.0.0.1 -p 1883 -t "ecowitt/#" -v',
];

export interface FastPathDeps {
  runSmoke: (opts: SmokeOptions) => Promise<SmokeResult>;
  log: (line: string) => void;
  err: (line: string) => void;
  writeLaunchersFn?: () => { written: string[]; outDir: string };
}

export interface FastPathOptions {
  writeLaunchers?: boolean;
  verbose?: boolean;
}

export type StepStatus = "ok" | "failed" | "skipped";

export interface FastPathResult {
  exitCode: 0 | 1 | 2;
  doctor: { status: StepStatus; recommendedIp: string | null };
  launchers: { status: StepStatus; written: string[]; outDir: string | null };
  smoke: { status: StepStatus; reason: string | null };
  logs: string[];
  nextCommand: string | null;
}

/**
 * Redact any accidental token-like strings before logging in verbose mode.
 * Defense-in-depth — the underlying tools already avoid printing secrets.
 */
export function redactVerboseLine(line: string): string {
  return line
    .replace(/vbt_[A-Za-z0-9_\-]+/g, "vbt_***REDACTED***")
    .replace(/(eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]+)/g, "***REDACTED-JWT***")
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1***REDACTED***");
}

/**
 * Pure orchestration: doctor → optional launchers → smoke.
 * Strict ordering: doctor runs first, smoke runs after, next-step printed only on PASS.
 */
export async function runFastPath(
  opts: FastPathOptions,
  deps: FastPathDeps,
): Promise<FastPathResult> {
  const logs: string[] = [];
  const verbose = opts.verbose === true;
  const emit = (line: string, channel: "log" | "err") => {
    const safe = redactVerboseLine(line);
    logs.push(safe);
    (channel === "log" ? deps.log : deps.err)(safe);
  };
  const vlog = (line: string) => {
    if (verbose) emit(line, "log");
    else logs.push(redactVerboseLine(line));
  };

  // 1. Doctor (deterministic, in-process — uses the same builder as the CLI).
  const cwd = process.cwd();
  const packageJsonFound = existsSync(resolve(cwd, "package.json"));
  if (!packageJsonFound) {
    emit("[ecowitt-fast-path] preflight FAILED — package.json not found", "err");
    return {
      exitCode: 2,
      doctor: { status: "failed", recommendedIp: null },
      launchers: { status: "skipped", written: [], outDir: null },
      smoke: { status: "skipped", reason: null },
      logs,
      nextCommand: null,
    };
  }
  vlog("[ecowitt-fast-path] verbose: running doctor…");
  const report = buildDoctorReport({ cwd, packageJsonFound, bunVersion: null });
  emit(
    `[ecowitt-fast-path] doctor OK — recommended IP: ${report.recommendedIp ?? "(none)"}`,
    "log",
  );
  if (verbose) {
    for (const c of report.ips) {
      vlog(`  - ip: ${c.address} [${c.iface}]${c.recommended ? " RECOMMENDED" : ""}`);
    }
    for (const n of report.nextCommands) vlog(`  - next: ${n}`);
  }

  // 2. Optional launcher write (only ever under tmp/ecowitt-windows/).
  let launchers: FastPathResult["launchers"] = { status: "skipped", written: [], outDir: null };
  if (opts.writeLaunchers) {
    const write = deps.writeLaunchersFn
      ?? (() => writeLaunchers(resolve(cwd, "tmp", "ecowitt-windows"), cwd));
    try {
      const w = write();
      launchers = { status: "ok", written: w.written, outDir: w.outDir };
      emit(
        `[ecowitt-fast-path] wrote ${w.written.length} launcher file(s) under ${w.outDir}`,
        "log",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      emit(`[ecowitt-fast-path] launcher write FAILED: ${msg}`, "err");
      launchers = { status: "failed", written: [], outDir: null };
    }
  }

  // 3. Smoke. Strictly AFTER doctor.
  vlog("[ecowitt-fast-path] verbose: running HTTP→MQTT smoke…");
  const smoke = await deps.runSmoke({});
  if (!smoke.ok) {
    if (/bridge_down|bridge_http_/.test(smoke.reason)) {
      for (const l of BRIDGE_DOWN_LINES) emit(l, "err");
    } else if (/mqtt_unreachable/.test(smoke.reason)) {
      for (const l of MQTT_DOWN_LINES) emit(l, "err");
    } else {
      emit(`[ecowitt-fast-path] smoke FAIL: ${smoke.reason}`, "err");
    }
    if (verbose) vlog(`[ecowitt-fast-path] verbose smoke reason: ${smoke.reason}`);
    return {
      exitCode: 1,
      doctor: { status: "ok", recommendedIp: report.recommendedIp },
      launchers,
      smoke: { status: "failed", reason: smoke.reason },
      logs,
      nextCommand: null,
    };
  }

  if (verbose) vlog(`[ecowitt-fast-path] verbose smoke reason: ${smoke.reason}`);
  for (const l of NEXT_DRY_RUN_LINES) emit(l, "log");
  return {
    exitCode: 0,
    doctor: { status: "ok", recommendedIp: report.recommendedIp },
    launchers,
    smoke: { status: "ok", reason: smoke.reason },
    logs,
    nextCommand: NEXT_DRY_RUN_COMMAND,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const writeLaunchersFlag = argv.includes("--write-launchers");
  const verbose = argv.includes("--verbose");

  const result = await runFastPath(
    { writeLaunchers: writeLaunchersFlag, verbose },
    {
      // eslint-disable-next-line no-console
      log: (l) => console.log(l),
      // eslint-disable-next-line no-console
      err: (l) => console.error(l),
      runSmoke: async (o) => {
        const mod = await import("./ecowitt-local-bridge-smoke");
        return mod.runSmoke(o, {
          fetchImpl: fetch,
          subscribe: async (mqttUrl, topic, onMessage) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let mqtt: any;
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              mqtt = await (Function("m", "return import(m)") as any)("mqtt");
            } catch {
              throw new Error("mqtt package not installed; run `bun add mqtt`");
            }
            const client = mqtt.connect(mqttUrl, { reconnectPeriod: 0, connectTimeout: 2000 });
            await new Promise<void>((res, rej) => {
              client.once("connect", () => res());
              client.once("error", (e: Error) => rej(e));
            });
            await new Promise<void>((res, rej) =>
              client.subscribe(topic, (e: Error | undefined) => (e ? rej(e) : res())),
            );
            client.on("message", (_t: string, buf: Buffer) => onMessage(buf.toString("utf8")));
            return { close: () => new Promise<void>((res) => client.end(false, {}, () => res())) };
          },
        });
      },
    },
  );
  process.exit(result.exitCode);
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].includes("ecowitt-windows-fast-path");

if (invokedDirectly) {
  void main();
}
