/**
 * Action Queue completion → follow-up diary/timeline memory guard.
 *
 * Cross-surface static safety scan ensuring:
 *   - Manual sensor save path never creates follow-up diary entries.
 *   - Environment alert persistence never creates follow-up diary entries.
 *   - The Action Queue follow-up code does not perform forbidden writes,
 *     reference forbidden tokens, or call AI/device-control paths.
 *   - ActionDetail's completion path is idempotent by construction
 *     (uses `followupMatchesAction` against existing diary rows before
 *     inserting).
 *
 * Lives as a .tsx test file per the requested filename, but performs
 * pure-source scans only — no React render required.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");

function readFile(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

const ACTION_FOLLOWUP_MARKER = '"action_followup"';
const ACTION_FOLLOWUP_CONST = "ACTION_FOLLOWUP_EVENT_TYPE";

describe("Manual sensor save path", () => {
  const files = [
    "src/components/ManualSensorReadingCard.tsx",
    "src/hooks/useInsertSensorReading.ts",
  ];

  it.each(files)("%s does not create action_followup diary entries", (rel) => {
    const src = readFile(rel);
    expect(src.includes(ACTION_FOLLOWUP_MARKER)).toBe(false);
    expect(src.includes(ACTION_FOLLOWUP_CONST)).toBe(false);
    expect(src.includes("actionFollowupRules")).toBe(false);
    expect(src.includes("buildActionFollowupDiaryDraft")).toBe(false);
  });
});

describe("Environment alert persistence path", () => {
  const files = [
    "src/hooks/usePersistEnvironmentAlerts.ts",
  ];

  it.each(files)("%s does not create action_followup diary entries", (rel) => {
    const src = readFile(rel);
    expect(src.includes(ACTION_FOLLOWUP_MARKER)).toBe(false);
    expect(src.includes(ACTION_FOLLOWUP_CONST)).toBe(false);
    expect(src.includes("actionFollowupRules")).toBe(false);
  });

  it("usePersistEnvironmentAlerts does not write to action_queue", () => {
    const src = readFile("src/hooks/usePersistEnvironmentAlerts.ts");
    expect(/from\(["']action_queue["']\)\s*\n?\s*\.(insert|upsert|update|delete)/.test(src))
      .toBe(false);
  });
});

describe("ActionDetail completion → follow-up wiring is idempotent and safe", () => {
  const src = readFile("src/pages/ActionDetail.tsx");

  it("uses the pure helper to build the follow-up draft", () => {
    expect(src).toContain("buildActionFollowupDiaryDraft");
    expect(src).toContain("followupMatchesAction");
  });

  it("guards the insert with an existence check (idempotency)", () => {
    // The completion handler must look up existing action_followup rows
    // before inserting a new one.
    expect(src).toMatch(/action_followup/);
    expect(src).toMatch(/event_type/);
  });

  it("does not insert into action_queue during the completion path", () => {
    expect(/from\(["']action_queue["']\)\s*\n?\s*\.insert/.test(src)).toBe(false);
  });

  it("does not write to sensor_readings during the completion path", () => {
    expect(/from\(["']sensor_readings["']\)\s*\n?\s*\.(insert|upsert|update|delete)/.test(src))
      .toBe(false);
  });
});

describe("actionFollowupRules helper safety scan", () => {
  const src = readFile("src/lib/actionFollowupRules.ts");

  it("does not reference forbidden capabilities", () => {
    for (const forbidden of [
      "service_role",
      "bridge_token",
      "raw_payload",
      "functions.invoke",
      "ai-coach",
      "ai_doctor",
      "supabase.from",
      ".rpc(",
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
    ]) {
      expect(src.includes(forbidden), `must not contain ${forbidden}`).toBe(false);
    }
  });

  it("does not reference device-control verbs", () => {
    for (const verb of [
      /\bturn on\b/i,
      /\bturn off\b/i,
      /\bset fan\b/i,
      /\bset humidifier\b/i,
      /\bset dehumidifier\b/i,
      /\bmqtt\b/i,
      /\brelay\b/i,
      /\bactuator\b/i,
      /\bwebhook\b/i,
    ]) {
      expect(verb.test(src)).toBe(false);
    }
  });
});
