/**
 * Grounding for the Pro "Ask about this cultivar" Q&A.
 *
 * Doctrine: sample/reference cultivars are context, not authority. The model may
 * ONLY answer from the profile context assembled here; it must refuse (say it
 * lacks the info) rather than invent flowering times, chemistry, potency,
 * terpene percentages, effects, medical claims, or guaranteed outcomes. This
 * module is pure and testable; the edge function reuses the same system prompt.
 */
import type { VerdantCultivarProfile } from "@/constants/verdantCultivars";

export const CULTIVAR_QA_MIN_QUESTION = 3;
export const CULTIVAR_QA_MAX_QUESTION = 500;

export const CULTIVAR_QA_SYSTEM_PROMPT = [
  "You are Verdant's cautious cannabis cultivation reference assistant.",
  "Answer ONLY using the CONTEXT block about a single sample/reference cultivar.",
  "If the CONTEXT does not contain the answer, say you don't have that information for this reference — do not guess.",
  "Never invent or state as fact: flowering times, potency or cannabinoid/terpene percentages, chemotype, effects, medical or therapeutic claims, or guaranteed outcomes.",
  "Everything is reported and varies by phenotype, environment, and lab method — frame answers that way.",
  "Remind the grower, when relevant, that their own plant's logs, stage, medium, source-labeled sensors, and observed response remain authoritative.",
  "Cite the bracketed source keys from the CONTEXT when you rely on them. Be concise (a short paragraph).",
].join(" ");

export interface CultivarQaMessage {
  role: "system" | "user";
  content: string;
}

export interface QuestionValidation {
  ok: boolean;
  reason?: "empty" | "too_short" | "too_long";
}

export function validateCultivarQuestion(raw: string): QuestionValidation {
  const q = (raw ?? "").trim();
  if (q.length === 0) return { ok: false, reason: "empty" };
  if (q.length < CULTIVAR_QA_MIN_QUESTION) return { ok: false, reason: "too_short" };
  if (q.length > CULTIVAR_QA_MAX_QUESTION) return { ok: false, reason: "too_long" };
  return { ok: true };
}

/**
 * Build the source-tagged, reported-framed context string from a cultivar
 * profile. Only fields the profile actually carries; no invented precision.
 */
export function buildCultivarQaContext(cultivar: VerdantCultivarProfile): string {
  const lines: string[] = [];
  lines.push(`Cultivar: ${cultivar.name}`);
  if (cultivar.aliases.length > 0) {
    lines.push(`Also searched as: ${cultivar.aliases.join(", ")}`);
  }
  lines.push(`Reported lineage: ${cultivar.lineage}`);
  lines.push(
    `Reported breeder/source: ${cultivar.breeder ?? "varies / disputed"}`,
  );
  lines.push(
    `Life cycle (reported): ${
      cultivar.lifeCycle === "autoflower" ? "autoflower" : "photoperiod"
    }`,
  );
  lines.push(`Reported difficulty: ${cultivar.difficulty}`);
  lines.push(`Reported flower window: ${cultivar.flowerWeeks}`);
  lines.push(`Market classification (reported): ${cultivar.marketClassification}`);
  lines.push(`Evidence state: ${cultivar.verificationStatus}`);

  const terpeneNames = cultivar.terpeneClaims
    .map((claim) => claim.terpene)
    .filter((name): name is string => Boolean(name));
  if (terpeneNames.length > 0) {
    lines.push(
      `Commonly reported terpene directions: ${[...new Set(terpeneNames)].join(", ")} (reported, varies by phenotype and lab method)`,
    );
  }

  const sourceKeys = [
    ...cultivar.sourceKeys,
    ...cultivar.terpeneClaims.map((c) => c.sourceKey),
    ...cultivar.cannabinoidClaims.map((c) => c.sourceKey),
  ].filter(Boolean);
  if (sourceKeys.length > 0) {
    lines.push(`Source keys: [${[...new Set(sourceKeys)].join("], [")}]`);
  }

  lines.push(
    "Note: this is a sample/reference profile. Values are reported and not guaranteed for any specific plant.",
  );
  return lines.join("\n");
}

/**
 * Assemble the LLM messages. `context` is the output of buildCultivarQaContext
 * (public profile data; safe to originate client-side). The system prompt is
 * the authoritative grounding/refusal boundary and is enforced server-side too.
 */
export function buildCultivarQaMessages(
  context: string,
  question: string,
): CultivarQaMessage[] {
  return [
    { role: "system", content: CULTIVAR_QA_SYSTEM_PROMPT },
    {
      role: "user",
      content: `CONTEXT:\n${context}\n\nQuestion: ${question.trim()}`,
    },
  ];
}
