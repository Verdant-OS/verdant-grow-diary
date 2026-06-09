#!/usr/bin/env -S bun run
/**
 * EcoWitt Windows fast path.
 *
 * One local command that:
 *   1. Runs the Windows doctor (and optionally writes safe .cmd launchers).
 *   2. Runs the HTTP→MQTT smoke check against the already-running local bridge.
 *   3. Prints the next dry-run command on PASS.
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
}

export interface FastPathResult {
  exitCode: 0 | 1 | 2;
  smoke?: SmokeResult;
  launchersWritten?: string[];
}

/**
 * Pure orchestration: doctor → optional launchers → smoke.
 * Strict ordering: doctor runs first, smoke runs after, next-step printed only on PASS.
 */
export async function runFastPath(
  opts: FastPathOptions,
  deps: FastPathDeps,
): Promise<FastPathResult> {
  // 1. Doctor (deterministic, in-process — uses the same builder as the CLI).
  const cwd = process.cwd();
  const packageJsonFound = existsSync(resolve(cwd, "package.json"));
  if (!packageJsonFound) {
    deps.err("[ecowitt-fast-path] preflight FAILED — package.json not found");
    return { exitCode: 2 };
  }
  const report = buildDoctorReport({ cwd, packageJsonFound, bunVersion: null });
  deps.log(`[ecowitt-fast-path] doctor OK — recommended IP: ${report.recommendedIp ?? "(none)"}`);

  // 2. Optional launcher write (only ever under tmp/ecowitt-windows/).
  let launchersWritten: string[] | undefined;
  if (opts.writeLaunchers) {
    const write = deps.writeLaunchersFn
      ?? (() => writeLaunchers(resolve(cwd, "tmp/ecowitt-windows"), cwd));
    const w = write();
    launchersWritten = w.written;
    deps.log(`[ecowitt-fast-path] wrote ${w.written.length} launcher file(s) under ${w.outDir}`);
  }

  // 3. Smoke. Strictly AFTER doctor.
  const smoke = await deps.runSmoke({});
  if (!smoke.ok) {
    if (/bridge_down|bridge_http_/.test(smoke.reason)) {
      for (const l of BRIDGE_DOWN_LINES) deps.err(l);
    } else if (/mqtt_unreachable/.test(smoke.reason)) {
      for (const l of MQTT_DOWN_LINES) deps.err(l);
    } else {
      deps.err(`[ecowitt-fast-path] smoke FAIL: ${smoke.reason}`);
    }
    return { exitCode: 1, smoke, launchersWritten };
  }

  for (const l of NEXT_DRY_RUN_LINES) deps.log(l);
  return { exitCode: 0, smoke, launchersWritten };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const writeLaunchersFlag = argv.includes("--write-launchers");

  const result = await runFastPath(
    { writeLaunchers: writeLaunchersFlag },
    {
      // eslint-disable-next-line no-console
      log: (l) => console.log(l),
      // eslint-disable-next-line no-console
      err: (l) => console.error(l),
      runSmoke: async (o) => {
        // Lazy import default subscribe path to avoid hard mqtt dep at import time.
        const mod = await import("./ecowitt-local-bridge-smoke");
        // Use the same defaults as the CLI smoke checker.
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
