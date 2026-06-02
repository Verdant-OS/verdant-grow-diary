/**
 * Static safety — AI Doctor Live Review (frontend + edge).
 *
 * Hardens the frontend live-review surface area against forbidden
 * patterns: no DB writes, no service_role / secrets / API keys in
 * frontend code, no device-control language, no banned wording, no
 * raw model text logging.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) =>
  stripSourceComments(readFileSync(resolve(ROOT, p), "utf8"));

const FRONTEND_FILES = [
  "src/lib/aiDoctorReviewRequestPacket.ts",
  "src/lib/aiDoctorReviewResponseAdapter.ts",
  "src/hooks/useAiDoctorLiveReview.ts",
  "src/components/PlantDetailAiDoctorLiveReview.tsx",
];

const EDGE_FILES = [
  "supabase/functions/ai-doctor-review/index.ts",
  "supabase/functions/ai-doctor-review/contract.ts",
];

describe("ai doctor live review — frontend static safety", () => {
  for (const path of FRONTEND_FILES) {
    const src = read(path);

    it(`${path}: no DB writes / rpc`, () => {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.rpc\(/);
    });

    it(`${path}: no secrets / service_role / api keys / model providers`, () => {
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/LOVABLE_API_KEY/);
      expect(src).not.toMatch(/sk-[a-z0-9-]+/i);
      expect(src).not.toMatch(/openai|anthropic|gemini|gpt-/i);
      expect(src).not.toMatch(/ai\.gateway\.lovable\.dev/);
    });

    it(`${path}: no writes to AI Doctor sessions / alerts / action_queue / sensor_readings`, () => {
      expect(src).not.toMatch(/from\(["']ai_doctor_sessions["']\)/);
      expect(src).not.toMatch(/\baction_queue\b/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/from\(["']sensor_readings["']\)/);
    });

    it(`${path}: no banned wording / device-control imperatives in copy`, () => {
      expect(src).not.toMatch(/\b(confirmed|certain|cured|guaranteed)\b/i);
      expect(src).not.toMatch(/['"](live|synced|connected|imported)['"]/);
      expect(src).not.toMatch(
        /\b(turn on|switch off|power the|toggle the)\b/i,
      );
    });

    it(`${path}: never logs raw packets, responses, or secrets`, () => {
      // Frontend must not log review responses or packets at all.
      expect(src).not.toMatch(/console\.(log|warn|info|debug)\s*\(/);
    });
  }
});

describe("ai doctor live review — edge static safety", () => {
  for (const path of EDGE_FILES) {
    const src = read(path);

    it(`${path}: no DB writes / rpc`, () => {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.rpc\(/);
    });

    it(`${path}: no writes to AI Doctor sessions / alerts / action_queue / sensor_readings`, () => {
      expect(src).not.toMatch(/from\(["']ai_doctor_sessions["']\)/);
      expect(src).not.toMatch(/from\(["']action_queue["']\)/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/from\(["']sensor_readings["']\)/);
    });

    it(`${path}: never echoes raw model body / packet / secrets in logs`, () => {
      // Allow safe status logs ("status=...") but no JSON.stringify of
      // response payloads or packets into console.log calls.
      const logCalls = src.match(/console\.log\([^)]*\)/g) ?? [];
      for (const call of logCalls) {
        expect(call).not.toMatch(/payload|candidate|packet|response|JSON\.stringify/);
        expect(call).not.toMatch(/LOVABLE_API_KEY|apiKey|Bearer/);
      }
    });
  }
});
