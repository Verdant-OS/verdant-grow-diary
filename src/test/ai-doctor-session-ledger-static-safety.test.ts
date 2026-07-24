/**
 * Static safety regression — AI Doctor Session Integrity Ledger surface.
 *
 * The ledger is a read-only, owner-scoped persistence proof. These files must
 * never contain a DB write, an edge-function invocation, an Action Queue /
 * alert / automation / device-control path, a service-role reference, an AI
 * model call, or a live-telemetry read. Comments are stripped first so
 * docstrings that legitimately *describe* the forbidden patterns (to explain
 * why they are absent) cannot trip the scan.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");

const TARGET_PATHS = [
  "src/lib/aiDoctorSessionLedgerViewModel.ts",
  "src/hooks/useAiDoctorSessionLedger.ts",
  "src/components/AiDoctorSessionIntegrityLedger.tsx",
] as const;

const sources = TARGET_PATHS.map((path) => ({
  path,
  src: stripSourceComments(readFileSync(resolve(ROOT, path), "utf8")),
}));

describe("ai-doctor-session-ledger — static safety", () => {
  it.each(sources)("[$path] performs no DB write (insert/update/upsert/delete)", ({ src }) => {
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    // Note: URLSearchParams.delete is a URL concern and lives in the index
    // page, not in these files — the ledger surface has no `.delete(` at all.
    expect(src).not.toMatch(/\.delete\(/);
  });

  it.each(sources)("[$path] performs no RPC call", ({ src }) => {
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it.each(sources)("[$path] never invokes an edge function", ({ src }) => {
    expect(src).not.toMatch(/functions\.invoke/);
  });

  it.each(sources)("[$path] makes no direct network call (fetch/axios/XHR)", ({ src }) => {
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/\baxios\b/);
    expect(src).not.toMatch(/XMLHttpRequest/);
  });

  it.each(sources)("[$path] touches no Action Queue / alert surface", ({ src }) => {
    expect(src).not.toMatch(/action_queue/);
    expect(src).not.toMatch(/from\(\s*["']alerts["']\s*\)/);
    expect(src).not.toMatch(/from\(\s*["']alert_events["']\s*\)/);
  });

  it.each(sources)("[$path] never reads live sensor telemetry", ({ src }) => {
    expect(src).not.toMatch(/from\(\s*["']sensor_readings["']\s*\)/);
    expect(src).not.toMatch(/useGrowSensorReadings|fetchSensorReadings/);
  });

  it.each(sources)("[$path] references no service role or privileged bypass", ({ src }) => {
    expect(src.toLowerCase()).not.toContain("service_role");
    expect(src.toLowerCase()).not.toContain("service-role");
    expect(src).not.toMatch(/admin|staff/i);
  });

  it.each(sources)("[$path] makes no AI / model call and never re-runs the doctor", ({ src }) => {
    const lower = src.toLowerCase();
    for (const tok of [
      "ai-coach",
      "ai-doctor-review",
      "rundoctor",
      "run doctor",
      "generatediagnosis",
      "openai",
      "anthropic",
      "model.call",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });

  it.each(sources)("[$path] contains no automation / device-control path", ({ src }) => {
    const lower = src.toLowerCase();
    for (const tok of [
      "mqtt",
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home-assistant",
      "home_assistant",
      "smart plug",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });

  it.each(sources)("[$path] never selects or renders forbidden sensitive columns", ({ src }) => {
    // user_id, question, analysis, diagnosis, suggested_actions, and the
    // various confidence/context payloads must never be fetched or rendered
    // as data. Match only a *code position* — the column immediately after a
    // `.` (property access) or a `,`/quote (select-list membership) — so the
    // legitimate English word in the privacy caption ("...does not run a new
    // diagnosis...") is not a false positive.
    for (const forbidden of [
      "user_id",
      "question",
      "analysis",
      "diagnosis",
      "suggested_actions",
      "raw_confidence",
      "displayed_confidence",
      "context_confidence_ceiling",
      "context_sufficiency",
      "photo_url",
    ]) {
      const codePosition = new RegExp(`[.,"']\\s*${forbidden}\\b`);
      expect(src).not.toMatch(codePosition);
    }
  });

  it("the ledger data hook is the ONLY file here that touches supabase, and only for reads", () => {
    const viewModel = sources.find((s) => s.path.endsWith("aiDoctorSessionLedgerViewModel.ts"))!;
    const component = sources.find((s) => s.path.endsWith("AiDoctorSessionIntegrityLedger.tsx"))!;
    // The pure view model and the presenter must not import supabase at all.
    expect(viewModel.src).not.toMatch(/@\/integrations\/supabase/);
    expect(component.src).not.toMatch(/@\/integrations\/supabase/);
    // The hook may read, but only via select() — no mutation verbs anywhere.
    const hook = sources.find((s) => s.path.endsWith("useAiDoctorSessionLedger.ts"))!;
    expect(hook.src).toMatch(/\.select\(/);
    expect(hook.src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  });
});
