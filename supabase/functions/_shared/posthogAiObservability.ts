// Manual PostHog AI Observability capture for Deno Edge Functions.
// Prompt and completion content is intentionally retained in $ai_* fields.

const POSTHOG_PROJECT_TOKEN_ENV = "POSTHOG_PROJECT_TOKEN";
const POSTHOG_HOST_ENV = "POSTHOG_HOST";
const CAPTURE_TIMEOUT_MS = 1_500;

export type AiChatMessage = {
  role: string;
  content: unknown;
};

type AiGenerationCapture = {
  distinctId: string;
  sessionId: string;
  traceId: string;
  spanName: string;
  model: string;
  provider: string;
  input: readonly AiChatMessage[];
  output?: unknown;
  usage?: unknown;
  tools?: unknown;
  requestUrl: string;
  httpStatus?: number;
  error?: string;
  startedAt: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function tokenCount(usage: Record<string, unknown>, names: readonly string[]): number | undefined {
  for (const name of names) {
    const value = finiteNumber(usage[name]);
    if (value !== undefined) return value;
  }
  return undefined;
}

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

/** Maps an OpenAI-compatible response to PostHog's manual output-choice schema. */
export function aiOutputChoices(providerResponse: unknown): Array<Record<string, unknown>> {
  const choices = asRecord(providerResponse)?.choices;
  if (!Array.isArray(choices)) return [];

  return choices.flatMap((choice) => {
    const message = asRecord(asRecord(choice)?.message);
    if (!message) return [];
    const role = typeof message.role === "string" ? message.role : "assistant";
    if (message.content !== undefined) return [{ role, content: message.content }];
    if (Array.isArray(message.tool_calls)) return [{ role, content: message.tool_calls }];
    return [];
  });
}

/**
 * Sends one provider request as a manual $ai_generation event. Capture errors
 * are intentionally isolated from the application request and never include
 * provider credentials or transport bodies in logs.
 */
export async function captureAiGeneration(input: AiGenerationCapture): Promise<void> {
  const configuration = posthogCaptureConfiguration();
  if (!configuration) return;

  const usage = asRecord(input.usage) ?? {};
  const properties: Record<string, unknown> = {
    distinct_id: input.distinctId,
    $ai_trace_id: input.traceId,
    $ai_session_id: input.sessionId,
    $ai_span_name: input.spanName,
    $ai_model: input.model,
    $ai_provider: input.provider,
    $ai_input: input.input,
    $ai_output_choices: aiOutputChoices(input.output),
    $ai_latency: Math.max(0, (performance.now() - input.startedAt) / 1_000),
    $ai_request_url: input.requestUrl,
  };
  const inputTokens = tokenCount(usage, ["prompt_tokens", "input_tokens", "promptTokenCount"]);
  const outputTokens = tokenCount(usage, ["completion_tokens", "output_tokens", "candidatesTokenCount"]);
  if (inputTokens !== undefined) properties.$ai_input_tokens = inputTokens;
  if (outputTokens !== undefined) properties.$ai_output_tokens = outputTokens;
  if (input.tools !== undefined) properties.$ai_tools = input.tools;
  if (input.httpStatus !== undefined) properties.$ai_http_status = input.httpStatus;
  if (input.error !== undefined) {
    properties.$ai_is_error = true;
    properties.$ai_error = input.error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS);
  try {
    await fetch(configuration.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: configuration.apiKey,
        event: "$ai_generation",
        properties,
      }),
      signal: controller.signal,
    });
  } catch {
    // Observability must not alter an AI result when PostHog is unavailable.
  } finally {
    clearTimeout(timer);
  }
}
