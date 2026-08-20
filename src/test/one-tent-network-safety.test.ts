import { describe, expect, it } from "vitest";

import {
  classifyOneTentForbiddenNetworkRequest,
  isOneTentAiDoctorReviewEndpoint,
} from "../../e2e/helpers/oneTentNetworkSafety";

describe("authenticated One-Tent forbidden network classifier", () => {
  it.each([
    "https://api.openai.com/v1/responses",
    "https://api.anthropic.com/v1/messages",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent",
    "https://api.mistral.ai/v1/chat/completions",
    "https://api.groq.com/openai/v1/chat/completions",
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    "https://example.supabase.co/functions/v1/ai-coach",
    "https://example.supabase.co/functions/v1/ai-cultivar-qa",
    "https://example.supabase.co/functions/v1/ai-doctor-review",
  ])("classifies paid-model endpoint %s", (url) => {
    expect(classifyOneTentForbiddenNetworkRequest(url)).toBe("paid_ai");
  });

  it.each([
    "https://example.supabase.co/functions/v1/device-command",
    "https://example.supabase.co/rest/v1/device_commands",
    "https://bridge.example.test/api/actuator/run",
    "mqtt://broker.example.test/tent/commands",
  ])("classifies device-control endpoint %s", (url) => {
    expect(classifyOneTentForbiddenNetworkRequest(url)).toBe("device_control");
  });

  it.each([
    "https://fonts.googleapis.com/css2?family=Inter",
    "http://127.0.0.1:5173/src/lib/actuatorRules.ts",
    "http://127.0.0.1:5173/src/routes/_app/ai-doctor.tsx",
    "http://127.0.0.1:5173/src/pages/AiDoctorStart.tsx",
    "not a url",
  ])("does not misclassify safe or malformed URL %s", (url) => {
    expect(classifyOneTentForbiddenNetworkRequest(url)).toBeNull();
  });

  it.each([
    "https://abcdefghijklmnopqrst.supabase.co/functions/v1/ai-doctor-review",
    "https://abcdefghijklmnopqrst.supabase.co/functions/v1/ai-doctor-review?trace=proof",
  ])("matches only the AI Doctor review Edge Function endpoint %s", (url) => {
    expect(isOneTentAiDoctorReviewEndpoint(url, "abcdefghijklmnopqrst")).toBe(true);
  });

  it.each([
    "http://127.0.0.1:5173/src/routes/_app/ai-doctor.tsx",
    "http://127.0.0.1:5173/src/pages/AiDoctorStart.tsx",
    "https://abcdefghijklmnopqrst.supabase.co/functions/v1/ai-coach",
    "https://attacker.invalid/functions/v1/ai-doctor-review",
    "https://abcdefghijklmnopqrst.supabase.co.attacker.invalid/functions/v1/ai-doctor-review",
    "http://abcdefghijklmnopqrst.supabase.co/functions/v1/ai-doctor-review",
    "https://abcdefghijklmnopqrst.supabase.co:444/functions/v1/ai-doctor-review",
    "not a url",
  ])("does not stub application modules or unrelated endpoints %s", (url) => {
    expect(isOneTentAiDoctorReviewEndpoint(url, "abcdefghijklmnopqrst")).toBe(false);
  });

  it("rejects a missing or malformed expected project ref", () => {
    const endpoint = "https://abcdefghijklmnopqrst.supabase.co/functions/v1/ai-doctor-review";
    expect(isOneTentAiDoctorReviewEndpoint(endpoint, "")).toBe(false);
    expect(isOneTentAiDoctorReviewEndpoint(endpoint, "example.attacker.invalid")).toBe(false);
    expect(
      isOneTentAiDoctorReviewEndpoint("https://a.supabase.co/functions/v1/ai-doctor-review", "a"),
    ).toBe(false);
    expect(
      isOneTentAiDoctorReviewEndpoint(
        "https://abcdefghijklmnopqrstu.supabase.co/functions/v1/ai-doctor-review",
        "abcdefghijklmnopqrstu",
      ),
    ).toBe(false);
  });
});
