import type { GrowContext } from "./postGrowReflectionTypes";

export const POST_GROW_REFLECTION_PROMPT_VERSION = "post-grow-reflection-v1";

export const POST_GROW_REFLECTION_REQUIRED_HEADINGS = [
  "**Executive Reflection**",
  "**Key Wins**",
  "**Repeat Next Run**",
  "**Adjust or Avoid**",
  "**Post-Harvest Specific Insights**",
  "**Pheno / Strain Notes**",
  "**Low-Risk Experiments for Next Run**",
  "**Data Confidence & Gaps**",
] as const;

type Jsonish = null | boolean | number | string | Jsonish[] | { [key: string]: Jsonish };

function stableValue(value: unknown): Jsonish {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "object") {
    const input = value as Record<string, unknown>;
    return Object.keys(input)
      .sort((a, b) => a.localeCompare(b))
      .reduce<Record<string, Jsonish>>((acc, key) => {
        acc[key] = stableValue(input[key]);
        return acc;
      }, {});
  }
  return null;
}

export function stableContextJson(context: GrowContext): string {
  return JSON.stringify(stableValue(context), null, 2);
}

export function buildPostGrowReflectionPrompt(context: GrowContext): string {
  const contextJson = stableContextJson(context);

  return `You are Verdant's cautious Post-Grow Reflection AI. Your only job is to produce evidence-based reflection from the complete structured history of one grow. You never speculate or over-claim.

Prompt version: ${POST_GROW_REFLECTION_PROMPT_VERSION}

### INPUT CONTEXT JSON
${contextJson}

### OUTPUT — EXACT STRUCTURE ONLY (no preamble, no extra sections)

**Executive Reflection**  
(1–2 sentences. Honest, data-grounded synthesis of the entire run.)

**Key Wins**  
- 3–6 bullets. Each must cite specific evidence from the supplied context: numbers, dates, event ids, or user notes.

**Repeat Next Run**  
- Evidence-backed recommendations. Prioritize environmental stability, low-stress techniques, root-zone correctness, and repeatable processes.

**Adjust or Avoid**  
- Evidence-backed adjustments. Never recommend aggressive changes from incomplete, conflicting, or single-run data.

**Post-Harvest Specific Insights**  
- Drying performance with weight-loss data when supplied.  
- Curing performance with RH stabilization, burp notes, smell progression, and final jar RH when supplied.  
- Link to final quality outcome only with cautious correlation language.

**Pheno / Strain Notes** (only if multiple plants or clear differential signals exist)  
- Standout traits worth tracking for future pheno selection or mother evaluation. Omit strong claims if plant-level data is thin.

**Low-Risk Experiments for Next Run**  
- 1–3 small, testable changes only.

**Data Confidence & Gaps**  
- Overall confidence: Low / Medium / High  
- Explicit list of missing or thin data that limits insight.

### NON-NEGOTIABLE RULES
- Every claim must be traceable to supplied data. Use exact numbers, dates, event ids, or user notes when available.
- Never claim causation from correlation. Use "coincided with", "correlated with", or "in this run".
- Stay conservative. Bias toward environmental stability, root health, low-stress canopy management, and repeatable quality.
- If data is thin, missing, stale, invalid, or conflicting, lower confidence and state the gap clearly.
- Respect autoflower vs photoperiod differences only where the supplied context supports it. For autoflowers, be extra cautious about stress and recovery recommendations.
- Do not recommend aggressive nutrient, irrigation, training, or equipment changes from weak evidence.
- Do not suggest device control, hands-off equipment behavior, or unattended equipment changes.
- Do not invent dry/cure checkpoints, quality scores, pheno differences, sensor coverage, or timestamps.
- Output must be deterministic for the same input context.`;
}
