/**
 * Static safety scan — AI Doctor Review Result contract + preview.
 *
 * The contract file intentionally lists banned wording as data to reject,
 * so we cannot reuse the generic string-literal scan. Instead we scan for
 * banned wording in user-visible copy (not inside an array/regex token
 * list), and assert no writes / model calls.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) =>
  stripSourceComments(readFileSync(resolve(ROOT, p), "utf8"));

const FILES = [
  "src/lib/aiDoctorReviewResultContract.ts",
  "src/lib/aiDoctorReviewResultViewModel.ts",
  "src/components/AiDoctorReviewResultPreview.tsx",
];

describe("ai doctor review result — static safety", () => {
  for (const path of FILES) {
    const src = read(path);

    it(`${path}: no DB writes`, () => {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.rpc\(/);
    });

    it(`${path}: no functions.invoke / fetch / model APIs`, () => {
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/openai|anthropic|gemini|gpt-/i);
    });

    // The contract intentionally lists "service_role" as a sensitive key
    // to strip; only the view-model and presenter must avoid the literal.
    if (!path.endsWith("aiDoctorReviewResultContract.ts")) {
      it(`${path}: no service_role literal`, () => {
        expect(src).not.toMatch(/service_role/);
      });
    }

    it(`${path}: no ai_doctor_sessions / action_queue / alerts / sensor_readings writes`, () => {
      expect(src).not.toMatch(/from\(["']ai_doctor_sessions["']\)/);
      expect(src).not.toMatch(/\baction_queue\b/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/from\(["']sensor_readings["']\)/);
    });
  }

  it("view-model + preview: no banned wording in user-visible copy", () => {
    const vm = read("src/lib/aiDoctorReviewResultViewModel.ts");
    const ui = read("src/components/AiDoctorReviewResultPreview.tsx");
    for (const src of [vm, ui]) {
      expect(src).not.toMatch(
        /\b(confirmed|certain|cured|guaranteed)\b/i,
      );
      expect(src).not.toMatch(
        /['"](live|synced|connected|imported)['"]/,
      );
    }
  });

  it("preview: never claims a diagnosis or shows a fake submit/send button", () => {
    const ui = read("src/components/AiDoctorReviewResultPreview.tsx");
    expect(ui).not.toMatch(/has diagnosed/i);
    expect(ui).not.toMatch(/AI diagnosed/i);
    expect(ui).not.toMatch(/Send AI request/i);
    expect(ui).not.toMatch(/Approve|Reject/);
  });
});
