/**
 * AI Doctor 2.0 — Confidence Edge Function client.
 *
 * Pure, read-only client for the approved `calculate-confidence` Edge
 * Function. Engine-only: no Supabase writes, no alerts, no Action Queue,
 * no device control, no service_role, no bridge tokens.
 *
 * Failure mode is always a conservative Low fallback. The caller never
 * sees an exception from this module.
 */

export type ConfidenceLevel = "Low" | "Medium" | "High";

export interface ConfidenceResult {
  score: number; // 0..100, clamped
  level: ConfidenceLevel;
  explanation: string;
  conflicts_detected?: readonly string[];
}

export interface ConfidenceEdgeInput {
  context: unknown;
  visual_observations: unknown;
  model_output: unknown;
  version: string;
}

export interface ConfidenceEdgeClientOptions {
  accessToken: string | null | undefined;
  supabaseUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export const CONSERVATIVE_FALLBACK: ConfidenceResult = Object.freeze({
  score: 40,
  level: "Low",
  explanation:
    "Automated scoring unavailable. Using conservative default.",
});

function clampScore(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return Math.round(v);
}

function normalizeLevel(v: unknown): ConfidenceLevel | null {
  if (v === "Low" || v === "Medium" || v === "High") return v;
  return null;
}

function normalize(raw: unknown): ConfidenceResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const level = normalizeLevel(r.level);
  if (!level) return null;
  const score = clampScore(r.score);
  const explanation =
    typeof r.explanation === "string" && r.explanation.length > 0
      ? r.explanation
      : "Automated confidence result.";
  const conflicts = Array.isArray(r.conflicts_detected)
    ? (r.conflicts_detected.filter(
        (x) => typeof x === "string",
      ) as string[])
    : undefined;
  return {
    score,
    level,
    explanation,
    ...(conflicts ? { conflicts_detected: Object.freeze(conflicts) } : {}),
  };
}

export async function calculateConfidenceViaEdgeFunction(
  input: ConfidenceEdgeInput,
  options: ConfidenceEdgeClientOptions,
): Promise<ConfidenceResult> {
  const { accessToken, supabaseUrl, timeoutMs = 8000 } = options;
  if (!accessToken || typeof accessToken !== "string") {
    return CONSERVATIVE_FALLBACK;
  }
  if (!supabaseUrl) return CONSERVATIVE_FALLBACK;

  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/calculate-confidence`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        context: input.context,
        visual_observations: input.visual_observations,
        model_output: input.model_output,
        version: input.version,
      }),
      signal: controller.signal,
    });
    if (!res || typeof res.status !== "number" || res.status < 200 || res.status >= 300) {
      return CONSERVATIVE_FALLBACK;
    }
    const json = await res.json().catch(() => null);
    const normalized = normalize(json);
    return normalized ?? CONSERVATIVE_FALLBACK;
  } catch {
    return CONSERVATIVE_FALLBACK;
  } finally {
    clearTimeout(timer);
  }
}
