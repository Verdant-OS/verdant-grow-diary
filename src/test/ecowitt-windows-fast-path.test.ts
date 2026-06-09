/**
 * Tests for scripts/dev/ecowitt-windows-fast-path.ts
 *
 * Coverage:
 *  - fast path runs doctor BEFORE smoke
 *  - --write-launchers writes launchers only under tmp/ecowitt-windows/
 *  - prints next dry-run step on smoke PASS
 *  - exits non-zero with bridge_down / mqtt hints
 *  - --verbose emits doctor + smoke step logs, all redacted
 *  - --verbose output contains no VERDANT_BRIDGE_TOKEN, no service_role,
 *    no SUPABASE_* env values, no webhook URL
 *  - structured FastPathResult exposes doctor/launchers/smoke status + logs
 *  - static safety: no supabase SDK, no live sender, no DB writes, etc.
 *  - workflow uploads only the documented artifact paths via pinned SHA
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BRIDGE_DOWN_LINES,
  MQTT_DOWN_LINES,
  NEXT_DRY_RUN_COMMAND,
  NEXT_DRY_RUN_LINES,
  redactVerboseLine,
  runFastPath,
} from "../../scripts/dev/ecowitt-windows-fast-path";

const SCRIPT_PATH = resolve(__dirname, "../../scripts/dev/ecowitt-windows-fast-path.ts");
const SRC = readFileSync(SCRIPT_PATH, "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("ecowitt-windows-fast-path — static safety", () => {
  it("does not import the supabase SDK", () => {
    expect(SRC).not.toMatch(/@supabase\/supabase-js/);
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
  });
  it("never references service_role, action_queue, or device control", () => {
    expect(CODE).not.toMatch(/service[_-]?role/i);
    expect(CODE).not.toMatch(/action_queue/i);
    expect(CODE).not.toMatch(/device_command|relay_on|valve_open|light_on/i);
  });
  it("never reads VERDANT_BRIDGE_TOKEN or Supabase env values", () => {
    expect(CODE).not.toMatch(/VERDANT_BRIDGE_TOKEN/);
    expect(CODE).not.toMatch(/SUPABASE_/);
  });
  it("never calls the ingest webhook or live sender", () => {
    expect(CODE).not.toMatch(/sensor-ingest-webhook/);
    expect(CODE).not.toMatch(/VERDANT_INGEST_URL/);
    expect(CODE).not.toMatch(/dev:send-ecowitt\b/);
    expect(CODE).not.toMatch(/supabase\.co/i);
  });
  it("never performs database write methods", () => {
    expect(CODE).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
  });
  it("references the FAKE LOCAL TEST label via the smoke module", () => {
    expect(SRC).toMatch(/ecowitt-local-bridge-smoke/);
  });
});

describe("redactVerboseLine", () => {
  it("redacts vbt_ tokens, JWT-like strings, and Bearer values", () => {
    expect(redactVerboseLine("token=vbt_abc123XYZ_-456")).toContain("vbt_***REDACTED***");
    expect(
      redactVerboseLine("auth=eyJabc12345.eyJpYXQiOj.signaturePart_xyz"),
    ).toContain("***REDACTED-JWT***");
    expect(redactVerboseLine("authorization: Bearer abc.def.ghi")).toContain("Bearer ***REDACTED***");
  });
  it("leaves benign content untouched", () => {
    expect(redactVerboseLine("recommended IP: 192.168.1.42")).toBe("recommended IP: 192.168.1.42");
  });
});

describe("runFastPath — orchestration", () => {
  const makeDeps = (smokeImpl: () => Promise<{ ok: boolean; reason: string }>) => {
    const calls: string[] = [];
    const logs: string[] = [];
    const errs: string[] = [];
    return {
      calls,
      logs,
      errs,
      deps: {
        log: (l: string) => {
          calls.push(`log:${l}`);
          logs.push(l);
        },
        err: (l: string) => {
          calls.push(`err:${l}`);
          errs.push(l);
        },
        runSmoke: vi.fn(async () => {
          calls.push("smoke");
          return smokeImpl();
        }),
      },
    };
  };

  it("runs doctor BEFORE smoke and returns structured result on PASS", async () => {
    const { deps, calls, logs } = makeDeps(async () => ({ ok: true, reason: "pass — FAKE LOCAL TEST received" }));
    const res = await runFastPath({}, deps);
    expect(res.exitCode).toBe(0);
    expect(res.doctor.status).toBe("ok");
    expect(res.smoke.status).toBe("ok");
    expect(res.nextCommand).toBe(NEXT_DRY_RUN_COMMAND);
    const doctorIdx = calls.findIndex((c) => c.includes("doctor OK"));
    const smokeIdx = calls.indexOf("smoke");
    expect(doctorIdx).toBeGreaterThanOrEqual(0);
    expect(smokeIdx).toBeGreaterThan(doctorIdx);
    for (const l of NEXT_DRY_RUN_LINES) expect(logs).toContain(l);
  });

  it("--write-launchers writes launchers only under tmp/ecowitt-windows/", async () => {
    const { deps } = makeDeps(async () => ({ ok: true, reason: "ok" }));
    const writeLaunchersFn = vi.fn(() => ({
      written: [resolve(process.cwd(), "tmp/ecowitt-windows/01-watch-mqtt.cmd")],
      outDir: resolve(process.cwd(), "tmp/ecowitt-windows"),
    }));
    const res = await runFastPath(
      { writeLaunchers: true },
      { ...deps, writeLaunchersFn },
    );
    expect(res.exitCode).toBe(0);
    expect(writeLaunchersFn).toHaveBeenCalledTimes(1);
    expect(res.launchers.status).toBe("ok");
    expect(res.launchers.written[0]).toMatch(/tmp[\\/]ecowitt-windows[\\/]/);
  });

  it("does not write launchers when flag is absent", async () => {
    const { deps } = makeDeps(async () => ({ ok: true, reason: "ok" }));
    const writeLaunchersFn = vi.fn(() => ({ written: [], outDir: "" }));
    const res = await runFastPath({}, { ...deps, writeLaunchersFn });
    expect(res.exitCode).toBe(0);
    expect(writeLaunchersFn).not.toHaveBeenCalled();
    expect(res.launchers.status).toBe("skipped");
  });

  it("exits non-zero with bridge_down hint when HTTP bridge is down", async () => {
    const { deps, errs } = makeDeps(async () => ({
      ok: false,
      reason: "bridge_down: ECONNREFUSED — start it with: bun run dev:ecowitt-http-bridge",
    }));
    const res = await runFastPath({}, deps);
    expect(res.exitCode).toBe(1);
    expect(res.smoke.status).toBe("failed");
    for (const l of BRIDGE_DOWN_LINES) expect(errs).toContain(l);
  });

  it("exits non-zero with MQTT hint when broker is unreachable", async () => {
    const { deps, errs } = makeDeps(async () => ({
      ok: false,
      reason: "mqtt_unreachable: connect ECONNREFUSED — start Mosquitto",
    }));
    const res = await runFastPath({}, deps);
    expect(res.exitCode).toBe(1);
    for (const l of MQTT_DOWN_LINES) expect(errs).toContain(l);
  });
});

describe("runFastPath — --verbose", () => {
  it("emits doctor + smoke step logs in verbose mode", async () => {
    const logs: string[] = [];
    const errs: string[] = [];
    const res = await runFastPath(
      { verbose: true },
      {
        log: (l) => logs.push(l),
        err: (l) => errs.push(l),
        runSmoke: async () => ({ ok: true, reason: "pass — FAKE LOCAL TEST received" }),
      },
    );
    expect(res.exitCode).toBe(0);
    expect(logs.some((l) => l.includes("verbose: running doctor"))).toBe(true);
    expect(logs.some((l) => l.includes("verbose: running HTTP→MQTT smoke"))).toBe(true);
    expect(res.logs.some((l) => l.includes("verbose smoke reason"))).toBe(true);
  });

  it("non-verbose mode keeps output concise", async () => {
    const logs: string[] = [];
    await runFastPath(
      {},
      {
        log: (l) => logs.push(l),
        err: () => {},
        runSmoke: async () => ({ ok: true, reason: "pass" }),
      },
    );
    expect(logs.some((l) => l.includes("verbose: running"))).toBe(false);
  });

  it("verbose logs contain no VERDANT_BRIDGE_TOKEN, no service_role, no SUPABASE_*, no webhook URL", async () => {
    const logs: string[] = [];
    const errs: string[] = [];
    const res = await runFastPath(
      { verbose: true },
      {
        log: (l) => logs.push(l),
        err: (l) => errs.push(l),
        runSmoke: async () => ({ ok: false, reason: "bridge_down: ECONNREFUSED" }),
      },
    );
    const all = [...logs, ...errs, ...res.logs].join("\n");
    expect(all).not.toMatch(/VERDANT_BRIDGE_TOKEN/);
    expect(all).not.toMatch(/service[_-]?role/i);
    expect(all).not.toMatch(/SUPABASE_(URL|ANON_KEY|SERVICE_ROLE|PROJECT)/);
    expect(all).not.toMatch(/sensor-ingest-webhook/);
    expect(all).not.toMatch(/supabase\.co/i);
    expect(all).not.toMatch(/vbt_[A-Za-z0-9]/);
  });
});

describe("ecowitt-windows-tooling workflow — static safety", () => {
  const WF = readFileSync(
    resolve(__dirname, "../../.github/workflows/ecowitt-windows-tooling.yml"),
    "utf8",
  );
  it("does not use pull_request_target", () => {
    expect(WF).not.toMatch(/pull_request_target/);
  });
  it("does not reference any secrets", () => {
    expect(WF).not.toMatch(/\$\{\{\s*secrets\./);
  });
  it("does not call the live sender or the Supabase webhook", () => {
    expect(WF).not.toMatch(/dev:send-ecowitt\b/);
    expect(WF).not.toMatch(/sensor-ingest-webhook/);
    expect(WF).not.toMatch(/supabase\.co/i);
  });
  it("pins every `uses:` action to a full 40-char commit SHA (including upload-artifact)", () => {
    const usesLines = WF.split("\n").filter((l) => /^\s*uses:\s+/.test(l));
    expect(usesLines.length).toBeGreaterThanOrEqual(3);
    for (const line of usesLines) {
      expect(line, line).toMatch(/uses:\s+[^@\s]+@[0-9a-f]{40}\b/);
    }
    expect(WF).toMatch(/actions\/upload-artifact@[0-9a-f]{40}/);
  });
  it("does not include a schedule trigger", () => {
    expect(WF).not.toMatch(/^\s*schedule:/m);
  });
  it("upload-artifact path block lists only the documented redacted local paths", () => {
    const m = WF.match(/path:\s*\|\s*\n([\s\S]*?)\n\s*if-no-files-found:/);
    expect(m, "expected `path: |` block before if-no-files-found").toBeTruthy();
    const paths = (m![1] ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(paths.sort()).toEqual(
      [
        "tmp/ecowitt-fast-path/",
        "tmp/ecowitt-last-ingest-report.json",
        "tmp/ecowitt-windows/",
      ].sort(),
    );
  });
  it("artifact generation step uses || true to allow log collection without masking test failures", () => {
    expect(WF).toMatch(/dev:ecowitt-fast-path[\s\S]*?\|\| true/);
    // The test step itself must NOT have || true.
    const testStep = WF.split("Vitest")[1]?.split("- name:")[0] ?? "";
    expect(testStep).not.toMatch(/\|\| true/);
  });
});
