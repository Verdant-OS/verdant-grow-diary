// Content-free PostHog AI observability for Deno Edge Functions.
// Prompts, completions, tool schemas, and image bytes are never sent.

import {
  contentFreeAiSessionId,
  requestGrantsAnalyticsCapture,
  sendContentFreeAiGeneration,
  type AiGenerationCaptureFields,
} from "./lib/lib/posthogAiObservabilityRules.ts";

const POSTHOG_PROJECT_TOKEN_ENV = "POSTHOG_PROJECT_TOKEN";
const POSTHOG_HOST_ENV = "POSTHOG_HOST";

export { contentFreeAiSessionId, requestGrantsAnalyticsCapture };

type AiGenerationCapture = AiGenerationCaptureFields & {
  consentGranted: boolean;
};

function posthogCaptureConfiguration(): { apiKey: string; url: string } | null {
  const apiKey = Deno.env.get(POSTHOG_PROJECT_TOKEN_ENV);
  const host = Deno.env.get(POSTHOG_HOST_ENV);
  if (!apiKey || !host) {
    if (Deno.env.get("DENO_ENV") === "development") {
      const missing = !apiKey ? POSTHOG_PROJECT_TOKEN_ENV : POSTHOG_HOST_ENV;
      console.error(
        `${missing} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missing} is configured`,
      );
    }
    return null;
  }

  try {
    const url = new URL(host);
    if (url.protocol !== "https:") return null;
    url.pathname = "/i/v0/e/";
    url.search = "";
    url.hash = "";
    return { apiKey, url: url.toString() };
  } catch {
    return null;
  }
}

/**
 * Sends one provider request as a manual $ai_generation event. Capture errors
 * are isolated from the application request. The body is model, latency, token
 * counts, tool-call count, and error class.
 */
export function captureAiGeneration(input: AiGenerationCapture): void {
  const configuration = posthogCaptureConfiguration();
  const task = sendContentFreeAiGeneration(input, {
    fetch,
    endpoint: configuration?.url ?? null,
    apiKey: configuration?.apiKey ?? null,
  }).catch(() => {
    // Observability must not alter an AI result when PostHog is unavailable.
  });
  const runtime = (
    globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }
  ).EdgeRuntime;
  if (typeof runtime?.waitUntil === "function") {
    runtime.waitUntil(task);
    return;
  }
  void task;
}
