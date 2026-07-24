import { describe, expect, it } from "vitest";
import {
  resolveGuideFaqFromHash,
  slugifyFaqQuestion,
} from "@/lib/guideFaqHashResolver";
import { findGuideBySlug } from "@/constants/verdantSeoContent";

const cannabis = findGuideBySlug("cannabis-plant-care");
const growDiary = findGuideBySlug("grow-diary-app");

describe("resolveGuideFaqFromHash", () => {
  it("returns null for null guide, empty hash, or non-matching hash", () => {
    expect(resolveGuideFaqFromHash(null, "#faq-0")).toBeNull();
    expect(resolveGuideFaqFromHash(cannabis, "")).toBeNull();
    expect(resolveGuideFaqFromHash(cannabis, "#nonsense")).toBeNull();
    expect(resolveGuideFaqFromHash(cannabis, undefined)).toBeNull();
  });

  it("resolves positional #faq-<n> and rejects out-of-range indices", () => {
    const r = resolveGuideFaqFromHash(cannabis, "#faq-2");
    expect(r).toEqual({ value: "faq-2", index: 2, matchedBy: "index" });
    expect(resolveGuideFaqFromHash(cannabis, "#faq-99")).toBeNull();
    expect(resolveGuideFaqFromHash(cannabis, "#faq--1")).toBeNull();
  });

  it("resolves cannabis-plant-care topic slugs to the expected FAQ", () => {
    expect(resolveGuideFaqFromHash(cannabis, "#topic-yellowing")).toEqual({
      value: "faq-2",
      index: 2,
      matchedBy: "topic",
    });
    expect(resolveGuideFaqFromHash(cannabis, "#topic-watering")?.index).toBe(0);
    expect(resolveGuideFaqFromHash(cannabis, "#topic-harvest")?.index).toBe(4);
    expect(resolveGuideFaqFromHash(cannabis, "#topic-unknown")).toBeNull();
  });

  it("does not apply cannabis topic slugs to other guides", () => {
    expect(resolveGuideFaqFromHash(growDiary, "#topic-yellowing")).toBeNull();
  });

  it("resolves a question-slug hash for any guide", () => {
    const q = growDiary!.faq[0]!.question;
    const slug = slugifyFaqQuestion(q);
    const r = resolveGuideFaqFromHash(growDiary, `#${slug}`);
    expect(r?.matchedBy).toBe("question-slug");
    expect(r?.index).toBe(0);
  });

  it("hash matching is case-insensitive and tolerates leading #", () => {
    expect(resolveGuideFaqFromHash(cannabis, "FAQ-1")?.index).toBe(1);
    expect(resolveGuideFaqFromHash(cannabis, "#Topic-Yellowing")?.index).toBe(2);
  });
});

describe("slugifyFaqQuestion", () => {
  it("produces deterministic kebab-case slugs and strips punctuation", () => {
    expect(slugifyFaqQuestion("Why are my leaves turning yellow?")).toBe(
      "why-are-my-leaves-turning-yellow",
    );
    expect(slugifyFaqQuestion("  Multiple   spaces & symbols!! ")).toBe(
      "multiple-spaces-symbols",
    );
  });
});
