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

describe.each([
  ["src/pages/ActionDetail.tsx"],
  ["src/pages/ActionQueue.tsx"],
])("%s completion → follow-up wiring is shared and safe", (rel) => {
  const src = readFile(rel);

  it("routes the follow-up through the single shared writer", () => {
    // Both completion surfaces must use the one sanctioned writer so the
    // detail page and the queue list can never drift apart again.
    expect(src).toContain("maybeWriteActionFollowupDiaryEntry");
  });

  it("gates the follow-up on the completed transition only", () => {
    expect(src).toMatch(/new_status === "completed"[\s\S]{0,200}maybeWriteActionFollowupDiaryEntry/);
  });

  it("does not build follow-up drafts inline (no duplicated writer)", () => {
    expect(src.includes("buildActionFollowupDiaryDraft")).toBe(false);
  });

  it("does not insert into action_queue during the completion path", () => {
    expect(/from\(["']action_queue["']\)\s*\n?\s*\.insert/.test(src)).toBe(false);
  });

  it("does not write to sensor_readings during the completion path", () => {
    expect(/from\(["']sensor_readings["']\)\s*\n?\s*\.(insert|upsert|update|delete)/.test(src))
      .toBe(false);
  });
});

describe("writeActionFollowupDiaryEntry shared writer safety scan", () => {
  const raw = readFile("src/lib/writeActionFollowupDiaryEntry.ts");
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("builds the draft via the pure helper and checks idempotency", () => {
    expect(src).toContain("buildActionFollowupDiaryDraft");
    expect(src).toContain("followupMatchesAction");
    expect(src).toContain("ACTION_FOLLOWUP_EVENT_TYPE");
  });

  it("never sends user_id (auth.uid() default is the sole source)", () => {
    expect(src.includes("user_id")).toBe(false);
  });

  it("only writes diary_entries — no other tables, no forbidden capabilities", () => {
    expect(/from\(["']diary_entries["']\)/.test(src)).toBe(true);
    for (const forbidden of [
      'from("action_queue")',
      'from("sensor_readings")',
      "service_role",
      "bridge_token",
      "raw_payload",
      "functions.invoke",
      "ai-coach",
      "ai_doctor",
      ".rpc(",
      ".update(",
      ".delete(",
      ".upsert(",
    ]) {
      expect(src.includes(forbidden), `must not contain ${forbidden}`).toBe(false);
    }
  });
});

describe("actionFollowupRules helper safety scan", () => {
  const raw = readFile("src/lib/actionFollowupRules.ts");
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

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
