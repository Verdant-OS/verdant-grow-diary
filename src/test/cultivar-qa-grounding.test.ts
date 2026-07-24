import { describe, expect, it } from "vitest";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import {
  CULTIVAR_QA_MAX_QUESTION,
  CULTIVAR_QA_SYSTEM_PROMPT,
  buildCultivarQaContext,
  buildCultivarQaMessages,
  validateCultivarQuestion,
} from "@/lib/cultivarQaGrounding";

const cultivar = VERDANT_CULTIVARS.find((c) => c.slug === "gg4")!;

describe("validateCultivarQuestion", () => {
  it("rejects empty, too-short, and too-long; accepts a normal question", () => {
    expect(validateCultivarQuestion("   ").ok).toBe(false);
    expect(validateCultivarQuestion("a").reason).toBe("too_short");
    expect(validateCultivarQuestion("x".repeat(CULTIVAR_QA_MAX_QUESTION + 1)).reason).toBe(
      "too_long",
    );
    expect(validateCultivarQuestion("How long does it flower?").ok).toBe(true);
  });
});

describe("buildCultivarQaContext", () => {
  it("includes reported profile fields and source keys, framed as reported", () => {
    const ctx = buildCultivarQaContext(cultivar);
    expect(ctx).toContain(cultivar.name);
    expect(ctx).toContain(cultivar.lineage);
    expect(ctx).toContain(cultivar.flowerWeeks);
    expect(ctx.toLowerCase()).toContain("reported");
    expect(ctx.toLowerCase()).toContain("not guaranteed");
    expect(ctx).toMatch(/Source keys: \[/);
  });

  it("does not invent chemistry precision the profile lacks", () => {
    // No hard-coded "%" cannabinoid assertion is fabricated into the context.
    const ctx = buildCultivarQaContext(cultivar);
    expect(ctx).not.toMatch(/\bTHC\s*[:=]\s*\d/i);
  });
});

describe("CULTIVAR_QA_SYSTEM_PROMPT + buildCultivarQaMessages", () => {
  it("system prompt enforces grounding, refusal, and no fabrication", () => {
    const p = CULTIVAR_QA_SYSTEM_PROMPT.toLowerCase();
    expect(p).toContain("only using the context");
    expect(p).toContain("do not guess");
    expect(p).toMatch(/never invent/);
    expect(p).toMatch(/medical|therapeutic/);
    expect(p).toMatch(/guaranteed outcomes/);
    expect(p).toMatch(/authoritative/);
  });

  it("assembles system + user messages with the context and question", () => {
    const ctx = buildCultivarQaContext(cultivar);
    const messages = buildCultivarQaMessages(ctx, "  What is the reported lineage?  ");
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe(CULTIVAR_QA_SYSTEM_PROMPT);
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("CONTEXT:");
    expect(messages[1].content).toContain(ctx);
    expect(messages[1].content).toContain("What is the reported lineage?");
  });
});
