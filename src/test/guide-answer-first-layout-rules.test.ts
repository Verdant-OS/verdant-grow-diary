/**
 * Pure rules for the shared answer-first guide layout (#2650).
 * Pins sentence splitting (abbreviations, decimals), the lead/remainder split,
 * and source/FAQ filtering. Nothing is invented: blanks become null or [].
 */
import { describe, expect, it } from "vitest";
import {
  selectGuideAnswerFirstLayout,
  visibleGuideAnswerFirstFaqItem,
} from "@/lib/guideAnswerFirstLayoutRules";

describe("selectGuideAnswerFirstLayout: lead answer", () => {
  it("takes the first two sentences as the answer and keeps the rest", () => {
    const layout = selectGuideAnswerFirstLayout({
      answer: "  Water when the top inch is dry. Lift the pot to check. Then log it.  ",
    });
    expect(layout.answer).toBe("Water when the top inch is dry. Lift the pot to check.");
    expect(layout.answerRemainder).toBe("Then log it.");
  });

  it("keeps every sentence: lead + remainder equals the trimmed intro", () => {
    const intro = "One! Two? Three. Four.";
    const layout = selectGuideAnswerFirstLayout({ answer: intro });
    expect(`${layout.answer} ${layout.answerRemainder}`).toBe(intro);
  });

  it("does not split on abbreviations", () => {
    const layout = selectGuideAnswerFirstLayout({
      answer: "Use a meter, e.g. a cheap one. Check pH vs. EC daily. Done.",
    });
    expect(layout.answer).toBe("Use a meter, e.g. a cheap one. Check pH vs. EC daily.");
    expect(layout.answerRemainder).toBe("Done.");
  });

  it("does not split on decimals", () => {
    const layout = selectGuideAnswerFirstLayout({
      answer: "Aim for pH 6.2 in soil. Coco runs 5.8 to 6.0. Adjust slowly.",
    });
    expect(layout.answer).toBe("Aim for pH 6.2 in soil. Coco runs 5.8 to 6.0.");
    expect(layout.answerRemainder).toBe("Adjust slowly.");
  });

  it("does not split before a lowercase word", () => {
    const layout = selectGuideAnswerFirstLayout({ answer: "Feed at 1.5 mL. per litre. Next." });
    expect(layout.answer).toBe("Feed at 1.5 mL. per litre. Next.");
    expect(layout.answerRemainder).toBeNull();
  });

  it("keeps an unterminated tail and a short intro whole", () => {
    expect(selectGuideAnswerFirstLayout({ answer: "Just one sentence" })).toMatchObject({
      answer: "Just one sentence",
      answerRemainder: null,
    });
  });

  it("returns null for a missing or blank answer", () => {
    for (const answer of [undefined, null, "", "   "]) {
      const layout = selectGuideAnswerFirstLayout({ answer });
      expect(layout.answer).toBeNull();
      expect(layout.answerRemainder).toBeNull();
    }
  });
});

describe("selectGuideAnswerFirstLayout: question, source, FAQ", () => {
  it("trims the question and nulls a blank one", () => {
    expect(selectGuideAnswerFirstLayout({ question: "  When to water?  " }).question).toBe(
      "When to water?",
    );
    expect(selectGuideAnswerFirstLayout({ question: " " }).question).toBeNull();
  });

  it("picks the first source with both a label and an href", () => {
    const layout = selectGuideAnswerFirstLayout({
      sources: [
        null,
        { label: "No link", href: "  " },
        { label: " ", href: "https://a.example" },
        { label: " Extension guide ", href: " https://b.example " },
        { label: "Later", href: "https://c.example" },
      ],
    });
    expect(layout.source).toEqual({ label: "Extension guide", href: "https://b.example" });
  });

  it("returns no source when none is complete", () => {
    expect(selectGuideAnswerFirstLayout({ sources: [{ label: "x" }] }).source).toBeNull();
    expect(selectGuideAnswerFirstLayout({ sources: null }).source).toBeNull();
  });

  it("keeps only FAQ items with both a question and an answer, in order", () => {
    const layout = selectGuideAnswerFirstLayout({
      faq: [
        { question: "Q1", answer: "A1" },
        null,
        { question: "Q2", answer: " " },
        { question: " ", answer: "A3" },
        { question: " Q4 ", answer: " A4 " },
      ],
    });
    expect(layout.faq).toEqual([
      { question: "Q1", answer: "A1" },
      { question: "Q4", answer: "A4" },
    ]);
  });

  it("visibleGuideAnswerFirstFaqItem matches the layout filter", () => {
    expect(visibleGuideAnswerFirstFaqItem(null)).toBeNull();
    expect(visibleGuideAnswerFirstFaqItem({ question: "Q", answer: "" })).toBeNull();
    expect(visibleGuideAnswerFirstFaqItem({ question: " Q ", answer: " A " })).toEqual({
      question: "Q",
      answer: "A",
    });
  });

  it("returns an empty layout for missing input", () => {
    expect(selectGuideAnswerFirstLayout(null)).toEqual({
      question: null,
      answer: null,
      answerRemainder: null,
      source: null,
      faq: [],
    });
  });
});
