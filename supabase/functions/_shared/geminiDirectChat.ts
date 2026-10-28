// Server-only Gemini chat helper for AI Doctor and AI Coach.
//
// The Lovable AI gateway is not the provider. This module calls Google's
// OpenAI-compatible Gemini endpoint and keeps the same two models that those
// functions used on the gateway. Native ids were checked on 2026-10-11 against
// https://ai.google.dev/gemini-api/docs/models (page last updated 2026-10-09 UTC):
//   Gemini 3 Flash → gemini-3-flash-preview
//   Gemini 2.5 Flash → gemini-2.5-flash
// Endpoint checked the same day:
//   https://ai.google.dev/gemini-api/docs/openai
//   https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
//
// GEMINI_API_KEY is read from the server environment only. This module never
// logs the key, the Authorization header, or the request body. A missing key
// or an unpinned feature/tier fails closed before any network call. There is
// no model escalation: only the standard tier of the two features below.

export const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";

export const GEMINI_OPENAI_CHAT_COMPLETIONS_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

export const GEMINI_DIRECT_PROVIDER = "google-gemini" as const;

export type GeminiDirectFeature = "ai_doctor_review" | "ai_coach";

export type GeminiDirectTier = "standard";

export type GeminiDirectFailureReason =
  "missing_api_key" | "unsupported_feature" | "unsupported_tier";

export interface GeminiDirectRoute {
  provider: typeof GEMINI_DIRECT_PROVIDER;
  url: typeof GEMINI_OPENAI_CHAT_COMPLETIONS_URL;
  feature: GeminiDirectFeature;
  tier: GeminiDirectTier;
  /** Model id placed on the Gemini request. */
  geminiModelId: string;
  /** Historical gateway id kept for p_model_id recording. Not sent as `model`. */
  recordedModelId: string;
}

const STANDARD_ROUTES: Record<GeminiDirectFeature, GeminiDirectRoute> = {
  ai_doctor_review: {
    provider: GEMINI_DIRECT_PROVIDER,
    url: GEMINI_OPENAI_CHAT_COMPLETIONS_URL,
    feature: "ai_doctor_review",
    tier: "standard",
    geminiModelId: "gemini-3-flash-preview",
    recordedModelId: "google/gemini-3-flash-preview",
  },
  ai_coach: {
    provider: GEMINI_DIRECT_PROVIDER,
    url: GEMINI_OPENAI_CHAT_COMPLETIONS_URL,
    feature: "ai_coach",
    tier: "standard",
    geminiModelId: "gemini-2.5-flash",
    recordedModelId: "google/gemini-2.5-flash",
  },
};

export type GeminiDirectResolution =
  ({ ok: true } & GeminiDirectRoute) | { ok: false; reason: GeminiDirectFailureReason };

type EnvReader = { get(name: string): string | undefined };

export function readGeminiDirectApiKey(env: EnvReader): string | null {
  const value = env.get(GEMINI_API_KEY_ENV);
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value;
}

export function lookupGeminiDirectRoute(
  feature: string,
  tier: string,
):
  | ({ ok: true } & GeminiDirectRoute)
  | { ok: false; reason: "unsupported_feature" | "unsupported_tier" } {
  if (feature !== "ai_doctor_review" && feature !== "ai_coach") {
    return { ok: false, reason: "unsupported_feature" };
  }
  const route = STANDARD_ROUTES[feature];
  if (route.tier !== tier) return { ok: false, reason: "unsupported_tier" };
  return { ok: true, ...route };
}

export function resolveGeminiDirectChat(input: {
  feature: string;
  tier: string;
  apiKey: string | null | undefined;
}): GeminiDirectResolution {
  const route = lookupGeminiDirectRoute(input.feature, input.tier);
  if (!route.ok) return route;
  if (typeof input.apiKey !== "string" || input.apiKey.trim().length === 0) {
    return { ok: false, reason: "missing_api_key" };
  }
  return route;
}

export function buildGeminiDirectChatRequest(input: {
  apiKey: string;
  geminiModelId: string;
  signal?: AbortSignal;
  body: Record<string, unknown>;
}): RequestInit {
  const payload: Record<string, unknown> = {
    ...input.body,
    model: input.geminiModelId,
  };
  const init: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };
  if (input.signal !== undefined) init.signal = input.signal;
  return init;
}

export async function postGeminiDirectChat(input: {
  feature: string;
  tier: string;
  apiKey: string | null | undefined;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<
  | ({ ok: true; response: Response } & GeminiDirectRoute)
  | { ok: false; reason: GeminiDirectFailureReason }
> {
  const resolution = resolveGeminiDirectChat({
    feature: input.feature,
    tier: input.tier,
    apiKey: input.apiKey,
  });
  if (!resolution.ok) return resolution;
  const apiKey = input.apiKey;
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return { ok: false, reason: "missing_api_key" };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    resolution.url,
    buildGeminiDirectChatRequest({
      apiKey,
      geminiModelId: resolution.geminiModelId,
      signal: input.signal,
      body: input.body,
    }),
  );
  return { response, ...resolution };
}
