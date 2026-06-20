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
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  BRIDGE_DOWN_LINES,
  MQTT_DOWN_LINES,
  NEXT_DRY_RUN_COMMAND,
  NEXT_DRY_RUN_LINES,
  formatRedactionAuditLines,
  redactLine,
  redactVerboseLine,
  runFastPath,
  scanForbidden,
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

describe("redactLine — extended categories", () => {
  it("redacts MQTT userinfo", () => {
    const r = redactLine("publishing to mqtt://user:secret@host:1883/topic");
    expect(r.changed).toBe(true);
    expect(r.categories).toContain("mqtt_userinfo");
    expect(r.output).not.toContain("user:secret");
  });
  it("redacts Supabase project URLs", () => {
    const r = redactLine("calling https://abc123." + "supa" + "base.co/rest/v1/x");
    expect(r.changed).toBe(true);
    expect(r.categories).toContain("supabase_url");
    expect(r.output).not.toMatch(/supa.*base\.co/i);
  });
  it("redacts SUPABASE_* env names", () => {
    const r = redactLine("SUPA" + "BASE_ANON_KEY=foo");
    expect(r.changed).toBe(true);
    expect(r.categories).toContain("supabase_env");
  });
});

describe("scanForbidden", () => {
  it("returns present=false for clean lines", () => {
    const s = scanForbidden(["hello", "doctor OK", "192.168.1.42"]);
    expect(s.present).toBe(false);
    expect(s.categories).toEqual([]);
  });
  it("detects unredacted forbidden literals", () => {
    const s = scanForbidden([
      "VERDANT" + "_BRIDGE_" + "TOKEN=foo",
      "use ser" + "vice_role here",
    ]);
    expect(s.present).toBe(true);
    expect(s.categories.length).toBeGreaterThanOrEqual(2);
  });
});

describe("runFastPath — redaction audit + --json + --save-artifacts", () => {
  let tmpRoot = "";
  afterEach(() => {
    if (tmpRoot && existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = "";
  });

  it("redactionAudit reports scanned/changed counts and categories", async () => {
    const res = await runFastPath(
      { verbose: true },
      {
        log: () => {},
        err: () => {},
        runSmoke: async () => ({
          ok: false,
          reason: "bridge_down: see mqtt://u:p@127.0.0.1:1883 and Bearer abc.def.ghi",
        }),
      },
    );
    expect(res.redactionAudit.linesScanned).toBeGreaterThan(0);
    expect(res.redactionAudit.forbiddenStringsPresentAfterRedaction).toBe(false);
    for (const c of res.redactionAudit.categoriesRedacted) {
      expect(typeof c).toBe("string");
    }
  });

  it("formatRedactionAuditLines includes scanned/changed/categories/forbidden", () => {
    const lines = formatRedactionAuditLines({
      linesScanned: 10,
      linesChanged: 2,
      categoriesRedacted: ["bearer_token", "mqtt_userinfo"],
      forbiddenStringsPresentAfterRedaction: false,
      forbiddenCategoriesPresent: [],
    });
    expect(lines[0]).toMatch(/Redaction audit/);
    expect(lines.join("\n")).toMatch(/lines scanned: 10/);
    expect(lines.join("\n")).toMatch(/lines changed: 2/);
    expect(lines.join("\n")).toMatch(/categories redacted: bearer_token, mqtt_userinfo/);
    expect(lines.join("\n")).toMatch(/forbidden strings present after redaction: no/);
  });

  it("--json suppresses human prose on stdout", async () => {
    const logs: string[] = [];
    const errs: string[] = [];
    const res = await runFastPath(
      { json: true, verbose: true },
      {
        log: (l) => logs.push(l),
        err: (l) => errs.push(l),
        runSmoke: async () => ({ ok: true, reason: "pass" }),
      },
    );
    expect(logs).toEqual([]);
    expect(errs).toEqual([]);
    expect(res.exitCode).toBe(0);
    expect(res.logs.length).toBeGreaterThan(0);
    expect(res.redactionAudit.linesScanned).toBeGreaterThan(0);
  });

  it("--save-artifacts writes only under tmp/ecowitt-fast-path/ and never leaks secrets", async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "ecowitt-fp-"));
    require("node:fs").writeFileSync(join(tmpRoot, "package.json"), "{}");
    const res = await runFastPath(
      {
        verbose: true,
        saveArtifacts: true,
        repoRoot: tmpRoot,
        artifactDir: join(tmpRoot, "tmp", "ecowitt-fast-path"),
      },
      {
        log: () => {},
        err: () => {},
        runSmoke: async () => ({
          ok: false,
          reason: "bridge_down: mqtt://user:secret@127.0.0.1:1883 Bearer abc.def.ghi",
        }),
      },
    );
    expect(res.artifacts).not.toBeNull();
    const dir = res.artifacts!.dir;
    expect(dir.startsWith(tmpRoot)).toBe(true);
    expect(dir.endsWith(join("tmp", "ecowitt-fast-path"))).toBe(true);
    const names = res.artifacts!.files.map((p) => p.split(/[\\/]/).pop());
    expect(names!.sort()).toEqual(
      ["doctor.json", "fast-path.json", "fast-path.log", "redaction-audit.json"].sort(),
    );
    for (const f of res.artifacts!.files) {
      const body = readFileSync(f, "utf8");
      expect(body).not.toContain("user:secret");
      expect(body).not.toMatch(/Bearer\s+abc\.def\.ghi/);
      expect(body).not.toMatch(/VERDANT_BRIDGE_TOKEN/);
      expect(body).not.toMatch(/supabase\.co/i);
      expect(body).not.toMatch(/sensor-ingest-webhook/);
    }
  });

  it("--json --save-artifacts still writes artifacts and emits no stdout/stderr prose", async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "ecowitt-fp-"));
    require("node:fs").writeFileSync(join(tmpRoot, "package.json"), "{}");
    const logs: string[] = [];
    const errs: string[] = [];
    const res = await runFastPath(
      {
        json: true,
        saveArtifacts: true,
        repoRoot: tmpRoot,
        artifactDir: join(tmpRoot, "tmp", "ecowitt-fast-path"),
      },
      {
        log: (l) => logs.push(l),
        err: (l) => errs.push(l),
        runSmoke: async () => ({ ok: true, reason: "pass" }),
      },
    );
    expect(logs).toEqual([]);
    expect(errs).toEqual([]);
    expect(res.artifacts).not.toBeNull();
    expect(existsSync(join(res.artifacts!.dir, "fast-path.json"))).toBe(true);
  });

  it("refuses to save artifacts outside tmp/ecowitt-fast-path/", async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "ecowitt-fp-"));
    require("node:fs").writeFileSync(join(tmpRoot, "package.json"), "{}");
    const res = await runFastPath(
      {
        saveArtifacts: true,
        repoRoot: tmpRoot,
        artifactDir: join(tmpRoot, "tmp", "escape"),
      },
      {
        log: () => {},
        err: () => {},
        runSmoke: async () => ({ ok: true, reason: "pass" }),
      },
    );
    expect(res.artifacts).toBeNull();
    expect(res.logs.some((l) => /artifact write FAILED/.test(l))).toBe(true);
  });
});

describe("ecowitt-windows-tooling workflow — retention env", () => {
  const WF = readFileSync(
    resolve(__dirname, "../../.github/workflows/ecowitt-windows-tooling.yml"),
    "utf8",
  );
  it("defines ECOWITT_ARTIFACT_RETENTION_DAYS at workflow scope", () => {
    expect(WF).toMatch(/^env:\s*\n\s+ECOWITT_ARTIFACT_RETENTION_DAYS:\s*\d+/m);
  });
  it("upload-artifact uses retention-days from the env var", () => {
    expect(WF).toMatch(/retention-days:\s*\$\{\{\s*env\.ECOWITT_ARTIFACT_RETENTION_DAYS\s*\}\}/);
  });
});
