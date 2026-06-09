/**
 * Static guardrails for the Ecowitt PC dry-run operator workflow:
 *   - docs/integrations/ecowitt-pc-dry-run-runbook.md
 *   - scripts/dev/print-ecowitt-pc-checklist.ts
 *
 * Docs/script-only test: the safety guidance and the static-print guarantees
 * of the checklist script must not be silently dropped by future edits.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RUNBOOK_PATH = resolve(
  __dirname,
  "..",
  "..",
  "docs/integrations/ecowitt-pc-dry-run-runbook.md",
);
const CHECKLIST_PATH = resolve(
  __dirname,
  "..",
  "..",
  "scripts/dev/print-ecowitt-pc-checklist.ts",
);

const RUNBOOK = existsSync(RUNBOOK_PATH) ? readFileSync(RUNBOOK_PATH, "utf8") : "";
const CHECKLIST = existsSync(CHECKLIST_PATH) ? readFileSync(CHECKLIST_PATH, "utf8") : "";
// Strip block + line comments so safety scans only see executable code.
const CHECKLIST_CODE = CHECKLIST.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("ecowitt PC dry-run runbook — required content", () => {
  it("runbook exists", () => {
    expect(existsSync(RUNBOOK_PATH)).toBe(true);
  });

  it("contains the dry-run commands", () => {
    expect(RUNBOOK).toContain("bun run dev:ecowitt-mqtt:dry-run -- --sample --once");
    expect(RUNBOOK).toContain("bun run dev:ecowitt-mqtt:dry-run -- --once");
    expect(RUNBOOK).toContain("bun run dev:ecowitt-mqtt:dry-run -- --once --write-report");
  });

  it("contains an explicit 'do not paste bridge token' warning", () => {
    expect(RUNBOOK).toMatch(/never paste[\s\S]{0,80}VERDANT_BRIDGE_TOKEN|VERDANT_BRIDGE_TOKEN[\s\S]{0,80}never paste/i);
    expect(RUNBOOK).toMatch(/never paste the bridge token/i);
  });

  it("says the workflow performs no direct database writes", () => {
    expect(RUNBOOK).toMatch(/no direct database writes/i);
  });

  it("says the dry-run makes no network call", () => {
    expect(RUNBOOK).toMatch(/no network call/i);
  });

  it("documents the dry-run command before the real send command", () => {
    const dryRunIdx = RUNBOOK.indexOf("bun run dev:ecowitt-mqtt:dry-run");
    const realSendIdx = RUNBOOK.indexOf("bun run dev:ecowitt-mqtt -- --once");
    expect(dryRunIdx).toBeGreaterThan(-1);
    expect(realSendIdx).toBeGreaterThan(-1);
    expect(dryRunIdx).toBeLessThan(realSendIdx);
  });

  it("clearly gates the live send behind a clean dry-run", () => {
    expect(RUNBOOK).toMatch(/when live send is allowed/i);
    expect(RUNBOOK).toMatch(/only[\s\S]{0,40}after[\s\S]{0,40}dry-run/i);
    expect(RUNBOOK).toMatch(/gated[\s\S]{0,40}clean dry-run/i);
  });

  it("requires Live only through fresh_live and never promotes stale/invalid", () => {
    expect(RUNBOOK).toMatch(/fresh_live/);
    expect(RUNBOOK).toMatch(/never[\s\S]{0,40}promot[\s\S]{0,40}live/i);
  });

  it("forbids service_role, action queue, alerts, device control, automation", () => {
    expect(RUNBOOK).toMatch(/no\s+`?service_role`?/i);
    expect(RUNBOOK).toMatch(/no action queue writes/i);
    expect(RUNBOOK).toMatch(/no alerts/i);
    expect(RUNBOOK).toMatch(/no device control/i);
    expect(RUNBOOK).toMatch(/no automation/i);
  });

  it("covers the required operator sections A–J", () => {
    for (const heading of [
      "A. Required local tools",
      "B. Start the local pipeline",
      "C. Ecowitt app settings",
      "D. Confirm in MQTT Explorer",
      "E. Run the Verdant dry-run",
      "F. What to paste back for review",
      "G. What to NEVER paste",
      "H. When live send is allowed",
      "I. Real send command",
      "J. Verify in Verdant",
    ]) {
      expect(RUNBOOK).toContain(heading);
    }
  });
});

describe("print-ecowitt-pc-checklist — static safety", () => {
  it("checklist script exists", () => {
    expect(existsSync(CHECKLIST_PATH)).toBe(true);
  });

  it("contains no service_role reference in executable code", () => {
    expect(CHECKLIST_CODE).not.toMatch(/service[_-]?role/i);
  });

  it("does not import the Supabase SDK / client", () => {
    expect(CHECKLIST).not.toMatch(/@supabase\/supabase-js/);
    expect(CHECKLIST).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(CHECKLIST_CODE).not.toMatch(/\bimport\b/);
  });

  it("makes no network / fetch call", () => {
    expect(CHECKLIST_CODE).not.toMatch(/\bfetch\s*\(/);
    expect(CHECKLIST_CODE).not.toMatch(/\b(https?:\/\/|XMLHttpRequest|node:https|node:http)\b/);
  });

  it("performs no DB write methods", () => {
    expect(CHECKLIST_CODE).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
    expect(CHECKLIST_CODE).not.toMatch(/\.from\s*\(/);
  });

  it("does not contain device-control or action_queue strings in code", () => {
    expect(CHECKLIST_CODE).not.toMatch(/action_queue/i);
    expect(CHECKLIST_CODE).not.toMatch(/device_command|relay_on|valve_open|light_on/i);
  });

  it("writes no files (no fs write APIs)", () => {
    expect(CHECKLIST_CODE).not.toMatch(/writeFile|mkdir|appendFile|createWriteStream|rmSync|unlink/);
  });

  it("reads no env vars", () => {
    expect(CHECKLIST_CODE).not.toMatch(/process\.env/);
  });

  it("documents the dry-run command before the real send command", () => {
    const dryRunIdx = CHECKLIST.indexOf("bun run dev:ecowitt-mqtt:dry-run");
    const realSendIdx = CHECKLIST.indexOf("bun run dev:ecowitt-mqtt -- --once");
    expect(dryRunIdx).toBeGreaterThan(-1);
    expect(realSendIdx).toBeGreaterThan(-1);
    expect(dryRunIdx).toBeLessThan(realSendIdx);
  });

  it("warns never to paste the bridge token", () => {
    expect(CHECKLIST).toMatch(/VERDANT_BRIDGE_TOKEN/);
    expect(CHECKLIST).toMatch(/never paste/i);
  });
});
