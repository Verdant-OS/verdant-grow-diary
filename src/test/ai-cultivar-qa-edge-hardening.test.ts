import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VERDANT_CULTIVAR_SLUGS } from "@/constants/verdantCultivars";

const INDEX_PATH = resolve("supabase/functions/ai-cultivar-qa/index.ts");
const GROUNDING_PATH = resolve("supabase/functions/_shared/cultivarQaGrounding.ts");
const HOOK_PATH = resolve("src/hooks/useCultivarQa.ts");

const INDEX = readFileSync(INDEX_PATH, "utf8");
const GROUNDING = existsSync(GROUNDING_PATH) ? readFileSync(GROUNDING_PATH, "utf8") : "";
const HOOK = readFileSync(HOOK_PATH, "utf8");

describe("ai-cultivar-qa Edge hardening", () => {
  it("grounds every published cultivar from a server-owned allowlist", () => {
    expect(INDEX).toMatch(/from "\.\.\/_shared\/cultivarQaGrounding\.ts"/);
    expect(INDEX).not.toMatch(/\bbody\?*\.context\b|\bMAX_CONTEXT\b/);
    expect(HOOK).toMatch(/context:\s*buildCultivarQaContext\(cultivar\)/);
    expect(HOOK).toMatch(/hardened[\s\S]*?ignores this client-owned field/i);
    expect(GROUNDING).toMatch(/SERVER_CULTIVAR_QA_CONTEXTS/);

    for (const slug of VERDANT_CULTIVAR_SLUGS) {
      expect(GROUNDING).toContain(JSON.stringify(slug));
    }
  });

  it("bounds request bytes, question length, provider time, and model output", () => {
    expect(GROUNDING).toMatch(/CULTIVAR_QA_MAX_REQUEST_BYTES/);
    expect(GROUNDING).toMatch(/CULTIVAR_QA_MAX_QUESTION/);
    expect(GROUNDING).toMatch(/CULTIVAR_QA_MAX_OUTPUT_TOKENS/);
    expect(GROUNDING).toMatch(/CULTIVAR_QA_MAX_ANSWER_CHARS/);
    expect(INDEX).toMatch(/readBoundedJsonBody\(/);
    expect(INDEX).toMatch(/AbortController/);
    expect(INDEX).toMatch(/CULTIVAR_QA_PROVIDER_TIMEOUT_MS/);
    expect(INDEX).toMatch(/max_tokens:\s*CULTIVAR_QA_MAX_OUTPUT_TOKENS/);
    expect(INDEX).toMatch(/parseCultivarQaAnswer\(/);
    expect(INDEX.indexOf("clearTimeout(providerTimer)")).toBeGreaterThan(
      INDEX.indexOf("const providerBody = await readBoundedJsonBody"),
    );
  });

  it("keeps the existing paid-entitlement boundary without inventing credits", () => {
    expect(INDEX).toMatch(/loadUnionEntitlement/);
    expect(INDEX).toMatch(
      /entitlement\.isActive\s*&&\s*entitlement\.effectivePlanId\s*!==\s*"free"/,
    );
    expect(INDEX).not.toMatch(/ai_credit_spend|ai_credit_refund|ai_credit_attach_result/);
  });
});
