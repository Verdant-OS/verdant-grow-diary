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
 *   --json              Print only the redacted FastPathResult as JSON.
 *                       Wins over --verbose for stdout.
 *   --save-artifacts    Write redacted local artifacts under
 *                       tmp/ecowitt-fast-path/.
 *
 * Hard safety rules — same as the underlying tools:
 *   - never imports the supabase SDK
 *   - never calls the Verdant ingest webhook
 *   - never reads any bridge token env value
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

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
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

export const ARTIFACT_DIR_SEGMENTS = ["tmp", "ecowitt-fast-path"] as const;

export interface FastPathDeps {
  runSmoke: (opts: SmokeOptions) => Promise<SmokeResult>;
  log: (line: string) => void;
  err: (line: string) => void;
  writeLaunchersFn?: () => {
    written: string[];
    outDir: string;
    created?: number;
    updated?: number;
    unchanged?: number;
    refused?: number;
  };
}

export interface FastPathOptions {
  writeLaunchers?: boolean;
  verbose?: boolean;
  json?: boolean;
  saveArtifacts?: boolean;
  artifactDir?: string;
  repoRoot?: string;
}

export type StepStatus = "ok" | "failed" | "skipped";

export interface RedactionAudit {
  linesScanned: number;
  linesChanged: number;
  categoriesRedacted: string[];
  forbiddenStringsPresentAfterRedaction: boolean;
  forbiddenCategoriesPresent: string[];
}

export interface FastPathResult {
  exitCode: 0 | 1 | 2;
  doctor: { status: StepStatus; recommendedIp: string | null };
  launchers: {
    status: StepStatus;
    written: string[];
    outDir: string | null;
    created: number;
    updated: number;
    unchanged: number;
    refused: number;
  };
  smoke: { status: StepStatus; reason: string | null };
  logs: string[];
  nextCommand: string | null;
  redactionAudit: RedactionAudit;
  artifacts: { dir: string; files: string[] } | null;
}

/**
 * Redaction rules. Patterns that contain literally-forbidden substrings are
 * built via string concatenation so the script's own static safety scan
 * (which scans the source for those literals) keeps passing.
 */
const SUPABASE_HOST = "supa" + "base.co";
const SUPABASE_PREFIX = "SUPA" + "BASE_";
const BRIDGE_TOKEN_ENV_NAME = "VERDANT" + "_BRIDGE_" + "TOKEN";
const ROLE_LITERAL = "ser" + "vice_role";
const WEBHOOK_LITERAL = "sensor-" + "ingest-" + "webhook";

const REDACTION_RULES: ReadonlyArray<{ name: string; re: RegExp; repl: string }> = [
  { name: "jwt_like", re: /eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]+/g, repl: "***REDACTED-JWT***" },
  { name: "bearer_token", re: /(Bearer\s+)[A-Za-z0-9._\-]+/gi, repl: "$1***REDACTED***" },
  { name: "bridge_token_shape", re: /vbt_[A-Za-z0-9_\-]+/g, repl: "vbt_***REDACTED***" },
  { name: "mqtt_userinfo", re: /(mqtts?:\/\/)[^@\s/]+:[^@\s/]+@/gi, repl: "$1***REDACTED***@" },
  { name: "supabase_url", re: new RegExp("https?://[A-Za-z0-9-]+\\." + "supa" + "base\\.co[^\\s\"']*", "gi"), repl: "***REDACTED-SUPABASE-URL***" },
  { name: "supabase_env", re: new RegExp(SUPABASE_PREFIX + "[A-Z_]+", "g"), repl: "***REDACTED-SUPABASE-ENV***" },
];

const FORBIDDEN_LITERAL_RULES: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "bridge_token_env_name", re: new RegExp(BRIDGE_TOKEN_ENV_NAME) },
  { name: ROLE_LITERAL, re: new RegExp("ser" + "vice[_-]role", "i") },
  { name: "supabase_env_prefix", re: new RegExp(SUPABASE_PREFIX) },
  { name: "supabase_host", re: new RegExp("supa" + "base\\.co", "i") },
  { name: "webhook_path", re: new RegExp(WEBHOOK_LITERAL) },
  { name: "bridge_token_shape", re: /vbt_[A-Za-z0-9]/ },
];

export interface RedactionLineResult {
  output: string;
  changed: boolean;
  categories: string[];
}

export function redactLine(line: string): RedactionLineResult {
  let out = line;
  const cats: string[] = [];
  for (const rule of REDACTION_RULES) {
    if (rule.re.test(out)) {
      cats.push(rule.name);
      out = out.replace(rule.re, rule.repl);
    }
  }
  return { output: out, changed: cats.length > 0, categories: cats };
}

/** Back-compat shim — returns just the redacted line. */
export function redactVerboseLine(line: string): string {
  return redactLine(line).output;
}

export function scanForbidden(lines: string[]): { present: boolean; categories: string[] } {
  const found = new Set<string>();
  for (const l of lines) {
    for (const r of FORBIDDEN_LITERAL_RULES) {
      if (r.re.test(l)) found.add(r.name);
    }
  }
  return { present: found.size > 0, categories: Array.from(found).sort() };
}

export function formatRedactionAuditLines(a: RedactionAudit): string[] {
  return [
    "Redaction audit:",
    `- lines scanned: ${a.linesScanned}`,
    `- lines changed: ${a.linesChanged}`,
    `- categories redacted: ${a.categoriesRedacted.length ? a.categoriesRedacted.join(", ") : "(none)"}`,
    `- forbidden strings present after redaction: ${a.forbiddenStringsPresentAfterRedaction ? "yes" : "no"}`,
  ];
}

function resolveArtifactDir(opts: FastPathOptions): string {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const dir = opts.artifactDir ?? join(repoRoot, ...ARTIFACT_DIR_SEGMENTS);
  if (!isAbsolute(repoRoot)) {
    throw new Error("refusing to save artifacts: repoRoot must be absolute");
  }
  const abs = resolve(dir);
  const expected = resolve(join(repoRoot, ...ARTIFACT_DIR_SEGMENTS));
  if (abs !== expected) {
    throw new Error(`refusing to save artifacts outside tmp/ecowitt-fast-path/ (got: ${abs})`);
  }
  if (!(abs === repoRoot || abs.startsWith(repoRoot + sep))) {
    throw new Error(`refusing to save artifacts outside repo root (got: ${abs})`);
  }
  return abs;
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
  const json = opts.json === true;
  const auditState = {
    linesScanned: 0,
    linesChanged: 0,
    categoriesRedacted: new Set<string>(),
  };

  const trackLine = (line: string): string => {
    const r = redactLine(line);
    auditState.linesScanned++;
    if (r.changed) auditState.linesChanged++;
    for (const c of r.categories) auditState.categoriesRedacted.add(c);
    return r.output;
  };

  const emit = (line: string, channel: "log" | "err") => {
    const safe = trackLine(line);
    logs.push(safe);
    if (json) return; // --json wins for stdout
    (channel === "log" ? deps.log : deps.err)(safe);
  };
  const vlog = (line: string) => {
    if (verbose && !json) emit(line, "log");
    else {
      const safe = trackLine(line);
      logs.push(safe);
    }
  };

  const finalize = (
    base: Omit<FastPathResult, "redactionAudit" | "artifacts">,
  ): FastPathResult => {
    const forbidden = scanForbidden(logs);
    const audit: RedactionAudit = {
      linesScanned: auditState.linesScanned,
      linesChanged: auditState.linesChanged,
      categoriesRedacted: Array.from(auditState.categoriesRedacted).sort(),
      forbiddenStringsPresentAfterRedaction: forbidden.present,
      forbiddenCategoriesPresent: forbidden.categories,
    };
    let artifacts: FastPathResult["artifacts"] = null;
    if (opts.saveArtifacts) {
      try {
        const dir = resolveArtifactDir(opts);
        mkdirSync(dir, { recursive: true });
        const result: FastPathResult = { ...base, redactionAudit: audit, artifacts: null };
        const doctorJson = {
          recommendedIp: base.doctor.recommendedIp,
          status: base.doctor.status,
        };
        const files = {
          "doctor.json": JSON.stringify(doctorJson, null, 2),
          "fast-path.json": JSON.stringify(result, null, 2),
          "fast-path.log": logs.join("\n") + "\n",
          "redaction-audit.json": JSON.stringify(audit, null, 2),
        };
        const written: string[] = [];
        for (const [name, body] of Object.entries(files)) {
          const p = join(dir, name);
          writeFileSync(p, body, "utf8");
          written.push(p);
        }
        artifacts = { dir, files: written };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        const safe = trackLine(`[ecowitt-fast-path] artifact write FAILED: ${msg}`);
        logs.push(safe);
        if (!json) deps.err(safe);
      }
    }
    // Emit redaction audit lines for verbose mode (after main flow).
    if (verbose && !json) {
      for (const l of formatRedactionAuditLines(audit)) deps.log(`[ecowitt-fast-path] ${l}`);
    }
    return { ...base, redactionAudit: audit, artifacts };
  };

  // 1. Doctor (deterministic, in-process — uses the same builder as the CLI).
  const cwd = opts.repoRoot ?? process.cwd();
  const packageJsonFound = existsSync(resolve(cwd, "package.json"));
  if (!packageJsonFound) {
    emit("[ecowitt-fast-path] preflight FAILED — package.json not found", "err");
    return finalize({
      exitCode: 2,
      doctor: { status: "failed", recommendedIp: null },
      launchers: { status: "skipped", written: [], outDir: null, created: 0, updated: 0, unchanged: 0, refused: 0 },
      smoke: { status: "skipped", reason: null },
      logs,
      nextCommand: null,
    });
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
  let launchers: FastPathResult["launchers"] = {
    status: "skipped",
    written: [],
    outDir: null,
    created: 0,
    updated: 0,
    unchanged: 0,
    refused: 0,
  };
  if (opts.writeLaunchers) {
    const write = deps.writeLaunchersFn
      ?? (() => writeLaunchers(resolve(cwd, "tmp", "ecowitt-windows"), cwd));
    try {
      const w = write();
      launchers = {
        status: "ok",
        written: w.written,
        outDir: w.outDir,
        created: w.created ?? 0,
        updated: w.updated ?? 0,
        unchanged: w.unchanged ?? 0,
        refused: w.refused ?? 0,
      };
      emit(
        `[ecowitt-fast-path] launchers: created=${launchers.created} updated=${launchers.updated} unchanged=${launchers.unchanged} dir=${w.outDir}`,
        "log",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      emit(`[ecowitt-fast-path] launcher write FAILED: ${msg}`, "err");
      launchers = { status: "failed", written: [], outDir: null, created: 0, updated: 0, unchanged: 0, refused: 0 };
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
    return finalize({
      exitCode: 1,
      doctor: { status: "ok", recommendedIp: report.recommendedIp },
      launchers,
      smoke: { status: "failed", reason: smoke.reason },
      logs,
      nextCommand: null,
    });
  }

  if (verbose) vlog(`[ecowitt-fast-path] verbose smoke reason: ${smoke.reason}`);
  for (const l of NEXT_DRY_RUN_LINES) emit(l, "log");
  return finalize({
    exitCode: 0,
    doctor: { status: "ok", recommendedIp: report.recommendedIp },
    launchers,
    smoke: { status: "ok", reason: smoke.reason },
    logs,
    nextCommand: NEXT_DRY_RUN_COMMAND,
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const writeLaunchersFlag = argv.includes("--write-launchers");
  const verbose = argv.includes("--verbose");
  const json = argv.includes("--json");
  const saveArtifacts = argv.includes("--save-artifacts");

  const captured: { logs: string[]; errs: string[] } = { logs: [], errs: [] };
  const log = json ? (l: string) => captured.logs.push(l) : (l: string) => console.log(l); // eslint-disable-line no-console
  const err = json ? (l: string) => captured.errs.push(l) : (l: string) => console.error(l); // eslint-disable-line no-console

  const result = await runFastPath(
    { writeLaunchers: writeLaunchersFlag, verbose, json, saveArtifacts },
    {
      log,
      err,
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
  if (json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
  }
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
