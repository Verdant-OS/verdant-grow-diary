// Content-free AI observability properties. No prompts, completions, or images.

export const ANALYTICS_CONSENT_REQUEST_HEADER = "x-verdant-analytics-consent";

/** Feature label only. Raw user, grow, and session ids stay off the event. */
export function contentFreeAiSessionId(feature: string): string {
  const label =
    feature
      .trim()
      .toLowerCase()
      .split(":")[0]
      ?.replace(/[^a-z0-9_]/g, "") ?? "";
  return label.length > 0 ? label : "ai";
}

export type AiGenerationCaptureFields = {
  distinctId: string;
  sessionId: string;
  traceId: string;
  spanName: string;
  model: string;
  provider: string;
  providerResponse?: unknown;
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

/** OpenAI `usage` or Gemini `usageMetadata`, never the surrounding completion. */
export function extractTokenUsage(providerResponse: unknown): {
  inputTokens?: number;
  outputTokens?: number;
} {
  const root = asRecord(providerResponse);
  const usage = asRecord(root?.usage) ?? asRecord(root?.usageMetadata) ?? {};
  return {
    inputTokens: tokenCount(usage, ["prompt_tokens", "input_tokens", "promptTokenCount"]),
    outputTokens: tokenCount(usage, ["completion_tokens", "output_tokens", "candidatesTokenCount"]),
  };
}

/** Counts provider tool calls, including choices whose message content is null. */
export function countToolCalls(providerResponse: unknown): number {
  const root = asRecord(providerResponse);
  if (!root) return 0;
  let count = 0;
  if (Array.isArray(root.choices)) {
    for (const choice of root.choices) {
      const message = asRecord(asRecord(choice)?.message);
      if (Array.isArray(message?.tool_calls)) count += message.tool_calls.length;
    }
  }
  if (Array.isArray(root.candidates)) {
    for (const candidate of root.candidates) {
      const parts = asRecord(asRecord(candidate)?.content)?.parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        if (asRecord(part)?.functionCall !== undefined) count += 1;
      }
    }
  }
  return count;
}

/** Keeps a machine error class. Free text and payloads become `unclassified`. */
export function sanitizeErrorClass(error: string | undefined): string | undefined {
  if (error === undefined) return undefined;
  return /^[a-z0-9_]{1,64}$/i.test(error) ? error : "unclassified";
}

export function analyticsConsentGranted(headerValue: string | null): boolean {
  return headerValue === "granted";
}

export function requestGrantsAnalyticsCapture(req: Request): boolean {
  return analyticsConsentGranted(req.headers.get(ANALYTICS_CONSENT_REQUEST_HEADER));
}

export async function sendContentFreeAiGeneration(
  input: AiGenerationCaptureFields & { consentGranted: boolean },
  deps: {
    fetch: typeof fetch;
    endpoint: string | null;
    apiKey: string | null;
  },
): Promise<void> {
  if (!input.consentGranted || !deps.endpoint || !deps.apiKey) return;
  const { consentGranted: _consentGranted, ...fields } = input;
  const properties = contentFreeAiProperties(fields);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  try {
    await deps.fetch(deps.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: deps.apiKey,
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

export function contentFreeAiProperties(input: AiGenerationCaptureFields): Record<string, unknown> {
  const usage = extractTokenUsage(input.providerResponse);
  const properties: Record<string, unknown> = {
    distinct_id: input.distinctId,
    $ai_trace_id: input.traceId,
    $ai_session_id: input.sessionId,
    $ai_span_name: input.spanName,
    $ai_model: input.model,
    $ai_provider: input.provider,
    $ai_latency: Math.max(0, (performance.now() - input.startedAt) / 1_000),
    $ai_tool_call_count: countToolCalls(input.providerResponse),
  };
  if (usage.inputTokens !== undefined) properties.$ai_input_tokens = usage.inputTokens;
  if (usage.outputTokens !== undefined) properties.$ai_output_tokens = usage.outputTokens;
  if (input.httpStatus !== undefined) properties.$ai_http_status = input.httpStatus;
  const errorClass = sanitizeErrorClass(input.error);
  if (errorClass !== undefined) {
    properties.$ai_is_error = true;
    properties.$ai_error = errorClass;
  }
  return properties;
}
