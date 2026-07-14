/**
 * Tests for diaryNoteFormatting — the pure formatter that cleans up
 * duplicated section labels, missing-space concat artifacts, and
 * container-label duplication in timeline / Recent Activity text.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeDiaryNoteText,
  formatDiaryNoteForLabeledContainer,
  parseDiaryNoteSections,
} from "@/lib/diaryNoteFormatting";

describe("normalizeDiaryNoteText — repeated labels + missing spaces", () => {
  it("collapses a doubled 'Response check:' prefix", () => {
    const out = normalizeDiaryNoteText(
      "Response check: Response check: Better. Nats gone.",
    );
    expect(out).toBe("Response check: Better. Nats gone.");
  });

  it("collapses consecutive duplicate 'Response check: Better.' sentences", () => {
    const out = normalizeDiaryNoteText(
      "Response check: Better. Response check: Better. Nats seem gone.",
    );
    expect(out).toBe("Response check: Better. Nats seem gone.");
  });

  it("repairs a missing space after a period ('Nats.Response' → 'Nats. Response')", () => {
    const out = normalizeDiaryNoteText(
      "Hard dry back eliminated Nats.Response check: Better.",
    );
    expect(out).toBe(
      "Hard dry back eliminated Nats. Response check: Better.",
    );
  });

  it("cleans the full reported bad pattern end-to-end", () => {
    const raw =
      "Response check: Better. Hard, dry back eliminated Nats.Response check: Better.Nats seem gone.";
    const out = normalizeDiaryNoteText(raw);
    // Both duplicates + missing spaces are repaired; grower content preserved.
    expect(out).toBe(
      "Response check: Better. Hard, dry back eliminated Nats. Nats seem gone.",
    );
    // No doubled label anywhere.
    expect(out).not.toMatch(/Response check:\s*Response check:/i);
    // No period-then-letter without a space.
    expect(out).not.toMatch(/[a-z]\.[A-Z]/);
  });

  it("preserves user-entered content verbatim when there is nothing to clean", () => {
    const raw = "Watered 500 ml. Runoff pH 6.4.";
    expect(normalizeDiaryNoteText(raw)).toBe(raw);
  });

  it("returns '' for null / undefined / empty input", () => {
    expect(normalizeDiaryNoteText(null)).toBe("");
    expect(normalizeDiaryNoteText(undefined)).toBe("");
    expect(normalizeDiaryNoteText("")).toBe("");
    expect(normalizeDiaryNoteText("   \t  ")).toBe("");
  });

  it("is deterministic — identical input → identical output", () => {
    const raw = "Response check: Better. Nats gone.";
    expect(normalizeDiaryNoteText(raw)).toBe(normalizeDiaryNoteText(raw));
  });

  it("does not remove non-duplicate meaningful content that looks similar", () => {
    const raw =
      "Response check: Better. Response check: Same. Response check: Worse.";
    // Distinct statuses are NOT duplicates — all three must survive.
    const out = normalizeDiaryNoteText(raw);
    expect(out).toContain("Better");
    expect(out).toContain("Same");
    expect(out).toContain("Worse");
  });

  it("does not add spaces inside decimals or numeric abbreviations", () => {
    const raw = "pH 6.4, EC 1.8, runoff 2.1 mS/cm.";
    expect(normalizeDiaryNoteText(raw)).toBe(raw);
  });
});

describe("formatDiaryNoteForLabeledContainer — no duplicated UI labels", () => {
  it("strips the redundant 'Response check:' prefix when the UI already says 'Response'", () => {
    const out = formatDiaryNoteForLabeledContainer(
      "Response check: Better. Nats gone.",
      "Response",
    );
    expect(out).toBe("Better. Nats gone.");
  });

  it("also strips a leading 'Response:' when the container label is 'Response'", () => {
    const out = formatDiaryNoteForLabeledContainer(
      "Response: Nats gone.",
      "Response",
    );
    expect(out).toBe("Nats gone.");
  });

  it("leaves the note alone when there is no matching leading label", () => {
    expect(
      formatDiaryNoteForLabeledContainer("Better. Nats gone.", "Response"),
    ).toBe("Better. Nats gone.");
  });

  it("still normalizes duplicated labels inside the value", () => {
    const out = formatDiaryNoteForLabeledContainer(
      "Response check: Response check: Better.",
      "Response",
    );
    expect(out).toBe("Better.");
  });

  it("handles the bad pattern when rendered inside a 'Response' container", () => {
    const out = formatDiaryNoteForLabeledContainer(
      "Response check: Better. Hard, dry back eliminated Nats.Response check: Better.Nats seem gone.",
      "Response",
    );
    expect(out).toBe(
      "Better. Hard, dry back eliminated Nats. Nats seem gone.",
    );
    expect(out).not.toMatch(/Response check:/i);
  });

  it("returns '' for empty note and never crashes on null container", () => {
    expect(formatDiaryNoteForLabeledContainer("", "Response")).toBe("");
    expect(formatDiaryNoteForLabeledContainer("Better.", "")).toBe("Better.");
  });

  it("is case-insensitive on the container label match", () => {
    expect(
      formatDiaryNoteForLabeledContainer("Response check: Better.", "response"),
    ).toBe("Better.");
  });
});

describe("parseDiaryNoteSections — structured section extraction", () => {
  it("returns a body-only shape when the note has no labeled sections", () => {
    const result = parseDiaryNoteSections("Watered 500 ml. All looked fine.");
    expect(result.body).toBe("Watered 500 ml. All looked fine.");
    expect(result.sections).toEqual([]);
  });

  it("extracts Observation / Action taken / Response / Follow-up / Result in a stable order", () => {
    const raw =
      "Follow-up: Recheck in 24h. Action taken: Watered 500 ml. Observation: Droopy lower fans. Result: Recovered by evening. Response: Better.";
    const { sections } = parseDiaryNoteSections(raw);
    expect(sections.map((s) => s.label)).toEqual([
      "Observation",
      "Action taken",
      "Response",
      "Follow-up",
      "Result",
    ]);
  });

  it("omits empty sections and dedupes exact-duplicate entries in one section", () => {
    const raw =
      "Response check: Better. Response check: Better. Observation: Droopy fans.";
    const { sections } = parseDiaryNoteSections(raw);
    const labels = sections.map((s) => s.label);
    expect(labels).toContain("Observation");
    expect(labels).toContain("Response check");
    const resp = sections.find((s) => s.label === "Response check")!;
    // Duplicate "Better." collapsed to one.
    expect(resp.text.match(/Better/g)?.length).toBe(1);
  });

  it("preserves grower-entered body text before the first labeled section", () => {
    const raw = "Quick note. Observation: Some yellowing on tips.";
    const { body, sections } = parseDiaryNoteSections(raw);
    expect(body).toBe("Quick note.");
    expect(sections[0]).toEqual({
      label: "Observation",
      text: "Some yellowing on tips.",
    });
  });
});
